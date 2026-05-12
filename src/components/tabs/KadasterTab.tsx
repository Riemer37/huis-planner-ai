import { AlertTriangle, CheckCircle2, Circle, XCircle, Info } from "lucide-react";
import type { DataSource, PropertyAnalysis } from "@/lib/types";
import { fmtEUR, fmtNum, isApartment } from "@/lib/calculations";
import { SourceBadge } from "@/components/SourceBadge";

const labels = ["A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

type Conf = "ok" | "estimate" | "fail";

function ConfDot({ level, title }: { level: Conf; title: string }) {
  const cls =
    level === "ok"
      ? "bg-positive"
      : level === "estimate"
        ? "bg-warning"
        : "bg-destructive";
  return <span title={title} className={`inline-block size-2 rounded-full ${cls} mr-1.5 align-middle`} />;
}

export function KadasterTab({ a }: { a: PropertyAnalysis }) {
  const woz = a.woz ?? [];
  const max = Math.max(...woz.map((w) => w.waarde), 1);
  const huidigLabel = (a.energielabel?.label ?? "—").toUpperCase();
  const apt = isApartment(a);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-lg p-5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-3">Officiële BAG-gegevens</div>
          <table className="w-full text-sm">
            <tbody>
              <Row k="Adres" v={a.pdok?.adres} conf={a.pdok ? "ok" : "fail"} confTitle="PDOK Locatieserver" source={a.field_sources?.adres} />
              <Row k="Woonplaats" v={a.pdok?.woonplaats} conf={a.pdok ? "ok" : "fail"} confTitle="PDOK" source={a.field_sources?.woonplaats} />
              <Row k="Buurt" v={a.pdok?.buurt} conf={a.pdok?.buurt ? "ok" : "fail"} confTitle="PDOK" source={a.field_sources?.buurt} />
              <Row
                k="Woonoppervlakte (VBO)"
                v={(a.listing?.m2 ?? a.bag?.oppervlakte) ? `${fmtNum(a.listing?.m2 ?? a.bag?.oppervlakte)} m²` : "—"}
                conf={(a.listing?.m2 ?? a.bag?.oppervlakte) ? "ok" : "fail"}
                confTitle="BAG verblijfsobject"
                source={a.field_sources?.living_area_m2}
              />
              {apt ? (
                <tr className="border-b last:border-b-0">
                  <td className="py-1.5 text-muted-foreground text-xs uppercase tracking-wide w-1/2">
                    <ConfDot level="estimate" title="Niet van toepassing" />
                    Perceeloppervlakte
                  </td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground italic" title="Bij appartementen behoort het perceel toe aan de VvE — niet aan de individuele unit.">
                    <span className="inline-flex items-center justify-end gap-2">Gedeeld perceel — n.v.t. voor dit appartementstype <SourceBadge source={a.field_sources?.plot_area_m2} /></span>
                  </td>
                </tr>
              ) : (
                <Row
                  k="Perceeloppervlakte"
                  v={a.perceel_m2 ? `${fmtNum(a.perceel_m2)} m²` : "—"}
                  conf={a.perceel_m2 ? "estimate" : "fail"}
                  confTitle="Schatting"
                  source={a.field_sources?.plot_area_m2}
                />
              )}
              <Row k="Bouwjaar" v={a.bag?.bouwjaar ?? a.listing?.bouwjaar} conf={a.bag?.bouwjaar ? "ok" : a.listing?.bouwjaar ? "estimate" : "fail"} confTitle="BAG / Listing" source={a.field_sources?.build_year} />
              <Row k="Gebruiksdoel" v={a.bag?.gebruiksdoel} conf={a.bag?.gebruiksdoel ? "ok" : "fail"} confTitle="BAG" source="bag" />
              <Row k="Status" v={a.bag?.status} conf={a.bag?.status ? "ok" : "fail"} confTitle="BAG" source="bag" />
              <Row k="Splitsingstatus" v={(a.bag?.vbos ?? 1) > 1 ? `Gesplitst (${a.bag?.vbos} eenheden)` : "Niet gesplitst"} conf={a.bag ? "ok" : "fail"} confTitle="BAG" source="bag" />
              <Row k="Rijksmonument" v={a.monument?.rijksmonument ? "Ja" : "Nee"} conf="ok" confTitle="RCE" />
              <Row k="Beschermd gezicht" v={a.monument?.beschermdGezicht ?? "Nee"} conf="ok" confTitle="RCE" />
              <Row k="Bestemmingsplan" v={a.bestemmingsplan?.naam ?? "—"} conf={a.bestemmingsplan ? "ok" : "fail"} confTitle="Ruimtelijkeplannen.nl" />
              <Row k="Erfpacht" v={a.listing?.erfpacht ? "Ja" : "Nee/onbekend"} conf={a.listing?.erfpacht !== undefined ? "ok" : "fail"} confTitle="Listing" />
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="bg-card border rounded-lg p-5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-3">WOZ-waarde (5 jaar)</div>
            {woz.length === 0 ? (
              <p className="text-sm text-muted-foreground">Niet beschikbaar.</p>
            ) : (
              <div className="flex items-end gap-2 h-40">
                {woz.map((w) => (
                  <div key={w.jaar} className="flex-1 flex flex-col items-center justify-end">
                    <div className="text-[10px] tabular text-muted-foreground mb-1">{fmtEUR(w.waarde)}</div>
                    <div className="w-full bg-primary rounded-t" style={{ height: `${(w.waarde / max) * 100}%` }} />
                    <div className="text-[10px] tabular mt-1">{w.jaar}</div>
                  </div>
                ))}
              </div>
            )}
            {a.pandtype === "nieuwbouw" && <p className="text-xs text-muted-foreground mt-2">Nieuwbouw: WOZ-waarde nog niet beschikbaar — schatting.</p>}
          </div>

          <div className="bg-card border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Energielabel</div>
              {(() => {
                const bron = a.energielabel?.bron ?? "—";
                const isVerified = bron === "Funda listing" || bron === "EP-online";
                const isUnknown = (a.energielabel?.label ?? "").toLowerCase() === "onbekend" || !a.energielabel?.label;
                const cls = isVerified ? "text-positive" : isUnknown ? "text-destructive" : "text-warning";
                return (
                  <span className={`text-[11px] font-medium inline-flex items-center gap-1.5 ${cls}`}>
                    <ConfDot level={isVerified ? "ok" : isUnknown ? "fail" : "estimate"} title="Bron" />
                    {isUnknown ? "Onbekend — handmatig controleren" : `${a.energielabel?.label} — Bron: ${bron}`}
                  </span>
                );
              })()}
            </div>
            <div className="grid grid-cols-10 gap-1">
              {labels.map((l) => {
                const active = l === huidigLabel;
                return (
                  <div
                    key={l}
                    className={`text-center py-2 rounded text-xs font-semibold ${
                      active ? "bg-primary text-primary-foreground ring-2 ring-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {l}
                  </div>
                );
              })}
            </div>
            {a.energielabel?.conflict && (
              <div className="mt-3 flex items-start gap-2 text-xs rounded border border-warning/40 bg-warning/10 text-warning p-2.5">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>
                  Let op: bronnen verschillen — Funda: <strong>{a.energielabel.label}</strong>, EP-online:{" "}
                  <strong>{a.energielabel.label_secondary}</strong>. Controleer via{" "}
                  <a href="https://www.ep-online.nl" target="_blank" rel="noreferrer" className="underline">ep-online.nl</a>.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Databronnen */}
      <div className="bg-card border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="size-4 text-muted-foreground" />
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Databronnen</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {(a.databronnen ?? []).map((b) => {
            const Icon = b.status === "ok" ? CheckCircle2 : b.status === "fail" ? XCircle : Circle;
            const color = b.status === "ok" ? "text-positive" : b.status === "fail" ? "text-destructive" : "text-warning";
            return (
              <div key={b.naam} className="flex items-start gap-2 rounded border border-border bg-background/50 p-2.5">
                <Icon className={`size-4 shrink-0 mt-0.5 ${color}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-xs">{b.naam}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{b.data}</div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold ${color}`}>
                  {b.status === "ok" ? "Geslaagd" : b.status === "fail" ? "Mislukt" : "Schatting"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Groene stip = officiële bron (BAG, EP-online, Kadaster). Oranje = schatting of secundaire bron. Rood = niet geverifieerd, handmatig controleren.
        </p>
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  conf,
  confTitle,
  source,
}: {
  k: string;
  v?: string | number | null;
  conf?: Conf;
  confTitle?: string;
  source?: DataSource;
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-1.5 text-muted-foreground text-xs uppercase tracking-wide w-1/2">
        {conf && <ConfDot level={conf} title={confTitle ?? ""} />}
        {k}
      </td>
      <td className="py-1.5 tabular text-right">
        <span className="inline-flex items-center justify-end gap-2">
          {v == null || v === "" ? "—" : v}
          {source && <SourceBadge source={source} />}
        </span>
      </td>
    </tr>
  );
}
