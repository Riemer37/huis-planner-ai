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
