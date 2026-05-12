import type { Listing } from "./types";

// Helpers used only on server
export async function fetchPdok(query: string) {
  const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&fl=id,weergavenaam,centroide_ll,woonplaatsnaam,gemeentenaam,buurtnaam,postcode,straatnaam,huisnummer,adresseerbaarobject_id,nummeraanduiding_id&rows=1`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`PDOK ${r.status}`);
  const j: any = await r.json();
  const doc = j?.response?.docs?.[0];
  if (!doc) return null;
  const ll = doc.centroide_ll?.match(/POINT\(([\-\d.]+) ([\-\d.]+)\)/);
  return {
    bagId: doc.adresseerbaarobject_id,
    adres: doc.weergavenaam,
    postcode: doc.postcode,
    woonplaats: doc.woonplaatsnaam,
    buurt: doc.buurtnaam,
    gemeente: doc.gemeentenaam,
    lon: ll ? parseFloat(ll[1]) : undefined,
    lat: ll ? parseFloat(ll[2]) : undefined,
  };
}

export async function fetchBagVbo(bagId: string | undefined) {
  if (!bagId) return null;
  try {
    const url = `https://service.pdok.nl/lv/bag/wfs/v2_0?service=WFS&version=2.0.0&request=GetFeature&typeNames=bag:verblijfsobject&outputFormat=application/json&filter=<Filter><PropertyIsEqualTo><PropertyName>identificatie</PropertyName><Literal>${bagId}</Literal></PropertyIsEqualTo></Filter>`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j: any = await r.json();
    const f = j?.features?.[0]?.properties;
    if (!f) return null;
    return {
      oppervlakte: f.oppervlakte ? Number(f.oppervlakte) : undefined,
      gebruiksdoel: f.gebruiksdoel,
      bouwjaar: f.bouwjaar ? Number(f.bouwjaar) : undefined,
      status: f.status,
    };
  } catch {
    return null;
  }
}

