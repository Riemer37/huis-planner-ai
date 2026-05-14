import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type CompStaat = "instapklaar" | "redelijk" | "renovatie" | "onbekend";

export interface Comparable {
  adres: string;
  type: string;
  m2?: number;
  bouwjaar?: number;
  prijs?: number;
  prijs_per_m2?: number;
  datum?: string;
  energielabel?: string;
  staat: CompStaat;
}

export type CompsResult =
  | { status: "ok"; comps: Comparable[] }
  | { status: "empty" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

const Input = z.object({
  postcode: z.string().min(4).max(10),
  huisnummer: z.string().min(1).max(10),
  m2: z.number().positive().optional(),
});

function deriveStaat(label?: string, bouwjaar?: number): CompStaat {
  const lbl = (label ?? "").toUpperCase().replace(/\s/g, "");
  const hasLabel = /^(A\+{0,4}|[A-G])$/.test(lbl);
  if (!hasLabel && !bouwjaar) return "onbekend";
  const isAB = /^(A\+{0,4}|B)$/.test(lbl);
  const isCD = /^(C|D)$/.test(lbl);
  const isEFG = /^(E|F|G)$/.test(lbl);
  if ((isAB && (bouwjaar ?? 0) > 2000) || (isAB && !bouwjaar)) return "instapklaar";
  if (isEFG || (bouwjaar && bouwjaar < 1970)) return "renovatie";
  if (isCD || (bouwjaar && bouwjaar >= 1970 && bouwjaar <= 2000)) return "redelijk";
  if (bouwjaar && bouwjaar > 2000) return "instapklaar";
  return "onbekend";
}

function pick<T = unknown>(o: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export const getComparables = createServerFn({ method: "POST" })
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data }): Promise<CompsResult> => {
    const key = process.env.ALTUM_AI_API_KEY;
    if (!key) return { status: "error", message: "ALTUM_AI_API_KEY ontbreekt" };
    const pc = data.postcode.replace(/\s+/g, "").toUpperCase();
    const m2 = data.m2 ?? 100;
    const body = {
      postcode: pc,
      housenumber: String(data.huisnummer),
      huisnummer: String(data.huisnummer),
      filters: {
        max_distance_km: 1,
        min_oppervlakte: Math.round(m2 * 0.8),
        max_oppervlakte: Math.round(m2 * 1.2),
        max_results: 8,
      },
    };
    try {
      const r = await fetch("https://api.altum.ai/reference", {
        method: "POST",
        headers: { "x-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      console.log("[ALTUM/REFERENCE] status:", r.status);
      console.log("[ALTUM/REFERENCE] body:", text.slice(0, 800));
      if (r.status === 429) return { status: "rate_limited" };
      if (!r.ok) return { status: "error", message: `Altum ${r.status}` };
      let j: any = null;
      try { j = JSON.parse(text); } catch { return { status: "error", message: "ongeldige response" }; }
      const out = j?.Output ?? j?.output ?? j?.data ?? j;
      const list: any[] =
        (Array.isArray(out?.references) && out.references) ||
        (Array.isArray(out?.referenties) && out.referenties) ||
        (Array.isArray(out?.comparables) && out.comparables) ||
        (Array.isArray(out?.results) && out.results) ||
        (Array.isArray(out) && out) ||
        [];
      if (!list.length) return { status: "empty" };
      const comps: Comparable[] = list.slice(0, 8).map((c: any) => {
        const street = pick<string>(c, ["Street", "street", "Straat", "straat"]);
        const hn = pick<string | number>(c, ["HouseNumber", "housenumber", "Huisnummer"]);
        const hnAdd = pick<string>(c, ["HouseNumberAddition", "Huisnummertoevoeging", "addition"]) ?? "";
        const city = pick<string>(c, ["City", "city", "Plaats", "Woonplaats"]);
        const adres = pick<string>(c, ["Adres", "address", "FullAddress"]) ??
          [street, hn ? `${hn}${hnAdd}` : "", city].filter(Boolean).join(" ");
        const type = pick<string>(c, ["HouseType", "house_type", "Type", "PropertyType", "Woningtype"]) ?? "—";
        const opp = num(pick(c, ["InnerSurfaceArea", "inner_surface_area", "LivingArea", "living_area", "Oppervlakte", "SurfaceArea"]));
        const bj = num(pick(c, ["BuildYear", "build_year", "Bouwjaar", "YearOfConstruction"]));
        const prijs = num(pick(c, ["TransactionPrice", "transaction_price", "SoldPrice", "sold_price", "Verkoopprijs", "Price"]));
        const datum = pick<string>(c, ["TransactionDate", "transaction_date", "SoldDate", "Verkoopdatum", "Date"]);
        const label = pick<string>(c, ["EnergyLabel", "energy_label", "Energielabel"]);
        const ppm = opp && prijs ? Math.round(prijs / opp) : undefined;
        return {
          adres: adres || "—",
          type: String(type).toLowerCase().includes("apparte") ? "Appartement" : (String(type) || "Woning"),
          m2: opp,
          bouwjaar: bj,
          prijs,
          prijs_per_m2: ppm,
          datum: datum ? String(datum).slice(0, 10) : undefined,
          energielabel: label,
          staat: deriveStaat(label, bj),
        };
      });
      return { status: "ok", comps };
    } catch (e) {
      console.log("[ALTUM/REFERENCE] error:", (e as Error).message);
      return { status: "error", message: (e as Error).message };
    }
  });
