// Domain types for VastgoedAI
export type PandType = "woning" | "nieuwbouw" | "commercieel" | "gemengd";

export type Advies = "Kopen" | "Voorwaardelijk" | "Vermijden";

export interface Listing {
  url?: string;
  prijs?: number;
  vraagprijs?: number;
  m2?: number;
  bouwjaar?: number;
  energielabel?: string;
  kamers?: number;
  slaapkamers?: number;
  adres?: string;
  erfpacht?: boolean;
  beschrijving?: string;
  bron?: "scraperapi" | "manual";
}

export interface PdokResult {
  bagId?: string;
  adres: string;
  postcode?: string;
  woonplaats?: string;
  buurt?: string;
  gemeente?: string;
  lat?: number;
  lon?: number;
}

export interface BagData {
  oppervlakte?: number;
  gebruiksdoel?: string;
  bouwjaar?: number;
  status?: string;
  vbos?: number;
}

export interface WozEntry { jaar: number; waarde: number }

export interface AiAnalysis {
  investeringsthese: string;
  advies: Advies;
  score: number;
  risico: { locatie: number; staat: number; markt: number; liquiditeit: number };
  marktwaarde_ai: number;
  huurwaarde_ai: number;
  transformatieadvies: string;
  marktcontext: string;
  pandtype_bevestiging: PandType;
  commercieel_huurprijs_pm2?: number | null;
  bar_bruto?: number;
  nar_netto?: number;
  leegstandsrisico?: "laag" | "midden" | "hoog";
  huurprijszone?: "prime" | "secondary" | "perifeer";
  opmerkingen: string[];
}

export interface PropertyAnalysis {
  id: string;
  timestamp: number;
  input: string;
  pandtype: PandType;
  listing?: Listing;
  pdok?: PdokResult;
  bag?: BagData;
  woz?: WozEntry[];
  energielabel?: { label: string; bron?: string };
  monument?: { rijksmonument: boolean; beschermdGezicht?: string | null };
  perceel_m2?: number;
  bestemmingsplan?: { naam?: string; status?: string };
  ai: AiAnalysis;
  errors?: Record<string, string>;
}