// ---------- Official BAG API (Kadaster) — fallback when WFS faalt ----------
export async function fetchBagApi(bagId: string | undefined) {
  if (!bagId) return null;
  const key = process.env.BAG_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2/adresseerbareobjecten/${bagId}`;
    const r = await fetch(url, {
      headers: { "X-Api-Key": key, "Accept-Crs": "epsg:28992", Accept: "application/hal+json" },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const v = j?.verblijfsobject?.verblijfsobject ?? j?._embedded?.adresseerbareObjecten?.[0]?.verblijfsobject?.verblijfsobject;
    if (!v) return null;
    return {
      oppervlakte: v.oppervlakte ? Number(v.oppervlakte) : undefined,
      gebruiksdoel: Array.isArray(v.gebruiksdoelen) ? v.gebruiksdoelen.join(", ") : undefined,
      status: v.status,
    };
  } catch {
    return null;
  }
}

// ---------- EP Online — energielabel ----------
export async function fetchEnergielabel(postcode?: string, huisnummer?: string) {
  const key = process.env.EP_ONLINE_API_KEY;
  if (!key || !postcode || !huisnummer) return null;
  try {
    const pc = postcode.replace(/\s+/g, "").toUpperCase();
    const url = `https://public.ep-online.nl/api/v5/PandEnergielabel/AdresseerbaarObject/${encodeURIComponent(pc)}/${encodeURIComponent(huisnummer)}`;
    const r = await fetch(url, { headers: { Authorization: key, Accept: "application/json" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    const item = Array.isArray(j) ? j[0] : j;
    if (!item) return null;
    return {
      label: String(item.labelLetter ?? item.energieklasse ?? "?"),
      bron: "ep_online" as const,
      registratiedatum: item.registratiedatum ?? item.opnameDatum,
    };
  } catch {
    return null;
  }
}

// ---------- Altum AI — WOZ-waarde / waarde-indicatie ----------
export async function fetchAltum(postcode?: string, huisnummer?: string) {
  const key = process.env.ALTUM_AI_API_KEY;
  if (!key || !postcode || !huisnummer) return null;
  try {
    const pc = postcode.replace(/\s+/g, "").toUpperCase();
    // Match endpoint accepteert post_code + house_number
    const r = await fetch("https://api.altum.ai/avm", {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ post_code: pc, house_number: Number(huisnummer) }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const d = j?.Output ?? j?.data ?? j;
    return {
      bron: "altum_ai" as const,
      marktwaarde: d?.AVM ?? d?.market_value ?? d?.value ?? undefined,
      woz_geschat: d?.WOZ ?? d?.woz_value ?? undefined,
      huurwaarde: d?.RentalValue ?? d?.rent ?? undefined,
    };
  } catch {
    return null;
  }
}

// ---------- ScraperAPI — Funda / Pararius listing ----------
type ScraperApiAttemptDebug = {
  scraper_url: string;
  response_status?: number;
  html_length: number;
  contains_next_data: boolean;
  first_500_chars: string;
  account_status_header?: string | null;
  credits_remaining?: string | null;
  error?: string;
};

type ScraperApiFetchResult = {
  html: string | null;
  debug: ScraperApiAttemptDebug;
};

function buildScraperApiDebugLines(debug: ScraperApiAttemptDebug) {
  return [
    `1. ScraperAPI URL being called: ${debug.scraper_url}`,
    `2. Response status: ${debug.response_status ?? "NO_RESPONSE"}`,
    `3. HTML length received: ${debug.html_length}`,
    `4. Contains __NEXT_DATA__: ${debug.contains_next_data}`,
    `5. First 500 characters of response: ${debug.first_500_chars}`,
    `6. ScraperAPI account status header: ${debug.account_status_header ?? "null"}`,
    `7. ScraperAPI credits remaining: ${debug.credits_remaining ?? "null"}`,
    ...(debug.error ? [`ScraperAPI fetch error: ${debug.error}`] : []),
  ];
}

async function fetchViaScraperApi(key: string, targetUrl: string): Promise<ScraperApiFetchResult> {
  const encoded = encodeURIComponent(targetUrl);
  const api = `http://api.scraperapi.com?api_key=${key}&url=${encoded}&render=true&premium=true&country_code=nl&device_type=desktop&keep_headers=true`;
  const safeApi = api.replace(key, "[REDACTED_SCRAPER_API_KEY]");
  try {
    const r = await fetch(api, {
      headers: {
        "X-MyHeader-Accept-Language": "nl-NL,nl;q=0.9",
        "X-MyHeader-Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "X-MyHeader-User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    const html = await r.text();
    const debug: ScraperApiAttemptDebug = {
      scraper_url: safeApi,
      response_status: r.status,
      html_length: html.length,
      contains_next_data: html.includes("__NEXT_DATA__"),
      first_500_chars: html.substring(0, 500),
      account_status_header: r.headers.get("sa-statuscode"),
      credits_remaining: r.headers.get("sa-credit-left"),
    };
    buildScraperApiDebugLines(debug).forEach((line) => console.log(line));
    if (!r.ok) console.log(`[SCRAPERAPI] HTTP ${r.status} for ${targetUrl}`);
    return { html: r.ok ? html : null, debug };
  } catch (e) {
    const debug: ScraperApiAttemptDebug = {
      scraper_url: safeApi,
      html_length: 0,
      contains_next_data: false,
      first_500_chars: "",
      account_status_header: null,
      credits_remaining: null,
      error: (e as Error).message,
    };
    buildScraperApiDebugLines(debug).forEach((line) => console.log(line));
    return { html: null, debug };
  }
}

export async function scrapeListing(targetUrl: string): Promise<Listing | null> {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return null;
  try {
    const scraperAttempts: ScraperApiAttemptDebug[] = [];
    let fetched = await fetchViaScraperApi(key, targetUrl);
    scraperAttempts.push(fetched.debug);
    let html = fetched.html;
    let attempts = 1;
    const isBlocked = (h: string | null) => !h || h.length < 100000 || !h.includes("__NEXT_DATA__");
    if (isBlocked(html)) {
      console.log(`[SCRAPERAPI] Attempt 1 blocked (len=${html?.length ?? 0}). Retrying once.`);
      fetched = await fetchViaScraperApi(key, targetUrl);
      scraperAttempts.push(fetched.debug);
      html = fetched.html;
      attempts = 2;
    }
    if (!html) {
      return {
        url: targetUrl,
        bron: "manual" as const,
        funda_debug: {
          html_length: scraperAttempts.at(-1)?.html_length ?? 0,
          next_data_found: scraperAttempts.some((a) => a.contains_next_data),
          blocked: true,
          scraperapi_attempts: scraperAttempts,
          scraperapi_debug_output: scraperAttempts.flatMap(buildScraperApiDebugLines),
          raw_next_data: null,
          logs: scraperAttempts.flatMap(buildScraperApiDebugLines),
        },
      };
    }
    const parsed = parseListingHtml(html, targetUrl);
    if (parsed?.funda_debug) {
      (parsed.funda_debug as any).attempts = attempts;
      parsed.funda_debug.scraperapi_attempts = scraperAttempts;
      parsed.funda_debug.scraperapi_debug_output = scraperAttempts.flatMap(buildScraperApiDebugLines);
      parsed.funda_debug.logs = [...scraperAttempts.flatMap(buildScraperApiDebugLines), ...parsed.funda_debug.logs];
    }
    return parsed;
  } catch (e) {
    console.log("[SCRAPERAPI] error:", (e as Error).message);
    return null;
  }
}

function isEnergyLabelValue(value: unknown): value is string {
  return typeof value === "string" && /^(A\+{0,4}|[B-G])$/i.test(value.trim());
}

function findEnergyLabelCandidates(obj: any, path: string[] = [], depth = 0): { value: string; path: string; score: number }[] {
  if (!obj || typeof obj !== "object" || depth > 12) return [];
  const candidates: { value: string; path: string; score: number }[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const nextPath = [...path, key];
    const pathText = nextPath.join(".").toLowerCase();
    const keyText = key.toLowerCase();
    const energyContext = /(energy|energie|energielabel|energieklasse|labelletter)/i.test(pathText);
    const exactEnergyKey = /^(energylabel|energielabel|energy_label|energie_label|energieklasse|labelletter)$/i.test(keyText);
    if (isEnergyLabelValue(value) && (energyContext || exactEnergyKey)) {
      candidates.push({ value: value.trim().toUpperCase(), path: nextPath.join("."), score: exactEnergyKey ? 100 : 70 });
    } else if (value && typeof value === "object" && (energyContext || exactEnergyKey)) {
      const inner = (value as any).label ?? (value as any).value ?? (value as any).code ?? (value as any).name ?? (value as any).text;
      if (isEnergyLabelValue(inner)) {
        candidates.push({ value: inner.trim().toUpperCase(), path: `${nextPath.join(".")}.${["label", "value", "code", "name", "text"].find((k) => (value as any)[k] === inner) ?? "value"}`, score: exactEnergyKey ? 95 : 75 });
      }
    }
    if (value && typeof value === "object") candidates.push(...findEnergyLabelCandidates(value, nextPath, depth + 1));
  }
  return candidates.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
}

function normalizeLabel(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.toUpperCase().match(/\b(A\+{0,4}|[B-G])\b/);
  return m ? m[1] : undefined;
}

function parseListingHtml(html: string, url: string): Listing {
  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m?.[1]?.trim();
  };
  const num = (s?: string) => {
    if (!s) return undefined;
    const cleaned = s.replace(/[^\d]/g, "");
    return cleaned ? Number(cleaned) : undefined;
  };

  let prijs: number | undefined, m2: number | undefined, kamers: number | undefined, bouwjaar: number | undefined, adres: string | undefined, label: string | undefined, beschrijving: string | undefined;
  let labelSource: string = "none";
  let rawNextData: any;
  let rawEnergyLabel: string | undefined;
  let fieldPath: string | undefined;
  const htmlLength = html.length;
  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  const nextDataFound = !!nextData;
  const blocked = htmlLength < 100000 || !nextDataFound;

  console.log("Raw HTML length:", htmlLength);
  console.log("NEXT_DATA found:", nextDataFound);
  if (blocked) console.log("FUNDA BLOCKED — real page not returned");

  // 1) Funda __NEXT_DATA__ — primaire bron
  if (nextData) {
    try {
      const json = JSON.parse(nextData[1]);
      rawNextData = json;
      const candidates = findEnergyLabelCandidates(json);
      const found = candidates[0];
      rawEnergyLabel = found?.value;
      fieldPath = found?.path;
      console.log("[FUNDA] __NEXT_DATA__ energy label candidates:", candidates.slice(0, 10));
      if (found?.value) {
        label = normalizeLabel(found.value);
        labelSource = "funda_next_data";
      }
      // probeer ook adres/m2/prijs/bouwjaar uit next data
      const str = JSON.stringify(json);
      adres = adres ?? str.match(/"streetAddress"\s*:\s*"([^"]+)"/)?.[1];
      const m2m = str.match(/"floorArea"\s*:\s*(\d{2,4})/) ?? str.match(/"livingArea"\s*:\s*(\d{2,4})/);
      if (m2m) m2 = Number(m2m[1]);
      const prijsm = str.match(/"salePrice"\s*:\s*(\d{4,})/) ?? str.match(/"askingPrice"\s*:\s*(\d{4,})/);
      if (prijsm) prijs = Number(prijsm[1]);
      const bjm = str.match(/"constructionYear"\s*:\s*(\d{4})/) ?? str.match(/"buildYear"\s*:\s*(\d{4})/);
      if (bjm) bouwjaar = Number(bjm[1]);
    } catch (e) {
      console.log("[FUNDA] __NEXT_DATA__ parse error:", (e as Error).message);
    }
  }

  // 2) JSON-LD (schema.org) als aanvulling
  const ld = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ld) {
    try {
      const data = JSON.parse(ld[1]);
      const node = Array.isArray(data) ? data[0] : data;
      prijs = prijs ?? (node?.offers?.price ? Number(node.offers.price) : undefined);
      adres = adres ?? node?.address?.streetAddress;
      m2 = m2 ?? (node?.floorSize?.value ? Number(node.floorSize.value) : undefined);
      kamers = kamers ?? (node?.numberOfRooms ? Number(node.numberOfRooms) : undefined);
    } catch {}
  }

  // 3) HTML-fallback voor energielabel (Funda dt/dd kenmerken-blok)
  if (!label) {
    const dt = html.match(/Energielabel[\s\S]{0,400}?<dd[^>]*>\s*<[^>]*>?\s*([A-G]\+{0,4})/i)
      ?? html.match(/Energielabel[\s\S]{0,200}?>\s*([A-G]\+{0,4})\s*</i);
    if (dt) {
      label = normalizeLabel(dt[1]);
      rawEnergyLabel = rawEnergyLabel ?? dt[1];
      fieldPath = fieldPath ?? "html.Energielabel";
      labelSource = "funda_html";
      console.log("[FUNDA] HTML-fallback energielabel:", label);
    }
  }

  prijs = prijs ?? num(pick(/€\s*([\d\.\s]+)\s*(?:k\.k\.|v\.o\.n\.)?/i));
  m2 = m2 ?? num(pick(/(\d{2,4})\s*m²/));
  bouwjaar = bouwjaar ?? num(pick(/Bouwjaar[^<]*<[^>]*>\s*(\d{4})/i)) ?? num(pick(/(\d{4})\s*<\/[^>]+>\s*<[^>]+>\s*Bouwjaar/i));

  console.log("Energy label raw value:", rawEnergyLabel ?? null);
  console.log("Energy label field path used:", fieldPath ?? null);
  console.log("Final energy label returned:", label ?? null);
  console.log(`[FUNDA] FINAL energielabel="${label ?? "(none)"}" source=${labelSource} url=${url}`);

  return {
    url,
    prijs,
    vraagprijs: prijs,
    m2,
    kamers,
    bouwjaar,
    energielabel: label,
    adres,
    beschrijving,
    bron: "scraperapi" as const,
    funda_debug: {
      html_length: htmlLength,
      next_data_found: nextDataFound,
      blocked,
      raw_next_data: rawNextData,
      raw_energy_label: rawEnergyLabel,
      energy_label_field_path: fieldPath,
      final_energy_label: label,
      logs: [
        `Raw HTML length: ${htmlLength}`,
        `NEXT_DATA found: ${nextDataFound}`,
        `Energy label raw value: ${rawEnergyLabel ?? "null"}`,
        `Energy label field path used: ${fieldPath ?? "null"}`,
        `Final energy label returned: ${label ?? "null"}`,
        ...(blocked ? ["FUNDA BLOCKED — real page not returned"] : []),
      ],
    },
  };
}

// ---------- Anthropic — secundaire AI cross-check ----------
export async function callAnthropic(prompt: string) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        system:
          "Je bent een Nederlandse vastgoedanalist. Geef een korte second opinion (max 120 woorden) met advies (Kopen/Voorwaardelijk/Vermijden) en score 1-10. Antwoord als JSON: {\"samenvatting\":\"...\",\"advies\":\"...\",\"score\":N}.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const text = j?.content?.[0]?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { bron: "anthropic" as const, samenvatting: text.slice(0, 400) };
    const parsed = JSON.parse(m[0]);
    return { bron: "anthropic" as const, ...parsed };
  } catch {
    return null;
  }
}

export async function fetchRijksmonument(lat?: number, lon?: number) {
  if (!lat || !lon) return { rijksmonument: false, beschermdGezicht: null };
  try {
    const d = 0.0002;
    const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
    const url = `https://services.rce.geovoorziening.nl/landschapsatlas/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=rijksmonumenten&bbox=${bbox},EPSG:4326&outputFormat=application/json&count=1`;
    const r = await fetch(url);
    let rijks = false;
    if (r.ok) {
      const j: any = await r.json();
      rijks = (j?.features?.length ?? 0) > 0;
    }
    return { rijksmonument: rijks, beschermdGezicht: null };
  } catch {
    return { rijksmonument: false, beschermdGezicht: null };
  }
}

export type AiAnalysisShape = import("./types").AiAnalysis;

export async function callLovableAI(prompt: string): Promise<AiAnalysisShape> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Je bent een Nederlandse vastgoedanalist. Geef ALTIJD geldig JSON terug volgens het opgegeven schema. Tekstvelden in het Nederlands. Geen markdown, geen uitleg buiten JSON.",
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "analyse_pand",
            description: "Geef vastgoed-investeringsanalyse",
            parameters: {
              type: "object",
              properties: {
                investeringsthese: { type: "string" },
                advies: { type: "string", enum: ["Kopen", "Voorwaardelijk", "Vermijden"] },
                score: { type: "number" },
                risico: {
                  type: "object",
                  properties: {
                    locatie: { type: "number" },
                    staat: { type: "number" },
                    markt: { type: "number" },
                    liquiditeit: { type: "number" },
                  },
                  required: ["locatie", "staat", "markt", "liquiditeit"],
                  additionalProperties: false,
                },
                marktwaarde_ai: { type: "number" },
                huurwaarde_ai: { type: "number" },
                transformatieadvies: { type: "string" },
                marktcontext: { type: "string" },
                pandtype_bevestiging: { type: "string", enum: ["woning", "nieuwbouw", "commercieel", "gemengd"] },
                commercieel_huurprijs_pm2: { type: ["number", "null"] },
                bar_bruto: { type: ["number", "null"] },
                nar_netto: { type: ["number", "null"] },
                leegstandsrisico: { type: ["string", "null"], enum: ["laag", "midden", "hoog", null] },
                huurprijszone: { type: ["string", "null"], enum: ["prime", "secondary", "perifeer", null] },
                opmerkingen: { type: "array", items: { type: "string" } },
              },
              required: [
                "investeringsthese",
                "advies",
                "score",
                "risico",
                "marktwaarde_ai",
                "huurwaarde_ai",
                "transformatieadvies",
                "marktcontext",
                "pandtype_bevestiging",
                "opmerkingen",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "analyse_pand" } },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 429) throw new Error("AI rate limit overschreden, probeer later opnieuw.");
    if (resp.status === 402) throw new Error("AI credits op. Vul credits aan in Settings → Workspace → Usage.");
    throw new Error(`AI gateway ${resp.status}: ${body.slice(0, 200)}`);
  }
  const j: any = await resp.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI: geen structureel antwoord");
  return JSON.parse(args) as AiAnalysisShape;
}

