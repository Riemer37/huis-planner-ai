import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchBagVbo, fetchWozWaardeloket } from "./analyze.server";
import { haalAltumReferenties, type Comparable } from "./comps.functions";

export interface Perceel {
  aanduiding: string;
  kadastrale_gemeente?: string;
  sectie?: string;
  perceelnummer?: number;
  grootte_m2?: number;
}

export interface BuurtCijfers {
  jaar?: string;
  buurtnaam?: string;
  gemiddelde_woz?: number;
  woningvoorraad?: number;
  perc_koop?: number;
  perc_huur?: number;
  perc_corporatie?: number;
  perc_eengezins?: number;
  inwoners?: number;
  inkomen_per_inwoner?: number;
}

export interface WozBuur {
  adres: string;
  afstand_m?: number;
  woz?: number;
  woz_jaar?: number;
  m2?: number;
  woz_per_m2?: number;
  bouwjaar?: number;
}

export interface BuurtData {
  perceel?: Perceel | null;
  cijfers?: BuurtCijfers | null;
  woz_buren: WozBuur[];
  woz_buren_mediaan_m2?: number;
  verkopen: Comparable[];
  verkopen_status: "ok" | "leeg" | "geen_key" | "fout";
  verkopen_melding?: string;
  links: { label: string; url: string }[];
  opgehaald: string;
}

const Input = z.object({
  lat: z.number(),
  lon: z.number(),
  postcode: z.string().max(10).optional(),
  huisnummer: z.string().max(10).optional(),
  buurtcode: z.string().max(12).optional(),
  bag_id_eigen: z.string().max(20).optional(),
});

async function json(url: string, timeoutMs = 12000): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) {
      console.log("[BUURT]", r.status, url.slice(0, 140));
      return null;
    }
    return await r.json();
  } catch (e) {
    console.log("[BUURT] fout", url.slice(0, 140), (e as Error).message);
    return null;
  }
}

// ---------- Kadastraal perceel (BRK via PDOK) ----------
async function haalPerceel(lat: number, lon: number): Promise<Perceel | null> {
  const d = 0.00004;
  const url = `https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items?f=json&limit=5&bbox=${lon - d},${lat - d},${lon + d},${lat + d}`;
  const j = await json(url);
  const feats: any[] = j?.features ?? [];
  if (!feats.length) return null;
  // Bij meerdere percelen: kies het grootste (meestal het woonperceel, niet een strookje stoep)
  const p = feats
    .map((f) => f.properties ?? {})
    .sort((a, b) => (b.kadastrale_grootte_waarde ?? 0) - (a.kadastrale_grootte_waarde ?? 0))[0];
  const gemeente = p.kadastrale_gemeente_waarde ?? p.akr_kadastrale_gemeente_code_waarde;
  return {
    aanduiding: [gemeente, p.sectie, p.perceelnummer].filter(Boolean).join(" "),
    kadastrale_gemeente: gemeente,
    sectie: p.sectie,
    perceelnummer: p.perceelnummer,
    grootte_m2: p.kadastrale_grootte_waarde != null ? Number(p.kadastrale_grootte_waarde) : undefined,
  };
}

// ---------- CBS kerncijfers buurt ----------
const CBS_TABELLEN = [
  { id: "86165NED", jaar: "2025" },
  { id: "85984NED", jaar: "2024" },
  { id: "85618NED", jaar: "2023" },
];

