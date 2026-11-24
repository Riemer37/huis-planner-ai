import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, Play, Trash2, Video, X } from "lucide-react";
import type { BezichtigingMedia } from "@/integrations/supabase/types";
import { RUIMTES, lijstMedia, ondertekendeUrls, uploadMedia, verwijderMedia, wijzigMedia } from "@/lib/bezichtigingen";

export function MediaGalerij({ bezichtigingId }: { bezichtigingId: string }) {
  const qc = useQueryClient();
  const camera = useRef<HTMLInputElement>(null);
  const galerij = useRef<HTMLInputElement>(null);
  const [ruimte, setRuimte] = useState<string>("");
  const [voortgang, setVoortgang] = useState<{ klaar: number; totaal: number } | null>(null);
  const [fouten, setFouten] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("alle");

  const media = useQuery({ queryKey: ["media", bezichtigingId], queryFn: () => lijstMedia(bezichtigingId) });
  const paden = (media.data ?? []).map((m) => m.pad);
  const urls = useQuery({
    queryKey: ["media-urls", paden.join(",")],
    queryFn: () => ondertekendeUrls(paden),
    enabled: paden.length > 0,
    staleTime: 45 * 60 * 1000,
  });

  const zichtbaar = useMemo(
    () => (media.data ?? []).filter((m) => filter === "alle" || (m.ruimte ?? "Overig") === filter),
    [media.data, filter],
  );
  const ruimtesInGebruik = useMemo(
    () => Array.from(new Set((media.data ?? []).map((m) => m.ruimte ?? "Overig"))),
    [media.data],
  );

  const upload = async (lijst: FileList | null) => {
    if (!lijst?.length) return;
    const bestanden = Array.from(lijst);
    setFouten([]);
    setVoortgang({ klaar: 0, totaal: bestanden.length });
    const nieuweFouten: string[] = [];
    // Twee tegelijk: snel, maar overbelast een mobiele verbinding niet
    let i = 0;
    const werker = async () => {
      while (i < bestanden.length) {
        const f = bestanden[i++];
        try {
          await uploadMedia(bezichtigingId, f, ruimte || null);
        } catch (e) {
          nieuweFouten.push(`${f.name}: ${(e as Error).message}`);
        }
        setVoortgang((v) => (v ? { ...v, klaar: v.klaar + 1 } : v));
      }
    };
    await Promise.all([werker(), werker()]);
    setVoortgang(null);
    setFouten(nieuweFouten);
    await qc.invalidateQueries({ queryKey: ["media", bezichtigingId] });
    qc.invalidateQueries({ queryKey: ["omslagfotos"] });
  };

  const verwijder = async (m: BezichtigingMedia) => {
    if (!confirm("Dit bestand verwijderen?")) return;
    await verwijderMedia(m);
    setOpen(null);
    qc.invalidateQueries({ queryKey: ["media", bezichtigingId] });
    qc.invalidateQueries({ queryKey: ["omslagfotos"] });
  };

  const zetRuimte = async (m: BezichtigingMedia, r: string) => {
    await wijzigMedia(m.id, { ruimte: r || null });
    qc.invalidateQueries({ queryKey: ["media", bezichtigingId] });
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4 space-y-3">
        <label className="block">
          <span className="label-eyebrow">Ruimte (optioneel)</span>
          <select
            value={ruimte}
            onChange={(e) => setRuimte(e.target.value)}
            className="mt-1 w-full bg-card rounded-md px-3 py-2.5 text-sm border border-border"
          >
            <option value="">Geen / later indelen</option>
            {RUIMTES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => camera.current?.click()}
            disabled={!!voortgang}
            className="inline-flex items-center justify-center gap-2 bg-navy text-primary-foreground rounded-md py-3 text-sm font-bold disabled:opacity-50"
          >
            <Camera className="size-4" /> Foto / video maken
          </button>
          <button
            onClick={() => galerij.current?.click()}
            disabled={!!voortgang}
            className="inline-flex items-center justify-center gap-2 border border-border bg-card rounded-md py-3 text-sm font-semibold disabled:opacity-50"
          >
            <ImagePlus className="size-4" /> Uit galerij
          </button>
        </div>
        <input ref={camera} type="file" accept="image/*,video/*" capture="environment" className="hidden"
          onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        <input ref={galerij} type="file" accept="image/*,video/*" multiple className="hidden"
          onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        {voortgang && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" /> Uploaden…
              </span>
              <span>
                {voortgang.klaar} / {voortgang.totaal}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-navy transition-all" style={{ width: `${(voortgang.klaar / voortgang.totaal) * 100}%` }} />
            </div>
          </div>
        )}
        {fouten.length > 0 && (
          <ul className="text-xs text-destructive space-y-0.5">
            {fouten.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>

      {ruimtesInGebruik.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["alle", ...ruimtesInGebruik].map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold border ${
                filter === r ? "bg-navy text-primary-foreground border-transparent" : "bg-card text-muted-foreground border-border"
              }`}
            >
              {r === "alle" ? "Alles" : r}
            </button>
          ))}
        </div>
      )}

      {media.isLoading ? (
        <div className="py-10 flex justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !zichtbaar.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nog geen foto's of video's.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-1.5">
          {zichtbaar.map((m, idx) => {
            const url = urls.data?.[m.pad];
            return (
              <button key={m.id} onClick={() => setOpen(idx)} className="relative aspect-square bg-muted rounded overflow-hidden">
                {url && m.soort === "foto" && (
                  <img src={url} alt={m.ruimte ?? ""} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                )}
                {url && m.soort === "video" && (
                  <>
                    <video src={`${url}#t=0.5`} preload="metadata" muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="size-8 rounded-full bg-black/50 flex items-center justify-center">
                        <Play className="size-4 text-white fill-white" />
                      </div>
                    </div>
                  </>
                )}
                {m.ruimte && (
                  <span className="absolute bottom-1 left-1 right-1 truncate text-left text-[10px] font-semibold text-white bg-black/45 rounded px-1 py-px">
                    {m.ruimte}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {open !== null && zichtbaar[open] && (
        <Lightbox
          m={zichtbaar[open]}
          url={urls.data?.[zichtbaar[open].pad]}
          vorige={open > 0 ? () => setOpen(open - 1) : undefined}
          volgende={open < zichtbaar.length - 1 ? () => setOpen(open + 1) : undefined}
          sluit={() => setOpen(null)}
          verwijder={() => verwijder(zichtbaar[open])}
          zetRuimte={(r) => zetRuimte(zichtbaar[open], r)}
        />
      )}
    </div>
  );
}

function Lightbox({ m, url, vorige, volgende, sluit, verwijder, zetRuimte }: {
  m: BezichtigingMedia; url?: string; vorige?: () => void; volgende?: () => void; sluit: () => void;
  verwijder: () => void; zetRuimte: (r: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center gap-2 p-3 text-white">
        <select
          value={m.ruimte ?? ""}
          onChange={(e) => zetRuimte(e.target.value)}
          className="bg-white/10 text-white rounded-md px-2 py-1.5 text-sm border border-white/20"
        >
          <option value="" className="text-black">Geen ruimte</option>
          {RUIMTES.map((r) => (
            <option key={r} className="text-black">{r}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-sm rounded-md hover:bg-white/10">
              Origineel
            </a>
          )}
          <button onClick={verwijder} className="p-2 rounded-md hover:bg-white/10" title="Verwijderen">
            <Trash2 className="size-5" />
          </button>
          <button onClick={sluit} className="p-2 rounded-md hover:bg-white/10" title="Sluiten">
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative flex items-center justify-center min-h-0">
        {!url ? (
          <Loader2 className="size-6 animate-spin text-white" />
        ) : m.soort === "video" ? (
          <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
        ) : (
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        )}
        {vorige && (
          <button onClick={vorige} className="absolute left-2 p-2 rounded-full bg-black/40 text-white">
            <ChevronLeft className="size-6" />
          </button>
        )}
        {volgende && (
          <button onClick={volgende} className="absolute right-2 p-2 rounded-full bg-black/40 text-white">
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>
      <div className="p-3 text-center text-xs text-white/60 inline-flex items-center justify-center gap-1.5">
        {m.soort === "video" && <Video className="size-3.5" />}
        {new Date(m.created_at).toLocaleString("nl-NL")}
      </div>
    </div>
  );
}
