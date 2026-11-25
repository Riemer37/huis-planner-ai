import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  fetchBagApi,
  fetchBagVbo,
  fetchEnergielabel,
  fetchPdok,
  fetchRijksmonument,
  fetchWozWaardeloket,
  scrapeListing,
} from "./analyze.server";

export type Bron = "funda" | "bag" | "ep_online" | "woz_loket" | "pdok" | "rce";

export interface PrefillData {
  adres?: string;
  postcode?: string;
  woonplaats?: string;
  gemeente?: string;
  buurt?: string;
  buurtcode?: string;
  lat?: number;
  lon?: number;
  bag_id?: string;
  funda_url?: string;
  vraagprijs?: number;
  woonoppervlakte_m2?: number;
  perceel_m2?: number;
  bouwjaar?: number;
  kamers?: number;
  slaapkamers?: number;
  energielabel?: string;
  woz_waarde?: number;
  woz_jaar?: number;
  gebruiksdoel?: string;
  erfpacht?: boolean;
  rijksmonument?: boolean;
  bronnen: Record<string, Bron>;
  meldingen: string[];
}

function huisnummerUit(adres?: string) {
  const m = adres?.match(/\b(\d+)([a-zA-Z]?)\b/);
  return m ? m[1] : undefined;
}

function adresUitFundaUrl(url: string) {
  const m = url.match(/\/([a-z0-9-]+)\/(huis|appartement|object)-[0-9]+(?:-([a-z0-9-]+))?/i);
  if (!m) return undefined;
  return [m[3], m[1]].filter(Boolean).join(" ").replace(/-/g, " ");
}

/** Haalt alle bekende gegevens op voor een adres of Funda-link (zonder AI). */
export const prefillPand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ query: z.string().trim().min(3).max(300) }).parse(i))
  .handler(async ({ data }): Promise<PrefillData> => {
    const out: PrefillData = { bronnen: {}, meldingen: [] };
    const isUrl = /^https?:\/\//i.test(data.query);
    let adresZoek = data.query;

    if (isUrl) {
      out.funda_url = data.query;
      const listing = await scrapeListing(data.query).catch(() => null);
      if (listing && !listing.funda_debug?.blocked) {
        const set = <K extends keyof PrefillData>(k: K, v: PrefillData[K] | undefined) => {
          if (v !== undefined && v !== null && v !== ("" as any)) {
            out[k] = v;
            out.bronnen[k as string] = "funda";
          }
        };
        set("vraagprijs", listing.vraagprijs ?? listing.prijs);
        set("woonoppervlakte_m2", listing.m2);
        set("perceel_m2", listing.perceel_m2);
        set("bouwjaar", listing.bouwjaar);
        set("kamers", listing.kamers);
        set("slaapkamers", listing.slaapkamers);
        set("energielabel", listing.energielabel?.toUpperCase());
        set("erfpacht", listing.erfpacht);
        if (listing.adres) adresZoek = listing.adres;
      } else {
        out.meldingen.push("Funda-pagina kon niet worden opgehaald. Vul vraagprijs en m² zelf in.");
        adresZoek = adresUitFundaUrl(data.query) ?? data.query;
      }
    }

    const pdok = await fetchPdok(adresZoek).catch(() => null);
    if (!pdok) {
      out.meldingen.push("Adres niet gevonden bij PDOK. Controleer de spelling.");
      if (!isUrl) out.adres = data.query;
      return out;
    }
    Object.assign(out, {
      adres: pdok.adres,
      postcode: pdok.postcode,
      woonplaats: pdok.woonplaats,
      gemeente: pdok.gemeente,
      buurt: pdok.buurt,
      buurtcode: pdok.buurtcode,
      lat: pdok.lat,
      lon: pdok.lon,
      bag_id: pdok.bagId,
    });
    out.bronnen.adres = "pdok";

    const huisnummer = huisnummerUit(pdok.adres) ?? huisnummerUit(adresZoek);
    const [bagApi, bagWfs, energie, woz, monument] = await Promise.all([
      fetchBagApi(pdok.bagId).catch(() => null),
      fetchBagVbo(pdok.bagId).catch(() => null),
      fetchEnergielabel(pdok.postcode, huisnummer).catch(() => null),
      fetchWozWaardeloket(pdok.nummeraanduidingId).catch(() => null),
      fetchRijksmonument(pdok.lat, pdok.lon).catch(() => null),
    ]);

    const oppervlakte = bagApi?.oppervlakte ?? bagWfs?.oppervlakte;
    if (oppervlakte && !out.woonoppervlakte_m2) {
      out.woonoppervlakte_m2 = oppervlakte;
      out.bronnen.woonoppervlakte_m2 = "bag";
    }
    if (bagWfs?.bouwjaar && !out.bouwjaar) {
      out.bouwjaar = bagWfs.bouwjaar;
      out.bronnen.bouwjaar = "bag";
    }
    const gebruiksdoel = bagApi?.gebruiksdoel ?? bagWfs?.gebruiksdoel;
    if (gebruiksdoel) {
      out.gebruiksdoel = gebruiksdoel;
      out.bronnen.gebruiksdoel = "bag";
    }
    // Officieel label (EP-online) gaat voor Funda
    if (energie?.label && energie.label !== "?") {
      out.energielabel = energie.label.toUpperCase();
      out.bronnen.energielabel = "ep_online";
    }
    if (woz?.length) {
      const laatste = [...woz].sort((a, b) => b.jaar - a.jaar)[0];
      out.woz_waarde = laatste.waarde;
      out.woz_jaar = laatste.jaar;
      out.bronnen.woz_waarde = "woz_loket";
    }
    if (monument) {
      out.rijksmonument = monument.rijksmonument;
      out.bronnen.rijksmonument = "rce";
    }
    if (!out.energielabel) out.meldingen.push("Geen energielabel gevonden.");
    return out;
  });
