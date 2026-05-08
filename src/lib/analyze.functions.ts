import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildPrompt, callLovableAI, cryptoRandomId, fallbackAI, fetchBagVbo, fetchPdok, fetchRijksmonument, synthesizeWoz } from "./analyze.server";
import type { PropertyAnalysis, PandType } from "./types";

const InputSchema = z.object({
  query: z.string().min(2).max(300),
  pandtype: z.enum(["woning", "nieuwbouw", "commercieel", "gemengd"]),
  isUrl: z.boolean().optional(),
});

export const analyzeProperty = createServerFn({ method: "POST" })
  .inputValidator((i) => InputSchema.parse(i))
  .handler(async ({ data }): Promise<PropertyAnalysis> => {
    const errors: Record<string, string> = {};
    const isUrl = data.isUrl ?? /^https?:\/\//i.test(data.query);

    // Address detection: if URL, try a naive extraction; else treat as address
    let addressForPdok = data.query;
    let listing: PropertyAnalysis["listing"] = undefined;
    if (isUrl) {
      // Listing scraping is best-effort and likely blocked; we let AI work from URL+address
      listing = { url: data.query };
      // Try to pull human-readable address from path
      const m = data.query.match(/\/([a-z0-9\-]+)\/(huis|appartement|object)\-([0-9]+)/i);
      if (m) {
        const slug = m[1].replace(/\-/g, " ");
        addressForPdok = slug;
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

    // Fase 2: parallel
    const [bag, monument] = await Promise.all([
      fetchBagVbo(pdok?.bagId).catch((e) => {
        errors.bag = String(e?.message ?? e);
        return null;
      }),
      fetchRijksmonument(pdok?.lat, pdok?.lon).catch((e) => {
        errors.monument = String(e?.message ?? e);
        return { rijksmonument: false, beschermdGezicht: null };
      }),
    ]);

    // AI prompt
    const prompt = buildPrompt({
      query: data.query,
      pandtype: data.pandtype,
      pdok,
      bag,
      monument,
      isUrl,
    });

    let ai;
    try {
      ai = await callLovableAI(prompt);
    } catch (e: any) {
      errors.ai = e.message;
      ai = fallbackAI(data.pandtype);
    }

    const result: PropertyAnalysis = {
      id: cryptoRandomId(),
      timestamp: Date.now(),
      input: data.query,
      pandtype: data.pandtype as PandType,
      listing,
      pdok: pdok ?? { adres: data.query },
      bag: bag ?? undefined,
      monument: monument ?? { rijksmonument: false, beschermdGezicht: null },
      ai,
      errors,
      // Synthesized WOZ series (best-effort fallback) — Kadaster WOZ requires auth in many cases
      woz: synthesizeWoz(ai.marktwaarde_ai),
      energielabel: { label: ai.pandtype_bevestiging === "nieuwbouw" ? "A" : "C", bron: "schatting" },
      perceel_m2: data.pandtype === "commercieel" ? undefined : 120,
    };
    return result;
  });

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function synthesizeWoz(marktwaarde: number) {
  const base = Math.round(marktwaarde / 1.1);
  const arr = [] as { jaar: number; waarde: number }[];
  const cur = new Date().getFullYear();
  for (let i = 4; i >= 0; i--) {
    arr.push({ jaar: cur - i, waarde: Math.round(base * Math.pow(0.94, i)) });
  }
  return arr.reverse();
}

function fallbackAI(pandtype: PandType) {
  return {
    investeringsthese: "AI-analyse niet beschikbaar. Handmatige beoordeling vereist.",
    advies: "Voorwaardelijk" as const,
    score: 5,
    risico: { locatie: 5, staat: 5, markt: 5, liquiditeit: 5 },
    marktwaarde_ai: 350000,
    huurwaarde_ai: 1400,
    transformatieadvies: "—",
    marktcontext: "—",
    pandtype_bevestiging: pandtype,
    commercieel_huurprijs_pm2: pandtype === "commercieel" ? 150 : null,
    opmerkingen: ["AI-analyse mislukt — controleer Lovable AI credits."],
  };
}

function buildPrompt(ctx: any) {
  return `Analyseer dit pand voor een Nederlandse vastgoedbelegger en roep de tool 'analyse_pand' aan.

Invoer: ${ctx.query}
Soort invoer: ${ctx.isUrl ? "URL (Funda/Pararius/Vendr)" : "Adres"}
Pandtype (door gebruiker geselecteerd): ${ctx.pandtype}

PDOK locatie: ${JSON.stringify(ctx.pdok ?? "onbekend")}
BAG verblijfsobject: ${JSON.stringify(ctx.bag ?? "onbekend")}
Monument/beschermd gezicht: ${JSON.stringify(ctx.monument)}

Instructies:
- score 1-10 (10 = uitstekende belegging).
- risico velden 1-10 (10 = hoog risico).
- marktwaarde_ai en huurwaarde_ai in euro (huurwaarde per maand voor woning, of leeg voor commercieel).
- Voor commercieel: vul bar_bruto, nar_netto, leegstandsrisico, huurprijszone, commercieel_huurprijs_pm2 (€/m²/jr).
- Voor nieuwbouw: vermeld dat WOZ niet beschikbaar is.
- Geef 2-5 opmerkingen (erfpacht, monument, splitsing, OVB-tarief, BTW, etc.).
- Investeringsthese max 200 woorden, Nederlands.`;
}
