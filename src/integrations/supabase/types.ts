// Gegenereerd uit het Supabase-schema (project wgmdgjponkkfvgqplexo).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type BezichtigingRow = {
  aanwezig: string | null;
  adres: string;
  analyse_at: string | null;
  analyse_data: Json | null;
  bag_id: string | null;
  bod_idee: number | null;
  bouwjaar: number | null;
  bronnen: Json;
  buurt: string | null;
  created_at: string;
  created_by: string | null;
  datum: string | null;
  energielabel: string | null;
  erfpacht: boolean | null;
  funda_url: string | null;
  gebruiksdoel: string | null;
  gemeente: string | null;
  id: string;
  indruk: number | null;
  inhoud_m3: number | null;
  kamers: number | null;
  lat: number | null;
  lon: number | null;
  makelaar: string | null;
  makelaar_contact: string | null;
  minpunten: string | null;
  naar_portefeuille_at: string | null;
  notities: string | null;
  pandtype: string | null;
  perceel_m2: number | null;
  pluspunten: string | null;
  postcode: string | null;
  renovatie_schatting: number | null;
  rijksmonument: boolean | null;
  slaapkamers: number | null;
  staat: string | null;
  status: string;
  updated_at: string;
  vraagprijs: number | null;
  vve_bijdrage: number | null;
  woningtype: string | null;
  woonoppervlakte_m2: number | null;
  woonplaats: string | null;
  woz_jaar: number | null;
  woz_waarde: number | null;
};

type MediaRow = {
  bezichtiging_id: string;
  bijschrift: string | null;
  created_at: string;
  created_by: string | null;
  grootte_bytes: number | null;
  id: string;
  mime_type: string | null;
  pad: string;
  ruimte: string | null;
  soort: string;
};

type TeamLidRow = { created_at: string; email: string; naam: string | null };

type Optional<T, Required extends keyof T> = Partial<T> & Pick<T, Required>;

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      bezichtigingen: {
        Row: BezichtigingRow;
        Insert: Optional<BezichtigingRow, "adres">;
        Update: Partial<BezichtigingRow>;
        Relationships: [];
      };
      bezichtiging_media: {
        Row: MediaRow;
        Insert: Optional<MediaRow, "bezichtiging_id" | "pad" | "soort">;
        Update: Partial<MediaRow>;
        Relationships: [
          {
            foreignKeyName: "bezichtiging_media_bezichtiging_id_fkey";
            columns: ["bezichtiging_id"];
            isOneToOne: false;
            referencedRelation: "bezichtigingen";
            referencedColumns: ["id"];
          },
        ];
      };
      team_leden: {
        Row: TeamLidRow;
        Insert: Optional<TeamLidRow, "email">;
        Update: Partial<TeamLidRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { is_teamlid: { Args: never; Returns: boolean } };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Bezichtiging = BezichtigingRow;
export type BezichtigingInsert = Database["public"]["Tables"]["bezichtigingen"]["Insert"];
export type BezichtigingUpdate = Database["public"]["Tables"]["bezichtigingen"]["Update"];
export type BezichtigingMedia = MediaRow;
