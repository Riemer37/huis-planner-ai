import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildPrompt,
  callAnthropic,
  callLovableAI,
  cryptoRandomId,
  fallbackAI,
  fetchAltum,
  fetchBagApi,
  fetchBagVbo,
  fetchEnergielabel,
  fetchPdok,
  fetchRijksmonument,
  scrapeListing,
  synthesizeWoz,
} from "./analyze.server";
import type { PropertyAnalysis, PandType } from "./types";

const InputSchema = z.object({
  query: z.string().min(2).max(300),
  pandtype: z.enum(["woning", "nieuwbouw", "commercieel", "gemengd"]),
  isUrl: z.boolean().optional(),
});

function extractHuisnummer(adres?: string): string | undefined {
  if (!adres) return undefined;
  const m = adres.match(/\b(\d+)([a-zA-Z]?)\b/);
  return m ? m[1] : undefined;
}

export const analyzeProperty = createServerFn({ method: "POST" })
  .inputValidator((i) => InputSchema.parse(i))
  .handler(async ({ data }): Promise<PropertyAnalysis> => {
    const errors: Record<string, string> = {};
    const bronnen: string[] = ["PDOK"];
    const isUrl = data.isUrl ?? /^https?:\/\//i.test(data.query);

    // Stap 0: ScraperAPI als URL
    let listing: PropertyAnalysis["listing"] = undefined;
    let addressForPdok = data.query;
    if (isUrl) {
      const scraped = await scrapeListing(data.query).catch((e: any) => {
        errors.scraper = String(e?.message ?? e);
        return null;
      });
      if (scraped) {
        listing = scraped;
        bronnen.push("ScraperAPI");
        if (scraped.adres) addressForPdok = scraped.adres;
      } else {
        listing = { url: data.query, bron: "manual" };
        const m = data.query.match(/\/([a-z0-9\-]+)\/(huis|appartement|object)\-([0-9]+)/i);
        if (m) addressForPdok = m[1].replace(/\-/g, " ");
      }
    }

    // Fase 1: PDOK
    let pdok: PropertyAnalysis["pdok"];
    try {
      const r = await fetchPdok(addressForPdok);
      if (r) pdok = r;
      else errors.pdok = "Adres niet gevonden in PDOK";
    } catch (e: any) {
      errors.pdok = e.message;
    }

    const huisnummer = extractHuisnummer(pdok?.adres) ?? extractHuisnummer(addressForPdok);

    // Fase 2: parallelle data-ophaal
    const [bagWfs, bagApi, monument, energie, altum] = await Promise.all([
      fetchBagVbo(pdok?.bagId).catch((e: any) => {
        errors.bag_wfs = String(e?.message ?? e);
        return null;
      }),
      fetchBagApi(pdok?.bagId).catch((e: any) => {
        errors.bag_api = String(e?.message ?? e);
        return null;
      }),
      fetchRijksmonument(pdok?.lat, pdok?.lon).catch((e: any) => {
        errors.monument = String(e?.message ?? e);
        return { rijksmonument: false, beschermdGezicht: null };
      }),
      fetchEnergielabel(pdok?.postcode, huisnummer).catch((e: any) => {
        errors.ep_online = String(e?.message ?? e);
        return null;
      }),
      fetchAltum(pdok?.postcode, huisnummer).catch((e: any) => {
        errors.altum = String(e?.message ?? e);
        return null;
      }),
    ]);

    const bag = bagApi ?? bagWfs;
    if (bagApi) bronnen.push("BAG API");
    else if (bagWfs) bronnen.push("BAG WFS");
    if (monument?.rijksmonument) bronnen.push("RCE Monumenten");
    if (energie) bronnen.push("EP Online");
    if (altum) bronnen.push("Altum AI");

    // Fase 3: AI primair (Lovable) + secundair (Anthropic) parallel
    const prompt = buildPrompt({
      query: data.query,
      pandtype: data.pandtype,
      pdok,
      bag,
      monument,
      listing,
      altum,
      energie,
      isUrl,
    });

    const [primary, secondary] = await Promise.all([
      callLovableAI(prompt).catch((e: any) => {
        errors.ai = e.message;
        return fallbackAI(data.pandtype);
      }),
      callAnthropic(prompt).catch(() => null),
    ]);

    if (primary) bronnen.push("Lovable AI");
    if (secondary) bronnen.push("Anthropic");

    // Energielabel — Funda is primair, EP-online verificatie. NOOIT raden.
    const fundaLabel = listing?.energielabel?.toUpperCase().trim();
    const epLabel = energie?.label?.toUpperCase().trim();
    console.log(`[ENERGIELABEL] funda="${fundaLabel ?? ""}" ep_online="${epLabel ?? ""}" isUrl=${isUrl}`);
    let energielabel: PropertyAnalysis["energielabel"];
    if (fundaLabel && epLabel) {
      const conflict = fundaLabel !== epLabel;
      energielabel = {
        label: fundaLabel,
        bron: "Funda listing",
        label_secondary: epLabel,
        bron_secondary: "EP-online",
        conflict,
      };
    } else if (fundaLabel) {
      energielabel = { label: fundaLabel, bron: "Funda listing" };
    } else if (epLabel) {
      energielabel = { label: epLabel, bron: "EP-online" };
    } else {
      // Niet raden — toon Onbekend met duidelijke bron-indicatie
      energielabel = { label: "Onbekend", bron: isUrl ? "Niet gevonden in listing" : "Niet beschikbaar" };
    }
    console.log(`[ENERGIELABEL] FINAL label="${energielabel.label}" bron="${energielabel.bron}"`);

    // Apartment-detectie — perceel hoort dan niet bij de unit
    const txt = `${listing?.beschrijving ?? ""} ${listing?.adres ?? ""} ${pdok?.adres ?? ""}`;
    const aptKeywords = /(appartement|bovenwoning|benedenwoning|portiek|maisonnette|galerij|etage|flat)/i;
    const gd = (bag?.gebruiksdoel ?? "").toLowerCase();
    const isApt =
      data.pandtype !== "commercieel" &&
      (((bag as any)?.vbos ?? 0) > 1 ||
        aptKeywords.test(txt) ||
        (gd.includes("woonfunctie") && (bag?.oppervlakte ?? 999) < 110 && !listing?.m2));

    // Databronnen-overzicht
    const databronnen: { naam: string; data: string; status: "ok" | "fail" | "estimate" }[] = [
      { naam: "PDOK Locatieserver", data: pdok?.adres ?? "—", status: pdok ? "ok" : "fail" },
      { naam: "BAG (Kadaster)", data: bag?.oppervlakte ? `${bag.oppervlakte} m² · ${bag.gebruiksdoel ?? "—"}` : "—", status: bag ? "ok" : "fail" },
      { naam: "EP-online energielabel", data: epLabel ?? "—", status: epLabel ? "ok" : "fail" },
      { naam: "Funda listing", data: fundaLabel ? `Label ${fundaLabel}` : (listing?.bron === "scraperapi" ? "Geen label" : "—"), status: listing?.bron === "scraperapi" ? "ok" : (isUrl ? "fail" : "estimate") },
      { naam: "RCE Rijksmonumenten", data: monument?.rijksmonument ? "Rijksmonument" : "Geen monument", status: monument ? "ok" : "fail" },
      { naam: "Altum AI waarde-indicatie", data: altum?.marktwaarde ? `€${altum.marktwaarde}` : "—", status: altum ? "ok" : "estimate" },
      { naam: "Lovable AI analyse", data: `Score ${primary.score}/10 · ${primary.advies}`, status: errors.ai ? "fail" : "ok" },
    ];

    const result: PropertyAnalysis = {
      id: cryptoRandomId(),
      timestamp: Date.now(),
      input: data.query,
      pandtype: data.pandtype as PandType,
      listing,
      pdok: pdok ?? { adres: data.query },
      bag: bag ?? undefined,
      monument: monument ?? { rijksmonument: false, beschermdGezicht: null },
      ai: primary,
      ai_secondary: secondary ?? undefined,
      altum: altum ?? null,
      errors,
      bronnen,
      woz: altum?.woz_geschat
        ? synthesizeWoz(altum.woz_geschat * 1.1)
        : synthesizeWoz(primary.marktwaarde_ai),
      energielabel,
      is_apartment: isApt,
      perceel_m2: data.pandtype === "commercieel" || isApt ? undefined : 120,
      databronnen,
    };
    return result;
  });
