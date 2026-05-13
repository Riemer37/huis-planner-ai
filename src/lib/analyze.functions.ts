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
import type { PropertyAnalysis, PandType, Listing } from "./types";

const ManualInputSchema = z
  .object({
    energielabel: z.string().optional(),
    living_area_m2: z.number().optional(),
    plot_area_m2: z.number().optional(),
    plot_not_applicable: z.boolean().optional(),
    asking_price: z.number().optional(),
    rooms: z.number().optional(),
    build_year: z.number().optional(),
    woning_type: z.string().optional(),
    staat: z.string().optional(),
    erfpacht: z.boolean().optional(),
    bijzonderheden: z.string().optional(),
  })
  .optional();

const InputSchema = z.object({
  query: z.string().min(2).max(300),
  pandtype: z.enum(["woning", "nieuwbouw", "commercieel", "gemengd"]),
  isUrl: z.boolean().optional(),
  manualInput: ManualInputSchema,
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
    const manual = data.manualInput;
    const hasManual = !!manual;

    // Stap 0: Scraping ALLEEN als er géén manual input is. Bij manual input is de gebruiker autoriteit.
    let listing: PropertyAnalysis["listing"] = undefined;
    let addressForPdok = data.query;
    if (hasManual) {
      // Bouw listing direct uit manual input — 100% betrouwbaar, geen scraping
      const desc: string[] = [];
      if (manual!.woning_type) desc.push(`Type woning: ${manual!.woning_type}`);
      if (manual!.staat) desc.push(`Staat van onderhoud: ${manual!.staat}`);
      if (typeof manual!.erfpacht === "boolean") desc.push(`Erfpacht: ${manual!.erfpacht ? "ja" : "nee"}`);
      if (manual!.bijzonderheden) desc.push(`Bijzonderheden: ${manual!.bijzonderheden}`);
      const built: Listing = {
        url: isUrl ? data.query : undefined,
        prijs: manual!.asking_price,
        vraagprijs: manual!.asking_price,
        m2: manual!.living_area_m2,
        bouwjaar: manual!.build_year,
        perceel_m2: manual!.plot_not_applicable ? undefined : manual!.plot_area_m2,
        energielabel: manual!.energielabel,
        kamers: manual!.rooms,
        erfpacht: manual!.erfpacht,
        beschrijving: desc.join(". "),
        bron: "manual",
      };
      listing = built;
      bronnen.push("Handmatige invoer");
      // Probeer adres uit URL af te leiden voor PDOK
      if (isUrl) {
        const m = data.query.match(/\/([a-z0-9\-]+)\/(huis|appartement|object)\-([0-9]+)/i);
        if (m) addressForPdok = m[1].replace(/\-/g, " ");
      }
    } else if (isUrl) {
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

    // Energielabel — STRIKT GESCHEIDEN bronnen.
    // - Funda URL ingevoerd → ALLEEN Funda label (geen EP-online fallback). Mist het, dan handmatige invoer.
    // - Adres ingevoerd → ALLEEN EP-online (officieel).
    if (listing?.funda_debug?.blocked) {
      errors.funda_blocked = "FUNDA BLOCKED — real page not returned";
    }
    const fundaLabelRaw = listing?.energielabel?.toUpperCase().trim();
    const fundaLabel = listing?.funda_debug?.blocked ? undefined : fundaLabelRaw;
    const epLabel = energie?.label?.toUpperCase().trim();
    console.log(`[ENERGIELABEL] funda="${fundaLabel ?? ""}" ep_online="${epLabel ?? ""}" isUrl=${isUrl} hasManual=${hasManual}`);
    let energielabel: PropertyAnalysis["energielabel"];
    if (hasManual && manual!.energielabel) {
      energielabel = { label: manual!.energielabel.toUpperCase(), bron: "Handmatig", source_kind: "handmatig" };
    } else if (isUrl) {
      // Funda-pad — geen vermenging met EP-online
      if (fundaLabel) {
        energielabel = { label: fundaLabel, bron: "Funda", source_kind: "funda" };
      } else {
        energielabel = { label: "Onbekend", bron: "Niet gevonden op Funda — voer handmatig in", needs_manual: true, source_kind: "none" };
      }
    } else {
      // Adres-pad — alleen EP-online
      if (epLabel) {
        energielabel = { label: epLabel, bron: "EP-online (officieel)", source_kind: "ep_online" };
      } else {
        energielabel = { label: "Onbekend", bron: "Niet gevonden in EP-online — voer handmatig in", needs_manual: true, source_kind: "none" };
      }
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
      { naam: "Funda listing", data: listing?.funda_debug?.blocked ? "Geblokkeerd / geen echte pagina" : fundaLabel ? `Label ${fundaLabel}` : ((listing?.bron === "apify" || listing?.bron === "scraperapi") ? "Geen label" : "—"), status: listing?.funda_debug?.blocked ? "fail" : (listing?.bron === "apify" || listing?.bron === "scraperapi") ? "ok" : (isUrl ? "fail" : "estimate") },
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
      perceel_m2: data.pandtype === "commercieel" || isApt ? undefined : (listing?.perceel_m2 ?? 120),
      databronnen,
      field_sources: {
        adres: pdok ? "bag" : "schatting",
        woonplaats: pdok ? "bag" : "schatting",
        buurt: pdok?.buurt ? "bag" : "schatting",
        living_area_m2: hasManual && manual!.living_area_m2 ? "handmatig" : bag?.oppervlakte ? "bag" : listing?.m2 && !listing.funda_debug?.blocked ? "funda" : "schatting",
        plot_area_m2: hasManual && manual!.plot_area_m2 ? "handmatig" : isApt ? "bag" : listing?.perceel_m2 && !listing.funda_debug?.blocked ? "funda" : "schatting",
        build_year: hasManual && manual!.build_year ? "handmatig" : (bag as any)?.bouwjaar ? "bag" : listing?.bouwjaar && !listing.funda_debug?.blocked ? "funda" : "schatting",
        rooms: hasManual && manual!.rooms ? "handmatig" : listing?.kamers && !listing.funda_debug?.blocked && !hasManual ? "funda" : "schatting",
        asking_price: hasManual && manual!.asking_price ? "handmatig" : listing?.prijs && !listing.funda_debug?.blocked && !hasManual ? "funda" : "schatting",
        energy_label: hasManual && manual!.energielabel ? "handmatig" : fundaLabel ? "funda" : epLabel ? "ep_online" : "schatting",
        market_value: altum?.marktwaarde ? "altum_ai" : "schatting",
        rent_value: altum?.huurwaarde ? "altum_ai" : "schatting",
      },

    };
    return result;
  });
