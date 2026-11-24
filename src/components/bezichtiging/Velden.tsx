import type { ReactNode } from "react";
import { Star } from "lucide-react";
import type { Bezichtiging } from "@/integrations/supabase/types";
import { STATUSSEN } from "@/lib/bezichtigingen";
import { BronTag } from "./Badges";

export type Concept = Partial<Bezichtiging>;
type Zet = <K extends keyof Bezichtiging>(veld: K, waarde: Bezichtiging[K] | null) => void;

const invoer =
  "mt-1 w-full bg-card rounded-md px-3 py-2.5 text-sm border border-border disabled:opacity-60";

export function Sectie({ titel, children, rechts }: { titel: string; children: ReactNode; rechts?: ReactNode }) {
  return (
    <section className="panel p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-navy">{titel}</h2>
        {rechts}
      </div>
      {children}
    </section>
  );
}

function Veld({ label, bron, children, breed }: { label: string; bron?: string; children: ReactNode; breed?: boolean }) {
  return (
    <label className={`block ${breed ? "sm:col-span-2" : ""}`}>
      <span className="label-eyebrow flex items-center gap-1.5 min-w-0 whitespace-nowrap">
        <span className="truncate">{label}</span>
        <BronTag bron={bron} />
      </span>
      {children}
    </label>
  );
}

function bronVan(c: Concept, veld: string) {
  const b = c.bronnen as Record<string, string> | undefined;
  return b?.[veld];
}

function Tekst({ c, zet, veld, label, type = "text", placeholder, breed }: {
  c: Concept; zet: Zet; veld: keyof Bezichtiging; label: string; type?: string; placeholder?: string; breed?: boolean;
}) {
  return (
    <Veld label={label} bron={bronVan(c, veld)} breed={breed}>
      <input
        type={type}
        value={(c[veld] as string | null) ?? ""}
        placeholder={placeholder}
        onChange={(e) => zet(veld, (e.target.value || null) as any)}
        className={invoer}
      />
    </Veld>
  );
}

function Getal({ c, zet, veld, label, eenheid, stap }: {
  c: Concept; zet: Zet; veld: keyof Bezichtiging; label: string; eenheid?: string; stap?: number;
}) {
  const v = c[veld] as number | null | undefined;
  return (
    <Veld label={label} bron={bronVan(c, veld)}>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={stap ?? "any"}
          value={v ?? ""}
          onChange={(e) => zet(veld, (e.target.value === "" ? null : Number(e.target.value)) as any)}
          className={`${invoer} ${eenheid ? "pr-10" : ""}`}
        />
        {eenheid && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-xs text-muted-foreground">{eenheid}</span>
        )}
      </div>
    </Veld>
  );
}

