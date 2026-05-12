import { useState } from "react";
import { Loader2, CheckCircle2, MapPin } from "lucide-react";
import type { ManualOverrides, PandType, PrefillResult } from "@/lib/types";
import { ENERGY_LABELS } from "@/lib/overrides";

const WONING_TYPES = [
  "Eengezinswoning",
  "Tussenwoning",
  "Hoekwoning",
  "2-onder-1-kapwoning",
  "Vrijstaande woning",
  "Appartement",
  "Bovenwoning",
  "Benedenwoning",
  "Maisonnette",
  "Penthouse",
  "Studio",
];

const STAAT_OPTIES = ["Uitstekend", "Goed", "Redelijk", "Slecht"] as const;

type SourceTag = "funda" | "bag" | "ep_online";

interface Props {
  prefill: PrefillResult;
  pandtype: PandType;
  onSubmit: (input: ManualOverrides) => void;
  onCancel: () => void;
  loading: boolean;
}

function SourceBadge({ source }: { source?: SourceTag }) {
  if (!source) return null;
  const map: Record<SourceTag, { label: string; cls: string }> = {
    funda: { label: "Funda", cls: "bg-blue-100 text-blue-800 border-blue-300" },
    bag: { label: "BAG", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    ep_online: { label: "EP-online", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  };
  const m = map[source];
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function PrefillForm({ prefill, pandtype, onSubmit, onCancel, loading }: Props) {
  const p = prefill.prefill;
  const [vraagprijs, setVraagprijs] = useState<string>(p.asking_price ? String(p.asking_price) : "");
  const [oppervlakte, setOppervlakte] = useState<string>(p.living_area_m2 ? String(p.living_area_m2) : "");
  const [perceel, setPerceel] = useState<string>(p.plot_area_m2 ? String(p.plot_area_m2) : "");
  const [perceelNvt, setPerceelNvt] = useState<boolean>(false);
  const [kamers, setKamers] = useState<string>(p.rooms ? String(p.rooms) : "");
  const [energielabel, setEnergielabel] = useState<string>(p.energielabel ?? "");
  const [bouwjaar, setBouwjaar] = useState<string>(p.build_year ? String(p.build_year) : "");
  const [woningType, setWoningType] = useState<string>("");
  const [staat, setStaat] = useState<string>("Goed");
  const [erfpacht, setErfpacht] = useState<boolean>(false);
  const [bijzonderheden, setBijzonderheden] = useState<string>("");

  const submit = () => {
    onSubmit({
      asking_price: vraagprijs ? Number(vraagprijs) : undefined,
      living_area_m2: oppervlakte ? Number(oppervlakte) : undefined,
      plot_area_m2: !perceelNvt && perceel ? Number(perceel) : undefined,
      plot_not_applicable: perceelNvt,
      rooms: kamers ? Number(kamers) : undefined,
      energielabel: energielabel || undefined,
      build_year: bouwjaar ? Number(bouwjaar) : undefined,
      woning_type: woningType || undefined,
      staat: staat || undefined,
      erfpacht,
      bijzonderheden: bijzonderheden || undefined,
    });
  };

  const required = vraagprijs && oppervlakte && kamers && energielabel && bouwjaar && woningType;
  const adres = prefill.pdok?.adres ?? prefill.query;

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-6">
        <div>
          <div className="label-eyebrow">Stap 2 van 2 — Verificatie</div>
          <h1 className="display text-2xl md:text-3xl font-extrabold text-navy mt-2">Controleer & vul aan</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Velden zijn waar mogelijk pre-filled vanuit officiële databronnen (BAG, EP-online) en{" "}
            {prefill.funda ? "Funda (best-effort)" : "Funda kon niet worden gelezen"}.
            Controleer alle waarden — handmatige invoer = 100% betrouwbare analyse.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-sm bg-muted border border-border rounded-md px-3 py-2">
            <MapPin className="size-4 text-navy" />
            <span className="font-medium">{adres}</span>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Vraagprijs (€)" required>
              <input type="number" value={vraagprijs} onChange={(e) => setVraagprijs(e.target.value)} placeholder="bijv. 425000" className={inputCls} />
              <SourceRow source={p.sources.asking_price as SourceTag | undefined} />
            </Field>

            <Field label="Woonoppervlakte (m²)" required>
              <input type="number" value={oppervlakte} onChange={(e) => setOppervlakte(e.target.value)} placeholder="bijv. 95" className={inputCls} />
              <SourceRow source={p.sources.living_area_m2 as SourceTag | undefined} />
            </Field>

            <Field label="Perceeloppervlakte (m²)">
              <input type="number" value={perceel} disabled={perceelNvt} onChange={(e) => setPerceel(e.target.value)} placeholder="bijv. 120" className={inputCls + " disabled:opacity-40"} />
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <input type="checkbox" checked={perceelNvt} onChange={(e) => setPerceelNvt(e.target.checked)} className="size-3.5 accent-primary" />
                Niet van toepassing — appartement
              </label>
              <SourceRow source={p.sources.plot_area_m2 as SourceTag | undefined} />
            </Field>

            <Field label="Aantal kamers" required>
              <input type="number" value={kamers} onChange={(e) => setKamers(e.target.value)} placeholder="bijv. 4" className={inputCls} />
              <SourceRow source={p.sources.rooms as SourceTag | undefined} />
            </Field>

            <Field label="Energielabel" required>
              <select value={energielabel} onChange={(e) => setEnergielabel(e.target.value)} className={inputCls}>
                <option value="">— Selecteer —</option>
                {ENERGY_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <SourceRow source={p.sources.energielabel as SourceTag | undefined} />
            </Field>

            <Field label="Bouwjaar" required>
              <input type="number" value={bouwjaar} onChange={(e) => setBouwjaar(e.target.value)} placeholder="bijv. 1931" className={inputCls} />
              <SourceRow source={p.sources.build_year as SourceTag | undefined} />
            </Field>

            <Field label="Type woning" required>
              <select value={woningType} onChange={(e) => setWoningType(e.target.value)} className={inputCls}>
                <option value="">— Selecteer —</option>
                {WONING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="Staat van onderhoud">
              <select value={staat} onChange={(e) => setStaat(e.target.value)} className={inputCls}>
                {STAAT_OPTIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div>
            <span className="text-xs text-muted-foreground block mb-2">Erfpacht</span>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button type="button" onClick={() => setErfpacht(false)} className={`px-4 py-2 text-sm ${!erfpacht ? "bg-navy text-primary-foreground font-bold" : "bg-background"}`}>Nee — eigen grond</button>
              <button type="button" onClick={() => setErfpacht(true)} className={`px-4 py-2 text-sm border-l border-border ${erfpacht ? "bg-navy text-primary-foreground font-bold" : "bg-background"}`}>Ja — erfpacht</button>
            </div>
          </div>

          <Field label="Bijzonderheden (optioneel)">
            <textarea value={bijzonderheden} onChange={(e) => setBijzonderheden(e.target.value)} placeholder="Bijv. monumentaal pand, recent gerenoveerd, beleggingspand verhuurd, …" rows={3} className={inputCls + " resize-none"} />
          </Field>

          <div className="flex items-center justify-between pt-3 border-t">
            <button type="button" onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground">← Andere woning</button>
            <button
              type="button"
              onClick={submit}
              disabled={!required || loading}
              className="inline-flex items-center gap-2 bg-navy disabled:opacity-50 text-primary-foreground rounded-md px-6 py-3 text-sm font-bold tracking-wide shadow-card hover:shadow-elevated transition"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {loading ? "Analyse loopt…" : "Start Analyse"}
            </button>
          </div>
          {!required && (
            <p className="text-xs text-muted-foreground text-right">Vul alle verplichte velden in om te starten.</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Pandtype: <span className="font-medium text-foreground">{pandtype}</span>
        </p>
      </div>
    </div>
  );
}

const inputCls = "w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-foreground flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

function SourceRow({ source }: { source?: SourceTag }) {
  if (!source) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground">Vooringevuld uit:</span>
      <SourceBadge source={source} />
    </div>
  );
}
