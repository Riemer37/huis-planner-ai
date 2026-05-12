import { AlertTriangle, Bug } from "lucide-react";
import type { PropertyAnalysis } from "@/lib/types";

export function FundaDebugPanel({ a }: { a: PropertyAnalysis }) {
  const debug = a.listing?.funda_debug;
  if (!debug) return null;

  return (
    <details open className="bg-destructive/10 border-2 border-destructive/50 rounded-lg p-5 shadow-card">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-extrabold text-destructive uppercase tracking-wide">
          <Bug className="size-4" /> Tijdelijke ScraperAPI debug output
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-destructive">
          <AlertTriangle className="size-3.5" /> niet verbergen — ruwe response zichtbaar
        </span>
      </summary>
      <div className="mt-4 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-destructive mb-2 font-bold">Exacte ScraperAPI console output</div>
          <pre className="max-h-80 overflow-auto rounded border border-destructive/40 bg-background p-3 text-xs whitespace-pre-wrap text-foreground">{(debug.scraperapi_debug_output ?? debug.logs).join("\n")}</pre>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs tabular">
          <Metric k="HTML length" v={debug.html_length.toLocaleString("nl-NL")} bad={debug.html_length < 50000} />
          <Metric k="NEXT_DATA" v={debug.next_data_found ? "found" : "missing"} bad={!debug.next_data_found} />
          <Metric k="Raw label" v={debug.raw_energy_label ?? "—"} />
          <Metric k="Field path" v={debug.energy_label_field_path ?? "—"} />
          <Metric k="Final label" v={debug.final_energy_label ?? "—"} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Function logs</div>
          <pre className="max-h-40 overflow-auto rounded border bg-muted p-3 text-xs whitespace-pre-wrap">{debug.logs.join("\n")}</pre>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Raw Funda __NEXT_DATA__ JSON</div>
          <pre className="max-h-96 overflow-auto rounded border bg-muted p-3 text-[11px] whitespace-pre-wrap">{JSON.stringify(debug.raw_next_data ?? null, null, 2)}</pre>
        </div>
      </div>
    </details>
  );
}

function Metric({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className={`rounded border p-2 ${bad ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-background"}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{k}</div>
      <div className="font-semibold truncate" title={v}>{v}</div>
    </div>
  );
}