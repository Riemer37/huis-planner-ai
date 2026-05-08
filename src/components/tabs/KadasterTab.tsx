import type { PropertyAnalysis } from "@/lib/types";
import { fmtEUR, fmtNum } from "@/lib/calculations";

const labels = ["A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

export function KadasterTab({ a }: { a: PropertyAnalysis }) {
  const woz = a.woz ?? [];
  const max = Math.max(...woz.map((w) => w.waarde), 1);
  const huidigLabel = (a.energielabel?.label ?? "—").toUpperCase();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-lg p-5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-3">Officiële BAG-gegevens</div>
          <table className="w-full text-sm">
            <tbody>
              <Row k="Adres" v={a.pdok?.adres} />
              <Row k="Woonplaats" v={a.pdok?.woonplaats} />
              <Row k="Buurt" v={a.pdok?.buurt} />
              <Row k="Woonoppervlakte" v={a.bag?.oppervlakte ? `${fmtNum(a.bag.oppervlakte)} m²` : "—"} />
              <Row k="Perceeloppervlakte" v={a.perceel_m2 ? `${fmtNum(a.perceel_m2)} m²` : "—"} />
              <Row k="Bouwjaar" v={a.bag?.bouwjaar ?? a.listing?.bouwjaar} />
              <Row k="Gebruiksdoel" v={a.bag?.gebruiksdoel} />
              <Row k="Status" v={a.bag?.status} />
              <Row k="Splitsingstatus" v={(a.bag?.vbos ?? 1) > 1 ? `Gesplitst (${a.bag?.vbos} eenheden)` : "Niet gesplitst"} />
              <Row k="Rijksmonument" v={a.monument?.rijksmonument ? "Ja" : "Nee"} />
              <Row k="Beschermd gezicht" v={a.monument?.beschermdGezicht ?? "Nee"} />
              <Row k="Bestemmingsplan" v={a.bestemmingsplan?.naam ?? "—"} />
              <Row k="Erfpacht" v={a.listing?.erfpacht ? "Ja" : "Nee/onbekend"} />
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
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-3">Energielabel</div>
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
            <div className="text-[11px] text-muted-foreground mt-2">Bron: {a.energielabel?.bron ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Vergelijkbare verkopen</div>
          <span className="text-xs text-muted-foreground">Lazy laden via Funda vereist ScraperAPI-key</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Voor live vergelijkingsdata een ScraperAPI-key configureren als secret. Tot die tijd toont de AI-analyse een marktcontext op basis van WOZ + buurtgemiddelde.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string | number | null }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="py-1.5 text-muted-foreground text-xs uppercase tracking-wide w-1/2">{k}</td>
      <td className="py-1.5 tabular text-right">{v == null || v === "" ? "—" : v}</td>
    </tr>
  );
}
