import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { ManualOverrides, PropertyAnalysis } from "@/lib/types";
import { ENERGY_LABELS } from "@/lib/overrides";
import { SourceBadge } from "./SourceBadge";

export function ManualOverridePanel({ a, onSave }: { a: PropertyAnalysis; onSave: (overrides: ManualOverrides) => void }) {
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<ManualOverrides>(a.manual_overrides ?? {});

  useEffect(() => setValues(a.manual_overrides ?? {}), [a.id, a.manual_overrides]);

  const setNumber = (key: keyof ManualOverrides, value: string) => {
    const n = value === "" ? undefined : Number(value);
    setValues((v) => ({ ...v, [key]: Number.isFinite(n) ? n : undefined }));
  };

  return (
    <div className="bg-card border rounded-lg p-5 space-y-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Handmatige correcties</div>
          <div className="text-sm text-muted-foreground mt-1">Deze waarden overschrijven altijd scraped/API-data en worden direct in berekeningen gebruikt.</div>
        </div>
        <SourceBadge source="handmatig" />
      </button>
      {open && (
        <div className="space-y-4 border-t pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs space-y-1 block">
              <span className="text-muted-foreground">Energielabel</span>
              <select value={values.energielabel ?? ""} onChange={(e) => setValues((v) => ({ ...v, energielabel: e.target.value || undefined }))} className="w-full bg-background border rounded px-2 py-2 text-sm">
                <option value="">Geen override</option>
                {ENERGY_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <NumInput label="Woonoppervlakte m²" value={values.living_area_m2} onChange={(v) => setNumber("living_area_m2", v)} />
            <NumInput label="Vraagprijs" value={values.asking_price} onChange={(v) => setNumber("asking_price", v)} />
            <NumInput label="Perceeloppervlakte m²" value={values.plot_area_m2} disabled={!!values.plot_not_applicable} onChange={(v) => setNumber("plot_area_m2", v)} />
            <NumInput label="Aantal kamers" value={values.rooms} onChange={(v) => setNumber("rooms", v)} />
            <NumInput label="Bouwjaar" value={values.build_year} onChange={(v) => setNumber("build_year", v)} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={!!values.plot_not_applicable} onChange={(e) => setValues((v) => ({ ...v, plot_not_applicable: e.target.checked, plot_area_m2: e.target.checked ? undefined : v.plot_area_m2 }))} className="size-4 accent-primary" />
            Niet van toepassing — appartement
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => onSave(values)} className="inline-flex items-center gap-2 bg-navy text-primary-foreground rounded-md px-4 py-2 text-sm font-bold shadow-card hover:shadow-elevated transition">
              <CheckCircle2 className="size-4" />
              Handmatige waarden toepassen
            </button>
            {a.field_sources && Object.values(a.field_sources).includes("handmatig") && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><SourceBadge source="handmatig" /> Handmatig ingevoerd</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NumInput({ label, value, disabled, onChange }: { label: string; value?: number; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="text-xs space-y-1 block">
      <span className="text-muted-foreground">{label}</span>
      <input type="number" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full bg-background border rounded px-2 py-2 tabular text-sm disabled:opacity-50" />
    </label>
  );
}