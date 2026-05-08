import { ExternalLink } from "lucide-react";
import type { PropertyAnalysis } from "@/lib/types";

const adviesColor = (advies: string) => {
  if (advies === "Kopen") return "bg-positive text-positive-foreground";
  if (advies === "Vermijden") return "bg-destructive text-destructive-foreground";
  return "bg-warning text-warning-foreground";
};

const scoreColor = (score: number) => {
  if (score >= 7) return "text-positive";
  if (score >= 5) return "text-warning";
  return "text-destructive";
};

export function PropertyHeader({ a }: { a: PropertyAnalysis }) {
  const m2 = a.listing?.m2 ?? a.bag?.oppervlakte;
  const bouwjaar = a.bag?.bouwjaar ?? a.listing?.bouwjaar;
  const label = a.energielabel?.label ?? a.listing?.energielabel ?? "—";
  const bagUrl = a.pdok?.bagId ? `https://bagviewer.kadaster.nl/lvbag/bag-viewer/?objectId=${a.pdok.bagId}` : null;

  return (
    <div className="bg-card border-b px-6 py-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">{a.pdok?.adres ?? a.input}</h1>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 tabular">
            <span className="capitalize">{a.pandtype}</span>
            {m2 && <span>{m2} m²</span>}
            {a.listing?.kamers && <span>{a.listing.kamers} kamers</span>}
            {bouwjaar && <span>bouwjaar {bouwjaar}</span>}
            <span>label {label}</span>
            {a.listing?.url && (
              <a href={a.listing.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5">
                Listing <ExternalLink className="size-3" />
              </a>
            )}
            {bagUrl && (
              <a href={bagUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5">
                BAG <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={`text-2xl font-bold tabular ${scoreColor(a.ai.score)}`}>{a.ai.score}/10</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Score</div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${adviesColor(a.ai.advies)}`}>{a.ai.advies}</span>
        </div>
      </div>
    </div>
  );
}