function Keuze({ c, zet, veld, label, opties }: {
  c: Concept; zet: Zet; veld: keyof Bezichtiging; label: string; opties: { id: string; label: string }[];
}) {
  return (
    <Veld label={label} bron={bronVan(c, veld)}>
      <select
        value={(c[veld] as string | null) ?? ""}
        onChange={(e) => zet(veld, (e.target.value || null) as any)}
        className={invoer}
      >
        <option value="">—</option>
        {opties.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Veld>
  );
}

function JaNee({ c, zet, veld, label }: { c: Concept; zet: Zet; veld: keyof Bezichtiging; label: string }) {
  const v = c[veld] as boolean | null | undefined;
  return (
    <Veld label={label} bron={bronVan(c, veld)}>
      <select
        value={v == null ? "" : v ? "ja" : "nee"}
        onChange={(e) => zet(veld, (e.target.value === "" ? null : e.target.value === "ja") as any)}
        className={invoer}
      >
        <option value="">Onbekend</option>
        <option value="ja">Ja</option>
        <option value="nee">Nee</option>
      </select>
    </Veld>
  );
}

const ENERGIELABELS = ["A++++", "A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"].map((l) => ({ id: l, label: l }));
const STAAT = [
  { id: "uitstekend", label: "Uitstekend" },
  { id: "goed", label: "Goed" },
  { id: "redelijk", label: "Redelijk" },
  { id: "slecht", label: "Slecht (renovatie)" },
  { id: "sloop", label: "Sloop / nieuwbouw" },
];
const PANDTYPE = [
  { id: "woning", label: "Woning" },
  { id: "nieuwbouw", label: "Nieuwbouw" },
  { id: "commercieel", label: "Commercieel" },
  { id: "gemengd", label: "Gemengd (woon/werk)" },
];

export function BezichtigingVelden({ c, zet }: { c: Concept; zet: Zet }) {
  return (
    <Sectie titel="Bezichtiging">
      <div className="grid gap-3 sm:grid-cols-2">
        <Tekst c={c} zet={zet} veld="adres" label="Adres" breed />
        <Tekst c={c} zet={zet} veld="datum" label="Datum" type="date" />
        <Keuze c={c} zet={zet} veld="status" label="Status" opties={STATUSSEN.map((s) => ({ id: s.id, label: s.label }))} />
        <Tekst c={c} zet={zet} veld="aanwezig" label="Wie waren erbij" placeholder="Riemer, Evert" />
        <Tekst c={c} zet={zet} veld="makelaar" label="Makelaar" />
        <Tekst c={c} zet={zet} veld="makelaar_contact" label="Contact makelaar" placeholder="Telefoon of e-mail" />
        <Tekst c={c} zet={zet} veld="funda_url" label="Funda-link" type="url" />
      </div>
    </Sectie>
  );
}

export function PandVelden({ c, zet }: { c: Concept; zet: Zet }) {
  return (
    <Sectie titel="Pandgegevens">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <Getal c={c} zet={zet} veld="vraagprijs" label="Vraagprijs" eenheid="€" stap={1000} />
        <Getal c={c} zet={zet} veld="woonoppervlakte_m2" label="Woonoppervlakte" eenheid="m²" />
        <Getal c={c} zet={zet} veld="perceel_m2" label="Perceel" eenheid="m²" />
        <Getal c={c} zet={zet} veld="inhoud_m3" label="Inhoud" eenheid="m³" />
        <Getal c={c} zet={zet} veld="bouwjaar" label="Bouwjaar" stap={1} />
        <Keuze c={c} zet={zet} veld="energielabel" label="Energielabel" opties={ENERGIELABELS} />
        <Getal c={c} zet={zet} veld="kamers" label="Kamers" stap={1} />
        <Getal c={c} zet={zet} veld="slaapkamers" label="Slaapkamers" stap={1} />
        <Getal c={c} zet={zet} veld="woz_waarde" label={`WOZ-waarde${c.woz_jaar ? ` ${c.woz_jaar}` : ""}`} eenheid="€" stap={1000} />
        <Keuze c={c} zet={zet} veld="pandtype" label="Pandtype" opties={PANDTYPE} />
        <Tekst c={c} zet={zet} veld="woningtype" label="Woningtype" placeholder="Tussenwoning, appartement…" />
        <Keuze c={c} zet={zet} veld="staat" label="Staat van onderhoud" opties={STAAT} />
        <JaNee c={c} zet={zet} veld="erfpacht" label="Erfpacht" />
        <Getal c={c} zet={zet} veld="vve_bijdrage" label="VvE p/m" eenheid="€" />
        <JaNee c={c} zet={zet} veld="rijksmonument" label="Rijksmonument" />
      </div>
      {c.gebruiksdoel && (
        <p className="mt-3 text-xs text-muted-foreground">
          Gebruiksdoel volgens BAG: <span className="font-medium text-foreground">{c.gebruiksdoel}</span>
        </p>
      )}
    </Sectie>
  );
}

export function BeoordelingVelden({ c, zet }: { c: Concept; zet: Zet }) {
  return (
    <Sectie titel="Onze beoordeling">
      <div className="space-y-3">
        <div>
          <span className="label-eyebrow">Eerste indruk</span>
          <div className="flex gap-1 mt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => zet("indruk", c.indruk === n ? null : n)}
                className="p-1"
                aria-label={`${n} sterren`}
              >
                <Star className={`size-6 ${(c.indruk ?? 0) >= n ? "fill-[var(--gold)] text-[var(--gold)]" : "text-border"}`} />
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Veld label="Pluspunten">
            <textarea
              rows={3}
              value={c.pluspunten ?? ""}
              onChange={(e) => zet("pluspunten", e.target.value || null)}
              className={invoer}
              placeholder="Ligging, indeling, licht…"
            />
          </Veld>
          <Veld label="Minpunten">
            <textarea
              rows={3}
              value={c.minpunten ?? ""}
              onChange={(e) => zet("minpunten", e.target.value || null)}
              className={invoer}
              placeholder="Vocht, fundering, dak…"
            />
          </Veld>
        </div>
        <Veld label="Notities">
          <textarea
            rows={4}
            value={c.notities ?? ""}
            onChange={(e) => zet("notities", e.target.value || null)}
            className={invoer}
          />
        </Veld>
        <div className="grid gap-3 grid-cols-2">
          <Getal c={c} zet={zet} veld="renovatie_schatting" label="Renovatiekosten" eenheid="€" stap={1000} />
          <Getal c={c} zet={zet} veld="bod_idee" label="Ons bod-idee" eenheid="€" stap={1000} />
        </div>
      </div>
    </Sectie>
  );
}
