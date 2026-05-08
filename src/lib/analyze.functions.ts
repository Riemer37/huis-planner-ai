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