export function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function synthesizeWoz(marktwaarde: number) {
  const base = Math.round(marktwaarde / 1.1);
  const arr: { jaar: number; waarde: number }[] = [];
  const cur = new Date().getFullYear();
  for (let i = 4; i >= 0; i--) arr.push({ jaar: cur - i, waarde: Math.round(base * Math.pow(0.94, i)) });
  return arr.reverse();
}

export function fallbackAI(pandtype: import("./types").PandType): AiAnalysisShape {
  return {
    investeringsthese: "AI-analyse niet beschikbaar. Handmatige beoordeling vereist.",
    advies: "Voorwaardelijk",
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

export function buildPrompt(ctx: any) {
  return `Analyseer dit pand voor een Nederlandse vastgoedbelegger en roep de tool 'analyse_pand' aan.

Invoer: ${ctx.query}
Soort invoer: ${ctx.isUrl ? "URL (Funda/Pararius/Vendr)" : "Adres"}
Pandtype (door gebruiker geselecteerd): ${ctx.pandtype}

PDOK locatie: ${JSON.stringify(ctx.pdok ?? "onbekend")}
BAG verblijfsobject: ${JSON.stringify(ctx.bag ?? "onbekend")}
Monument/beschermd gezicht: ${JSON.stringify(ctx.monument)}
Listing (ScraperAPI): ${JSON.stringify(ctx.listing ?? "onbekend")}
Energielabel (EP Online): ${JSON.stringify(ctx.energie ?? "onbekend")}
Altum AI waarderef: ${JSON.stringify(ctx.altum ?? "onbekend")}

Instructies:
- score 1-10 (10 = uitstekende belegging).
- risico velden 1-10 (10 = hoog risico).
- marktwaarde_ai en huurwaarde_ai in euro (huurwaarde per maand voor woning, of leeg voor commercieel).
- Voor commercieel: vul bar_bruto, nar_netto, leegstandsrisico, huurprijszone, commercieel_huurprijs_pm2 (€/m²/jr).
- Voor nieuwbouw: vermeld dat WOZ niet beschikbaar is.
- Geef 2-5 opmerkingen (erfpacht, monument, splitsing, OVB-tarief, BTW, etc.).
- Investeringsthese max 200 woorden, Nederlands.`;
}
