import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchAltum,
  fetchBagApi,
  fetchBagVbo,
  fetchEnergielabel,
  fetchPdok,
  fetchRijksmonument,
  scrapeListing,
} from "./analyze.server";
import type { PrefillResult } from "./types";

const Schema = z.object({
  query: z.string().min(2).max(300),
  isUrl: z.boolean().optional(),
});

function extractHuisnummer(adres?: string): string | undefined {
  if (!adres) return undefined;
  const m = adres.match(/\b(\d+)([a-zA-Z]?)\b/);
  return m ? m[1] : undefined;
}

export const prefetchProperty = createServerFn({ method: "POST" })
  .inputValidator((i) => Schema.parse(i))
  .handler(async ({ data }): Promise<PrefillResult> => {
    const isUrl = data.isUrl ?? /^https?:\/\//i.test(data.query);

    // Best-effort Funda scrape (never blocks). Hard cap so the form always shows quickly.
    let funda: Awaited<ReturnType<typeof scrapeListing>> | null = null;
    let addressForPdok = data.query;
    if (isUrl) {
      const scrapePromise = scrapeListing(data.query).catch(() => null);
      const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 20000));
      funda = (await Promise.race([scrapePromise, timeoutPromise])) ?? null;
      if (funda?.adres) addressForPdok = funda.adres;
      else {
        const m = data.query.match(/\/([a-z0-9\-]+)\/(huis|appartement|object)\-([0-9]+)/i);
        if (m) addressForPdok = m[1].replace(/\-/g, " ");
      }
    }

    const pdok = await fetchPdok(addressForPdok).catch(() => null) ?? undefined;
    const huisnummer = extractHuisnummer(pdok?.adres) ?? extractHuisnummer(addressForPdok);

    const [bagWfs, bagApi, monument, energie, altum] = await Promise.all([
      fetchBagVbo(pdok?.bagId).catch(() => null),
      fetchBagApi(pdok?.bagId).catch(() => null),
      fetchRijksmonument(pdok?.lat, pdok?.lon).catch(() => ({ rijksmonument: false, beschermdGezicht: null })),
      fetchEnergielabel(pdok?.postcode, huisnummer).catch(() => null),
      fetchAltum(pdok?.postcode, huisnummer).catch(() => null),
    ]);

    const bag = bagApi ?? bagWfs ?? undefined;
    const fundaOk = !!funda && !funda.funda_debug?.blocked;

    const sources: Record<string, "funda" | "bag" | "ep_online"> = {};
    const prefill: PrefillResult["prefill"] = { sources };

    if (fundaOk && funda?.prijs) { prefill.asking_price = funda.prijs; sources.asking_price = "funda"; }

    if (fundaOk && funda?.m2) { prefill.living_area_m2 = funda.m2; sources.living_area_m2 = "funda"; }
    else if (bag?.oppervlakte) { prefill.living_area_m2 = bag.oppervlakte; sources.living_area_m2 = "bag"; }

    if (fundaOk && funda?.perceel_m2) { prefill.plot_area_m2 = funda.perceel_m2; sources.plot_area_m2 = "funda"; }

    if (fundaOk && funda?.kamers) { prefill.rooms = funda.kamers; sources.rooms = "funda"; }

    if (fundaOk && funda?.energielabel) { prefill.energielabel = funda.energielabel; sources.energielabel = "funda"; }
    else if (energie?.label) { prefill.energielabel = energie.label; sources.energielabel = "ep_online"; }

    if (fundaOk && funda?.bouwjaar) { prefill.build_year = funda.bouwjaar; sources.build_year = "funda"; }
    else if ((bag as any)?.bouwjaar) { prefill.build_year = (bag as any).bouwjaar; sources.build_year = "bag"; }

    return {
      query: data.query,
      isUrl,
      pdok,
      bag,
      energie: energie ? { label: energie.label } : null,
      altum: altum ?? null,
      monument: monument ?? { rijksmonument: false, beschermdGezicht: null },
      funda: fundaOk ? funda : null,
      prefill,
    };
  });
