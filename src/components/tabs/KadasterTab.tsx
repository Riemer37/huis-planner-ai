import { CheckCircle2, Circle, XCircle, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { DataSource, PropertyAnalysis } from "@/lib/types";
import { fmtEUR, fmtNum, isApartment } from "@/lib/calculations";
import { SourceBadge } from "@/components/SourceBadge";
import { getComparables, type CompsResult, type Comparable } from "@/lib/comps.functions";

function extractHuisnummer(adres?: string): string | undefined {
  if (!adres) return undefined;
  const m = adres.match(/\b(\d+)([a-zA-Z]?)\b/);
  return m ? m[1] : undefined;
}

function staatBadge(s: Comparable["staat"]) {
  const map = {
    instapklaar: { label: "Instapklaar", cls: "bg-positive/15 text-positive border-positive/30" },
    redelijk: { label: "Redelijk", cls: "bg-warning/15 text-warning border-warning/40" },
    renovatie: { label: "Renovatie nodig", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    onbekend: { label: "Onbekend", cls: "bg-muted text-muted-foreground border-border" },
  } as const;
  const v = map[s];
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${v.cls}`}>{v.label}</span>;
}

const COMPS_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function pc4(postcode?: string): string | undefined {
  if (!postcode) return undefined;
  const m = postcode.replace(/\s+/g, "").match(/^(\d{4})/);
  return m ? m[1] : undefined;
}

function readCompsCache(key: string): Comparable[] | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const j = JSON.parse(raw) as { ts: number; comps: Comparable[] };
    if (Date.now() - j.ts > COMPS_TTL_MS) return undefined;
    return j.comps;
  } catch { return undefined; }
}

function writeCompsCache(key: string, comps: Comparable[]) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), comps })); } catch {}
}

function ComparablesSection({ a }: { a: PropertyAnalysis }) {
  const fetchComps = useServerFn(getComparables);
  const [state, setState] = useState<{ loading: boolean; result?: CompsResult; cached?: boolean }>({ loading: true });
  const [retryNonce, setRetryNonce] = useState(0);
  const postcode = a.pdok?.postcode;
  const huisnummer = extractHuisnummer(a.pdok?.adres) ?? extractHuisnummer(a.input);
  const subjectM2 = a.listing?.m2 ?? a.bag?.oppervlakte;
  const subjectPrijs = a.listing?.prijs ?? a.listing?.vraagprijs;
  const subjectPpm = subjectPrijs && subjectM2 ? Math.round(subjectPrijs / subjectM2) : undefined;
  const isApt = isApartment(a);

  useEffect(() => {
    let cancelled = false;
    if (!postcode || !huisnummer) {
      setState({ loading: false, result: { status: "error", message: "Postcode/huisnummer onbekend" } });
      return;
    }
    const cluster = pc4(postcode);
    const cacheKey = cluster ? `vg-comps:${cluster}` : undefined;

    const filterAndSet = (comps: Comparable[], cached: boolean) => {
      // Client-side filter: ±20% m² + match apartment vs woning, max 8
      const filtered = comps
        .filter((c) => {
          if (subjectM2 && c.m2) {
            const ratio = c.m2 / subjectM2;
            if (ratio < 0.7 || ratio > 1.3) return false;
          }
          const cIsApt = c.type.toLowerCase().includes("appart");
          if (isApt !== cIsApt) return false;
          return true;
        })
        .slice(0, 8);
      if (cancelled) return;
      setState({
        loading: false,
        cached,
        result: filtered.length ? { status: "ok", comps: filtered } : { status: "empty" },
      });
    };

    if (cacheKey) {
      const hit = readCompsCache(cacheKey);
      if (hit) {
        console.log(`[COMPS] cache HIT ${cacheKey} (${hit.length} comps)`);
        filterAndSet(hit, true);
        return;
      }
      console.log(`[COMPS] cache MISS ${cacheKey} → calling Altum`);
    }

    setState({ loading: true });
    fetchComps({ data: { postcode, huisnummer, m2: subjectM2 } })
      .then((res) => {
        if (cancelled) return;
        if (res.status === "ok" && cacheKey) {
          writeCompsCache(cacheKey, res.comps);
          filterAndSet(res.comps, false);
        } else {
          setState({ loading: false, result: res, cached: false });
        }
      })
      .catch((e) => { if (!cancelled) setState({ loading: false, result: { status: "error", message: String(e?.message ?? e) } }); });
    return () => { cancelled = true; };
  }, [postcode, huisnummer, subjectM2, isApt, fetchComps]);

  return (
    <div className="bg-card border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Vergelijkbare verkopen (1km radius)</div>
        <div className="flex items-center gap-2">
          {state.cached && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Cache 90d</span>
          )}
          <span className="text-[10px] text-muted-foreground">Bron: Altum AI Woningreferentie</span>
        </div>
      </div>
      {state.loading && <p className="text-sm text-muted-foreground">Vergelijkbare verkopen ophalen…</p>}
      {!state.loading && state.result?.status === "rate_limited" && (
        <p className="text-sm text-warning">Limiet bereikt — upgrade Altum AI plan voor vergelijkbare verkopen.</p>
      )}
      {!state.loading && state.result?.status === "error" && (
        <p className="text-sm text-destructive">Niet beschikbaar: {state.result.message}</p>
      )}
      {!state.loading && state.result?.status === "empty" && (
        <p className="text-sm text-muted-foreground">Geen vergelijkbare verkopen gevonden in 1km radius.</p>
      )}
      {!state.loading && state.result?.status === "ok" && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground uppercase tracking-wide text-[10px]">
                <th className="text-left py-2 pr-2">Adres</th>
                <th className="text-left py-2 pr-2">Type</th>
                <th className="text-right py-2 pr-2">m²</th>
                <th className="text-right py-2 pr-2">Bouwjaar</th>
                <th className="text-right py-2 pr-2">Verkoopprijs</th>
                <th className="text-right py-2 pr-2">€/m²</th>
                <th className="text-left py-2 pr-2">Verkoopdatum</th>
                <th className="text-left py-2">Staat</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b bg-primary/10 font-semibold">
                <td className="py-2 pr-2">{a.pdok?.adres ?? a.input} <span className="text-[10px] uppercase text-primary ml-1">subject</span></td>
                <td className="py-2 pr-2">{isApartment(a) ? "Appartement" : "Woning"}</td>
                <td className="py-2 pr-2 text-right tabular">{subjectM2 ? fmtNum(subjectM2) : "—"}</td>
                <td className="py-2 pr-2 text-right tabular">{a.bag?.bouwjaar ?? a.listing?.bouwjaar ?? "—"}</td>
                <td className="py-2 pr-2 text-right tabular">{subjectPrijs ? fmtEUR(subjectPrijs) : "—"}</td>
                <td className="py-2 pr-2 text-right tabular">{subjectPpm ? fmtEUR(subjectPpm) : "—"}</td>
                <td className="py-2 pr-2">—</td>
                <td className="py-2">—</td>
              </tr>
              {state.result.comps.map((c, i) => {
                const diff = c.prijs_per_m2 && subjectPpm ? c.prijs_per_m2 - subjectPpm : undefined;
                const diffCls = diff === undefined ? "" : diff > 0 ? "text-destructive" : "text-positive";
                return (
                  <tr key={i} className="border-b last:border-b-0 hover:bg-muted/40">
                    <td className="py-2 pr-2">{c.adres}</td>
                    <td className="py-2 pr-2">{c.type}</td>
                    <td className="py-2 pr-2 text-right tabular">{c.m2 ? fmtNum(c.m2) : "—"}</td>
                    <td className="py-2 pr-2 text-right tabular">{c.bouwjaar ?? "—"}</td>
                    <td className="py-2 pr-2 text-right tabular">{c.prijs ? fmtEUR(c.prijs) : "—"}</td>
                    <td className="py-2 pr-2 text-right tabular">
                      {c.prijs_per_m2 ? fmtEUR(c.prijs_per_m2) : "—"}
                      {diff !== undefined && (
                        <span className={`ml-1 text-[10px] ${diffCls}`}>
                          {diff > 0 ? "+" : ""}{fmtEUR(diff)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2 tabular">{c.datum ?? "—"}</td>
                    <td className="py-2">{staatBadge(c.staat)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

export function KadasterTab({ a, onUpdate }: { a: PropertyAnalysis; onUpdate?: (next: PropertyAnalysis) => void }) {
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
                const kind = a.energielabel?.source_kind;
                const bron = a.energielabel?.bron ?? "—";
                const isUnknown = (a.energielabel?.label ?? "").toLowerCase() === "onbekend" || !a.energielabel?.label;
                const badgeCls =
                  kind === "funda"
                    ? "bg-blue-100 text-blue-800 border border-blue-300"
                    : kind === "ep_online"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : kind === "handmatig"
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-destructive/10 text-destructive border border-destructive/30";
                return (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}>
                    {isUnknown && !a.energielabel?.needs_manual ? "Onbekend" : `Bron: ${bron}`}
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
            {a.energielabel?.needs_manual && (
              <div className="mt-3 flex items-center gap-2 text-xs">
                <label className="text-muted-foreground">Handmatig invoeren:</label>
                <select
                  className="border border-border bg-background rounded px-2 py-1 text-xs font-semibold"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v || !onUpdate) return;
                    onUpdate({
                      ...a,
                      energielabel: { label: v, bron: "Handmatig", source_kind: "handmatig" },
                    });
                  }}
                >
                  <option value="" disabled>Kies label…</option>
                  {labels.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      <ComparablesSection a={a} />

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
