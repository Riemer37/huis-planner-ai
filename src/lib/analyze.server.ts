import type { Listing, JsonValue } from "./types";

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

// ---------- ScraperAPI — Funda listing ----------
function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normLabel(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.trim().toUpperCase().match(/A\+{0,4}|[B-G]/);
  return m ? m[0] : undefined;
}

const SCRAPER_HEADERS = {
  "X-MyHeader-Accept-Language": "nl-NL,nl;q=0.9",
  "X-MyHeader-Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "X-MyHeader-User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

async function scraperApiFetch(
  fundaUrl: string,
  render: boolean,
  timeoutMs: number,
  logs: string[],
): Promise<{ html: string; status: number } | null> {
  const key = process.env.SCRAPER_API_KEY!;
  const encodedUrl = encodeURIComponent(fundaUrl);
  const scraperUrl = `http://api.scraperapi.com?api_key=${key}&url=${encodedUrl}&render=${render}&premium=true&country_code=nl&device_type=desktop&keep_headers=true`;
  const safeUrl = scraperUrl.replace(key, "[REDACTED]");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    logs.push(`[ScraperAPI] GET render=${render} timeout=${timeoutMs}ms`);
    logs.push(`[ScraperAPI] URL: ${safeUrl}`);
    const r = await fetch(scraperUrl, { headers: SCRAPER_HEADERS, signal: controller.signal });
    const html = await r.text();
    logs.push(`[ScraperAPI] status=${r.status} html_length=${html.length}`);
    return { html, status: r.status };
  } catch (e) {
    const err = e as Error;
    logs.push(`[ScraperAPI] error render=${render}: ${err.name === "AbortError" ? "TIMEOUT" : err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractFromNextData(html: string): { listing: any | null; raw: any | null } {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { listing: null, raw: null };
  try {
    const json = JSON.parse(m[1]);
    const pp = json?.props?.pageProps ?? {};
    const listing = pp.propertyResponse ?? pp.listing ?? pp;
    return { listing, raw: json };
  } catch {
    return { listing: null, raw: null };
  }
}

export async function scrapeListing(targetUrl: string): Promise<Listing | null> {
  const key = process.env.SCRAPER_API_KEY;
  console.log("SCRAPER_API_KEY present:", !!key);
  if (!key) {
    console.log("[ScraperAPI] SCRAPER_API_KEY not set");
    return null;
  }
  const logs: string[] = [];

  // Attempt 1: render=false
  let result = await scraperApiFetch(targetUrl, false, 25_000, logs);
  let html = result?.html ?? "";

  // Retry with render=true if too small
  if (html.length < 50_000) {
    logs.push(`[ScraperAPI] html too small (${html.length}) — retry with render=true`);
    const retry = await scraperApiFetch(targetUrl, true, 25_000, logs);
    if (retry && retry.html.length > html.length) {
      result = retry;
      html = retry.html;
    }
  }

  if (!html) {
    return {
      url: targetUrl,
      bron: "manual",
      funda_debug: {
        html_length: 0,
        next_data_found: false,
        blocked: true,
        raw_next_data: null,
        logs,
        scraperapi_debug_output: logs,
      },
    };
  }

  // HTML regex extraction (always)
  const priceMatch = html.match(/€\s*([\d.]+(?:,\d+)?)/);
  const bouwjaarMatch = html.match(/bouwjaar[^\d]*(\d{4})/i);
  const kamersMatch = html.match(/(\d+)\s*kamers/i);
  const m2Match = html.match(/(\d+)\s*m²?\s*(?:wonen|woonopp|woonoppervlakte)/i);
  const perceelMatch = html.match(/(\d+)\s*m²?\s*(?:perceel|perceeloppervlakte)/i);
  const labelMatch = html.match(/energielabel[^A-G]{0,40}([A-G][+]{0,4})/i);

  const regexResults: Record<string, string | number | null> = {
    price: priceMatch?.[1] ?? null,
    bouwjaar: bouwjaarMatch?.[1] ?? null,
    kamers: kamersMatch?.[1] ?? null,
    m2: m2Match?.[1] ?? null,
    perceel_m2: perceelMatch?.[1] ?? null,
    energielabel: labelMatch?.[1] ?? null,
  };
  logs.push(`[Regex] ${JSON.stringify(regexResults)}`);

  // Bonus: __NEXT_DATA__
  const { listing: nd, raw: ndRaw } = extractFromNextData(html);
  const nextDataFound = !!ndRaw;
  logs.push(`[NextData] found=${nextDataFound}`);

  const prijs =
    toNumber(nd?.price?.askingPrice ?? nd?.price?.salePrice ?? nd?.price ?? nd?.askingPrice) ??
    toNumber(priceMatch?.[1]);
  const m2 =
    toNumber(nd?.floorArea ?? nd?.surfaceArea ?? nd?.livingArea ?? nd?.areas?.living) ??
    toNumber(m2Match?.[1]);
  const perceel =
    toNumber(nd?.plotArea ?? nd?.parcelSurfaceArea ?? nd?.areas?.plot) ??
    toNumber(perceelMatch?.[1]);
  const kamers = toNumber(nd?.numberOfRooms ?? nd?.rooms) ?? toNumber(kamersMatch?.[1]);
  const bouwjaar =
    toNumber(nd?.constructionYear ?? nd?.yearBuilt ?? nd?.buildYear) ??
    toNumber(bouwjaarMatch?.[1]);
  const energielabel =
    normLabel(nd?.energyClass ?? nd?.energyLabel?.label ?? nd?.energyLabel) ??
    normLabel(labelMatch?.[1]);

  const adres =
    typeof nd?.address?.streetName === "string"
      ? `${nd.address.streetName} ${nd.address.houseNumber ?? ""}`.trim()
      : typeof nd?.title === "string"
        ? nd.title
        : undefined;

  const blocked = html.length < 5_000 && !prijs && !energielabel;

  logs.push(
    `[ScraperAPI ok] price=${prijs} m2=${m2} perceel=${perceel} kamers=${kamers} label=${energielabel} bouwjaar=${bouwjaar}`,
  );

  return {
    url: targetUrl,
    prijs,
    vraagprijs: prijs,
    m2,
    perceel_m2: perceel,
    kamers,
    energielabel,
    bouwjaar,
    adres,
    beschrijving: typeof nd?.description === "string" ? nd.description : undefined,
    bron: "scraperapi",
    funda_debug: {
      html_length: html.length,
      next_data_found: nextDataFound,
      blocked,
      raw_next_data: (nd ?? null) as JsonValue,
      raw_energy_label: labelMatch?.[1],
      final_energy_label: energielabel,
      html_regex_results: regexResults,
      logs,
      scraperapi_debug_output: logs,
    },
  };
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
  // "blocked" = we got nothing useful at all. With meta/JSON-LD/HTML fallbacks we can still parse a real page even without __NEXT_DATA__.
  const tooSmall = htmlLength < 50000;
  const regexResults: Record<string, string | number | null> = {};
  const extraLogs: string[] = [];

  console.log("Raw HTML length:", htmlLength);
  console.log("NEXT_DATA found:", nextDataFound);

  // 1) Funda __NEXT_DATA__ — primaire bron (best case)
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

  // 2) JSON-LD structured data (often present even on bot-served pages)
  const ldBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  let ldIdx = 0;
  for (const block of ldBlocks) {
    const inner = block.replace(/<script[^>]*>|<\/script>/gi, "").trim();
    try {
      const data = JSON.parse(inner);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        regexResults[`json_ld[${ldIdx}].@type`] = (node?.["@type"] as string) ?? null;
        if (node?.offers?.price && !prijs) prijs = Number(node.offers.price);
        if (node?.address?.streetAddress && !adres) adres = String(node.address.streetAddress);
        if (node?.floorSize?.value && !m2) m2 = Number(node.floorSize.value);
        if (node?.numberOfRooms && !kamers) kamers = Number(node.numberOfRooms);
        if (node?.description && !beschrijving) beschrijving = String(node.description).slice(0, 800);
      }
      ldIdx++;
    } catch (e) {
      extraLogs.push(`JSON-LD parse error block#${ldIdx}: ${(e as Error).message}`);
    }
  }
  regexResults["json_ld_blocks_found"] = ldBlocks.length;

  // 3) OpenGraph / meta tags (Funda always serves these, even on bot pages)
  const metaContent = (prop: string) => {
    const m =
      html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i")) ??
      html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${prop}["']`, "i")) ??
      html.match(new RegExp(`<meta[^>]*name=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"));
    return m?.[1];
  };
  const metaTitle = metaContent("og:title");
  const metaDesc = metaContent("og:description");
  const metaPrice = metaContent("og:price:amount") ?? metaContent("product:price:amount");
  const metaUrl = metaContent("og:url");
  regexResults["meta.og:title"] = metaTitle ?? null;
  regexResults["meta.og:description"] = metaDesc ?? null;
  regexResults["meta.og:price"] = metaPrice ?? null;
  regexResults["meta.og:url"] = metaUrl ?? null;

  if (!adres && metaTitle) {
    // og:title is meestal "Galvanistraat 16-bs, 3553 AT Utrecht [Te koop: € ...]"
    adres = metaTitle.split(/[\[|·]/)[0].trim();
  }
  if (!beschrijving && metaDesc) beschrijving = metaDesc.slice(0, 800);
  if (!prijs && metaPrice) {
    const n = Number(String(metaPrice).replace(/[^\d]/g, ""));
    if (n > 1000) prijs = n;
  }
  // Prijs uit og:title als laatste meta-redmiddel
  if (!prijs && metaTitle) {
    const pt = metaTitle.match(/€\s*([\d\.\s]+)/);
    if (pt) {
      const n = Number(pt[1].replace(/[^\d]/g, ""));
      if (n > 1000) prijs = n;
    }
  }

  // 4) Directe HTML-regex fallbacks (werken op zowel volledige als bot-pagina)
  const rxPrice = html.match(/€\s*([\d\.]{4,})\s*(?:k\.k\.|v\.o\.n\.|kosten koper)/i);

  const areaPatterns = [
    /woonoppervlakte[^\d<]{0,40}(\d{2,4})\s*m/i,
    /(\d{2,4})\s*m²[^<]{0,20}woon/i,
    /"livingArea"\s*:\s*(\d{2,4})/i,
    /"floorArea"\s*:\s*(\d{2,4})/i,
    /gebruiksoppervlakte[^\d<]{0,40}(\d{2,4})/i,
    /woonopp[^\d<]{0,40}(\d{2,4})/i,
  ];
  let rxAreaVal: string | null = null;
  for (const p of areaPatterns) { const mm = html.match(p); if (mm) { rxAreaVal = mm[1]; break; } }

  const plotPatterns = [
    /perceeloppervlakte[^\d<]{0,40}(\d{2,5})\s*m/i,
    /"plotArea"\s*:\s*(\d{2,5})/i,
    /"lotSize"\s*:\s*(\d{2,5})/i,
    /grondoppervlak[^\d<]{0,40}(\d{2,5})/i,
    /perceel[^\d<]{0,40}(\d{2,5})\s*m/i,
  ];
  let rxPlotVal: string | null = null;
  for (const p of plotPatterns) { const mm = html.match(p); if (mm) { rxPlotVal = mm[1]; break; } }

  const rxEnergy = html.match(/energielabel[^A-Ga-g<]{0,40}?\b([A-G]\+{0,4})\b/i);
  const rxRooms = html.match(/(\d{1,2})\s*kamers/i);
  const rxYear = html.match(/bouwjaar[^\d]{0,40}?(\d{4})/i);

  regexResults["html.price_kk"] = rxPrice?.[1] ?? null;
  regexResults["html.living_area_m2"] = rxAreaVal;
  regexResults["html.energielabel"] = rxEnergy?.[1] ?? null;
  regexResults["html.rooms"] = rxRooms?.[1] ?? null;
  regexResults["html.bouwjaar"] = rxYear?.[1] ?? null;
  regexResults["html.perceel_m2"] = rxPlotVal;

  if (!prijs && rxPrice) {
    const n = Number(rxPrice[1].replace(/[^\d]/g, ""));
    if (n > 1000) prijs = n;
  }
  if (!m2 && rxAreaVal) m2 = Number(rxAreaVal);
  if (!kamers && rxRooms) kamers = Number(rxRooms[1]);
  if (!bouwjaar && rxYear) bouwjaar = Number(rxYear[1]);
  if (!label && rxEnergy) {
    label = normalizeLabel(rxEnergy[1]);
    rawEnergyLabel = rawEnergyLabel ?? rxEnergy[1];
    fieldPath = fieldPath ?? "html.energielabel";
    labelSource = "funda_html";
  }

  // 5) Energielabel — extra dt/dd kenmerken-blok als laatste redmiddel
  if (!label) {
    const dt =
      html.match(/Energielabel[\s\S]{0,400}?<dd[^>]*>\s*<[^>]*>?\s*([A-G]\+{0,4})/i) ??
      html.match(/Energielabel[\s\S]{0,200}?>\s*([A-G]\+{0,4})\s*</i);
    if (dt) {
      label = normalizeLabel(dt[1]);
      rawEnergyLabel = rawEnergyLabel ?? dt[1];
      fieldPath = fieldPath ?? "html.Energielabel.dt_dd";
      labelSource = "funda_html_dt";
      regexResults["html.energielabel_dt"] = dt[1];
    }
  }

  // Een pagina is alleen écht "blocked" als we hier helemaal niets uit konden halen
  const blocked = tooSmall || (!nextDataFound && !prijs && !adres && !label && !metaTitle);
  if (blocked) console.log("FUNDA BLOCKED — real page not returned");

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
    perceel_m2: rxPlotVal ? Number(rxPlotVal) : undefined,
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
      html_regex_results: regexResults,
      logs: [
        `Raw HTML length: ${htmlLength}`,
        `NEXT_DATA found: ${nextDataFound}`,
        `JSON-LD blocks found: ${ldBlocks.length}`,
        `meta og:title: ${metaTitle ?? "null"}`,
        `meta og:description: ${metaDesc ? metaDesc.slice(0, 120) + "…" : "null"}`,
        `meta og:price: ${metaPrice ?? "null"}`,
        `html regex price (k.k.): ${rxPrice?.[1] ?? "null"}`,
        `html regex living area: ${rxAreaVal ?? "null"}`,
        `html regex energielabel: ${rxEnergy?.[1] ?? "null"}`,
        `html regex rooms: ${rxRooms?.[1] ?? "null"}`,
        `html regex bouwjaar: ${rxYear?.[1] ?? "null"}`,
        `html regex perceel: ${rxPlotVal ?? "null"}`,
        `Energy label raw value: ${rawEnergyLabel ?? "null"}`,
        `Energy label field path used: ${fieldPath ?? "null"}`,
        `Energy label source: ${labelSource}`,
        `Final energy label returned: ${label ?? "null"}`,
        ...extraLogs,
        ...(blocked ? ["FUNDA BLOCKED — geen bruikbare data uit page"] : []),
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
