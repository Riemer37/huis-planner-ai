import type { PropertyAnalysis } from "@/lib/types";
import { fmtEUR, fmtPct, berekenMaxBod, berekenRenovatiekosten } from "@/lib/calculations";

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular ${color ?? ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground tabular mt-0.5">{sub}</div>}
    </div>
  );
}

export function KpiStrip({ a }: { a: PropertyAnalysis }) {
  const reno = berekenRenovatiekosten(a);
  const maxBod = berekenMaxBod(a, 5, reno.totaal, a.pandtype === "woning");
  const vraag = a.listing?.prijs;
  const marge = maxBod - (vraag ?? a.ai.marktwaarde_ai);
  const margePct = ((marge) / Math.max(1, vraag ?? a.ai.marktwaarde_ai)) * 100;
  const risico = Math.round((a.ai.risico.locatie + a.ai.risico.staat + a.ai.risico.markt + a.ai.risico.liquiditeit) / 4);
  const risicoColor = risico >= 7 ? "text-destructive" : risico >= 5 ? "text-warning" : "text-positive";
  const margeColor = marge >= 0 ? "text-positive" : "text-destructive";

  return (
    <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Tile label="Vraagprijs" value={vraag ? fmtEUR(vraag) : "Geen listing"} />
      <Tile label="Marktwaarde (AI)" value={fmtEUR(a.ai.marktwaarde_ai)} sub="AI-schatting" />
      <Tile label="Max. bod (5% ROI)" value={fmtEUR(maxBod)} />
      <Tile
        label={a.pandtype === "commercieel" ? "Markthuur €/m²/jr" : "Markthuur p.m."}
        value={a.pandtype === "commercieel" ? fmtEUR(a.ai.commercieel_huurprijs_pm2 ?? 0) : fmtEUR(a.ai.huurwaarde_ai)}
      />
      <Tile label="Risico" value={`${risico}/10`} color={risicoColor} />
      <Tile label="Marge" value={fmtEUR(marge)} sub={fmtPct(margePct)} color={margeColor} />
    </div>
  );
}