function veld(rij: Record<string, any>, prefix: string): number | undefined {
  const k = Object.keys(rij).find((x) => x.startsWith(prefix));
  const v = k ? rij[k] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function haalBuurtCijfers(buurtcode?: string): Promise<BuurtCijfers | null> {
  if (!buurtcode) return null;
  const code = buurtcode.startsWith("BU") ? buurtcode : `BU${buurtcode}`;
  let gevonden: BuurtCijfers | null = null;
  for (const t of CBS_TABELLEN) {
    const url = `https://opendata.cbs.nl/ODataApi/odata/${t.id}/TypedDataSet?$format=json&$filter=${encodeURIComponent(
      `startswith(WijkenEnBuurten,'${code}')`,
    )}`;
    const j = await json(url);
    const rij = j?.value?.[0];
    if (!rij) continue;
    const woz = veld(rij, "GemiddeldeWOZWaardeVanWoningen");
    const inkomen = veld(rij, "GemiddeldInkomenPerInwoner");
    const c: BuurtCijfers = {
      jaar: t.jaar,
      gemiddelde_woz: woz != null ? Math.round(woz * 1000) : undefined, // CBS: x 1000 euro
      woningvoorraad: veld(rij, "Woningvoorraad"),
      perc_koop: veld(rij, "Koopwoningen"),
      perc_huur: veld(rij, "HuurwoningenTotaal"),
      perc_corporatie: veld(rij, "InBezitWoningcorporatie"),
      perc_eengezins: veld(rij, "PercentageEengezinswoning"),
      inwoners: veld(rij, "AantalInwoners"),
      inkomen_per_inwoner: inkomen != null ? Math.round(inkomen * 1000) : undefined,
    };
    // Nieuwste tabel heeft soms nog geen WOZ; dan oudere tabel proberen voor WOZ
    if (!gevonden) gevonden = c;
    else if (gevonden.gemiddelde_woz == null && c.gemiddelde_woz != null) {
      const g: BuurtCijfers = gevonden;
      gevonden = { ...g, gemiddelde_woz: c.gemiddelde_woz, jaar: `${g.jaar} (WOZ ${c.jaar})` };
    }
    if (gevonden.gemiddelde_woz != null) break;
  }
  return gevonden;
}

// ---------- WOZ-waarden van omliggende adressen ----------
async function metLimiet<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function haalWozBuren(lat: number, lon: number, eigen?: string): Promise<WozBuur[]> {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lat=${lat}&lon=${lon}&type=adres&rows=25&fl=weergavenaam,nummeraanduiding_id,adresseerbaarobject_id,afstand`;
  const j = await json(url);
  const docs: any[] = (j?.response?.docs ?? []).filter((d: any) => d.nummeraanduiding_id && d.adresseerbaarobject_id !== eigen);
  const kandidaten = docs.slice(0, 14);
  const rijen = await metLimiet(kandidaten, 6, async (d): Promise<WozBuur> => {
    const [woz, vbo] = await Promise.all([
      fetchWozWaardeloket(d.nummeraanduiding_id).catch(() => null),
      fetchBagVbo(d.adresseerbaarobject_id).catch(() => null),
    ]);
    const laatste = woz?.length ? woz[woz.length - 1] : undefined;
    const m2 = vbo?.oppervlakte;
    return {
      adres: d.weergavenaam,
      afstand_m: d.afstand != null ? Math.round(Number(d.afstand)) : undefined,
      woz: laatste?.waarde,
      woz_jaar: laatste?.jaar,
      m2,
      woz_per_m2: laatste?.waarde && m2 && m2 > 10 ? Math.round(laatste.waarde / m2) : undefined,
      bouwjaar: vbo?.bouwjaar,
    };
  });
  return rijen.filter((r) => r.woz);
}

function mediaan(xs: number[]) {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

export const haalBuurtData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data }): Promise<BuurtData> => {
    const pc = data.postcode?.replace(/\s+/g, "").toUpperCase();
    let buurtcode = data.buurtcode;
    if (!buurtcode) {
      const r = await json(
        `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lat=${data.lat}&lon=${data.lon}&type=adres&rows=1&fl=buurtcode`,
      );
      buurtcode = r?.response?.docs?.[0]?.buurtcode;
    }
    const [perceel, cijfers, buren, verkopen] = await Promise.all([
      haalPerceel(data.lat, data.lon).catch(() => null),
      haalBuurtCijfers(buurtcode).catch(() => null),
      haalWozBuren(data.lat, data.lon, data.bag_id_eigen).catch(() => [] as WozBuur[]),
      pc && data.huisnummer && process.env.ALTUM_AI_API_KEY
        ? haalAltumReferenties(pc, data.huisnummer).catch((e) => ({ status: "error" as const, message: String(e) }))
        : Promise.resolve(null),
    ]);

    let verkopen_status: BuurtData["verkopen_status"] = "geen_key";
    let verkopen_melding: string | undefined;
    let lijst: Comparable[] = [];
    if (verkopen) {
      if (verkopen.status === "ok") {
        verkopen_status = "ok";
        lijst = verkopen.comps
          .filter((c) => c.prijs)
          .sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? ""))
          .slice(0, 20);
      } else if (verkopen.status === "empty") verkopen_status = "leeg";
      else {
        verkopen_status = "fout";
        verkopen_melding = verkopen.status === "rate_limited" ? "Limiet van Altum AI bereikt" : verkopen.message;
      }
    }

    const pc4 = pc?.slice(0, 4);
    const links = [
      pc4 && {
        label: "Verkochte woningen op Funda (postcode)",
        url: `https://www.funda.nl/zoeken/koop?selected_area=%5B%22${pc4}%22%5D&availability=%5B%22unavailable%22%5D`,
      },
      { label: "Kadastrale kaart", url: `https://kadastralekaart.com/kaart?lat=${data.lat}&lon=${data.lon}&zoom=19` },
      {
        label: "Regels op de kaart (bestemmingsplan)",
        url: "https://omgevingswet.overheid.nl/regels-op-de-kaart",
      },
      {
        label: "Eigendomsinformatie & koopsom (Kadaster, betaald)",
        url: "https://www.kadaster.nl/producten/woning/eigendomsinformatie",
      },
      buurtcode && {
        label: "CBS buurtcijfers",
        url: `https://www.cbs.nl/nl-nl/visualisaties/kerncijfers-wijken-en-buurten`,
      },
    ].filter(Boolean) as BuurtData["links"];

    return {
      perceel,
      cijfers,
      woz_buren: buren,
      woz_buren_mediaan_m2: mediaan(buren.map((b) => b.woz_per_m2).filter((x): x is number => !!x)),
      verkopen: lijst,
      verkopen_status,
      verkopen_melding,
      links,
      opgehaald: new Date().toISOString(),
    };
  });
