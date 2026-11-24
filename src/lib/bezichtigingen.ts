import { supabase } from "@/integrations/supabase/client";
import type {
  Bezichtiging,
  BezichtigingInsert,
  BezichtigingMedia,
  BezichtigingUpdate,
} from "@/integrations/supabase/types";

export const BUCKET = "bezichtigingen";

export const STATUSSEN = [
  { id: "gepland", label: "Gepland", kleur: "bg-muted text-muted-foreground" },
  { id: "bezocht", label: "Bezocht", kleur: "bg-[var(--source-funda-bg)] text-[var(--source-funda)]" },
  { id: "interessant", label: "Interessant", kleur: "bg-[var(--source-manual-bg)] text-[var(--source-manual)]" },
  { id: "bod_uitgebracht", label: "Bod uitgebracht", kleur: "bg-[var(--source-altum-bg)] text-[var(--source-altum)]" },
  { id: "gekocht", label: "Gekocht", kleur: "bg-[var(--source-ep-bg)] text-[var(--source-ep)]" },
  { id: "afgewezen", label: "Afgewezen", kleur: "bg-destructive/10 text-destructive" },
] as const;

export type StatusId = (typeof STATUSSEN)[number]["id"];

export function statusInfo(id: string) {
  return STATUSSEN.find((s) => s.id === id) ?? STATUSSEN[1];
}

export const RUIMTES = [
  "Buitenkant",
  "Woonkamer",
  "Keuken",
  "Badkamer",
  "Slaapkamer",
  "Zolder",
  "Kelder / kruipruimte",
  "Tuin",
  "Dak",
  "Installaties",
  "Gebreken",
  "Overig",
];

export const BRON_LABELS: Record<string, string> = {
  funda: "Funda",
  bag: "BAG",
  ep_online: "EP-online",
  woz_loket: "WOZ-loket",
  pdok: "PDOK",
  rce: "RCE",
  handmatig: "Handmatig",
};

// ---------- Bezichtigingen ----------

export async function lijstBezichtigingen() {
  const { data, error } = await supabase
    .from("bezichtigingen")
    .select("*")
    .order("datum", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Bezichtiging[];
}

export async function haalBezichtiging(id: string) {
  const { data, error } = await supabase.from("bezichtigingen").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Bezichtiging;
}

export async function maakBezichtiging(input: BezichtigingInsert) {
  const { data, error } = await supabase.from("bezichtigingen").insert(input).select("*").single();
  if (error) throw error;
  return data as Bezichtiging;
}

export async function wijzigBezichtiging(id: string, patch: BezichtigingUpdate) {
  const { data, error } = await supabase
    .from("bezichtigingen")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Bezichtiging;
}

export async function verwijderBezichtiging(id: string) {
  const media = await lijstMedia(id);
  if (media.length) await supabase.storage.from(BUCKET).remove(media.map((m) => m.pad));
  const { error } = await supabase.from("bezichtigingen").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Media ----------

export async function lijstMedia(bezichtigingId: string) {
  const { data, error } = await supabase
    .from("bezichtiging_media")
    .select("*")
    .eq("bezichtiging_id", bezichtigingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as BezichtigingMedia[];
}

/** Eerste foto per bezichtiging, voor de kaartjes op het overzicht. */
export async function omslagFotos(ids: string[]) {
  if (!ids.length) return {} as Record<string, string>;
  const { data, error } = await supabase
    .from("bezichtiging_media")
    .select("bezichtiging_id, pad, created_at")
    .in("bezichtiging_id", ids)
    .eq("soort", "foto")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const eerste: Record<string, string> = {};
  for (const m of data ?? []) if (!eerste[m.bezichtiging_id]) eerste[m.bezichtiging_id] = m.pad;
  const paden = Object.values(eerste);
  if (!paden.length) return {};
  const urls = await ondertekendeUrls(paden);
  const out: Record<string, string> = {};
  for (const [id, pad] of Object.entries(eerste)) if (urls[pad]) out[id] = urls[pad];
  return out;
}

export async function ondertekendeUrls(paden: string[]) {
  if (!paden.length) return {} as Record<string, string>;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paden, 60 * 60);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

const MAX_BYTES = 50 * 1024 * 1024;

export async function uploadMedia(
  bezichtigingId: string,
  bestand: File,
  ruimte: string | null,
): Promise<BezichtigingMedia> {
  const isVideo = bestand.type.startsWith("video/");
  const upload = isVideo ? bestand : await verkleinFoto(bestand);
  if (upload.size > MAX_BYTES) {
    throw new Error(`${bestand.name} is groter dan 50 MB. Neem een kortere video op.`);
  }
  const ext = isVideo ? (bestand.name.split(".").pop() || "mp4").toLowerCase() : "jpg";
  const pad = `${bezichtigingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(pad, upload, {
    contentType: isVideo ? bestand.type : "image/jpeg",
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from("bezichtiging_media")
    .insert({
      bezichtiging_id: bezichtigingId,
      pad,
      soort: isVideo ? "video" : "foto",
      ruimte,
      mime_type: isVideo ? bestand.type : "image/jpeg",
      grootte_bytes: upload.size,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([pad]);
    throw error;
  }
  return data as BezichtigingMedia;
}

export async function wijzigMedia(id: string, patch: Partial<Pick<BezichtigingMedia, "ruimte" | "bijschrift">>) {
  const { error } = await supabase.from("bezichtiging_media").update(patch).eq("id", id);
  if (error) throw error;
}

export async function verwijderMedia(m: BezichtigingMedia) {
  await supabase.storage.from(BUCKET).remove([m.pad]);
  const { error } = await supabase.from("bezichtiging_media").delete().eq("id", m.id);
  if (error) throw error;
}

/** Verkleint telefoonfoto's tot max 2000px (scheelt veel opslag en uploadtijd). */
async function verkleinFoto(bestand: File, maxZijde = 2000, kwaliteit = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(bestand, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const schaal = Math.min(1, maxZijde / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * schaal);
    canvas.height = Math.round(bitmap.height * schaal);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", kwaliteit));
    return blob ?? bestand;
  } catch {
    return bestand;
  }
}

// ---------- Formattering ----------

export const eur = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export const getal = (n?: number | null, suffix = "") =>
  n == null ? "—" : `${new Intl.NumberFormat("nl-NL").format(n)}${suffix}`;

export const datumKort = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function prijsPerM2(b: Pick<Bezichtiging, "vraagprijs" | "woonoppervlakte_m2">) {
  return b.vraagprijs && b.woonoppervlakte_m2 ? Math.round(b.vraagprijs / b.woonoppervlakte_m2) : null;
}
