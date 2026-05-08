import { useEffect, useState } from "react";
import { Loader2, Search, Trash2, Building2 } from "lucide-react";
import type { PandType, PropertyAnalysis } from "@/lib/types";
import { loadHistory, deleteAnalysis } from "@/lib/storage";
import { fmtEUR } from "@/lib/calculations";

interface Props {
  onAnalyze: (q: string, t: PandType) => void;
  onSelectHistory: (a: PropertyAnalysis) => void;
  loading: boolean;
  loadingStages?: string[];
  current?: PropertyAnalysis | null;
}

export function Sidebar({ onAnalyze, onSelectHistory, loading, loadingStages, current }: Props) {
  const [q, setQ] = useState("");
  const [pandtype, setPandtype] = useState<PandType>("woning");
  const [history, setHistory] = useState<PropertyAnalysis[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, [current?.id]);

  const submit = () => {
    if (!q.trim() || loading) return;
    onAnalyze(q.trim(), pandtype);
  };

  return (
    <aside className="w-80 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-sidebar-border flex items-center gap-2">
        <div className="size-8 rounded bg-primary flex items-center justify-center">
          <Building2 className="size-4 text-primary-foreground" />
        </div>
        <div>
          <div className="font-semibold tracking-tight">VastgoedAI</div>
          <div className="text-[11px] opacity-60">Beleggingsanalyse</div>
        </div>
      </div>

      <div className="p-4 space-y-3 border-b border-sidebar-border">
        <label className="block text-xs uppercase tracking-wide opacity-70">Funda-URL of adres</label>
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="https://www.funda.nl/... of Damrak 1, Amsterdam"
          rows={3}
          className="w-full bg-sidebar-accent text-sidebar-foreground placeholder:opacity-40 rounded p-2 text-sm border border-sidebar-border focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <div>
          <label className="block text-xs uppercase tracking-wide opacity-70 mb-1">Pandtype</label>
          <select
            value={pandtype}
            onChange={(e) => setPandtype(e.target.value as PandType)}
            className="w-full bg-sidebar-accent rounded p-2 text-sm border border-sidebar-border focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="woning">Woning (bestaand)</option>
            <option value="nieuwbouw">Nieuwbouw</option>
            <option value="commercieel">Commercieel (winkel/kantoor)</option>
            <option value="gemengd">Gemengd gebruik (woon/werk)</option>
          </select>
        </div>

        <button
          onClick={submit}
          disabled={loading || !q.trim()}
          className="w-full flex items-center justify-center gap-2 bg-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground rounded py-2 text-sm font-medium transition"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {loading ? "Data ophalen…" : "Analyseer"}
        </button>

        {loading && loadingStages && loadingStages.length > 0 && (
          <ul className="text-xs space-y-1 opacity-80">
            {loadingStages.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="text-xs uppercase tracking-wide opacity-70 mb-2">Geschiedenis</div>
        {history.length === 0 && <div className="text-xs opacity-50">Nog geen analyses.</div>}
        <ul className="space-y-1">
          {history.map((h) => (
            <li
              key={h.id}
              className={`group rounded p-2 text-xs cursor-pointer hover:bg-sidebar-accent ${current?.id === h.id ? "bg-sidebar-accent" : ""}`}
              onClick={() => onSelectHistory(h)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`size-2 rounded-full shrink-0 ${Date.now() - h.timestamp < 23 * 3600 * 1000 ? "bg-positive" : "bg-muted-foreground"}`} />
                  <span className="truncate">{h.pdok?.adres ?? h.input}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteAnalysis(h.id);
                    setHistory(loadHistory());
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                  aria-label="Verwijder"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <div className="opacity-60 mt-0.5 tabular">
                {h.pandtype} · {fmtEUR(h.ai.marktwaarde_ai)} · score {h.ai.score}/10
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-3 text-[10px] opacity-50 border-t border-sidebar-border">
        Cache 24u · max 30 entries · Lovable AI
      </div>
    </aside>
  );
}
