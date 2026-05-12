import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sidebar } from "@/components/Sidebar";
import { PropertyHeader } from "@/components/PropertyHeader";
import { KpiStrip } from "@/components/KpiStrip";
import { Warnings } from "@/components/Warnings";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { KadasterTab } from "@/components/tabs/KadasterTab";
import { PotentialTab } from "@/components/tabs/PotentialTab";
import { PurchaseTab } from "@/components/tabs/PurchaseTab";
import { RenovationTab } from "@/components/tabs/RenovationTab";
import { ExitTab } from "@/components/tabs/ExitTab";
import { ManualOverridePanel } from "@/components/ManualOverridePanel";
import { FundaDebugPanel } from "@/components/FundaDebugPanel";
import { analyzeProperty } from "@/lib/analyze.functions";
import { applyManualOverrides } from "@/lib/overrides";
import { findCached, saveAnalysis } from "@/lib/storage";
import type { ManualOverrides, PandType, PropertyAnalysis } from "@/lib/types";
import heroImage from "@/assets/hero-architecture.jpg";
import { Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: VastgoedAI,
  head: () => ({
    meta: [
      { title: "VastgoedAI — Beleggingsanalyse" },
      { name: "description", content: "Nederlandse vastgoed-beleggingstool: aankoopadvies, max bod, risico's en rendement." },
    ],
  }),
});

const TABS = [
  { id: "overzicht", label: "Overzicht" },
  { id: "kadaster", label: "Kadaster & Data" },
  { id: "potentieel", label: "Potentieel" },
  { id: "aankoop", label: "Aankoop" },
  { id: "renovatie", label: "Renovatie" },
  { id: "exit", label: "Exitstrategie" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function VastgoedAI() {
  const analyze = useServerFn(analyzeProperty);
  const [analysis, setAnalysis] = useState<PropertyAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<string[]>([]);
  const [tab, setTab] = useState<TabId>("overzicht");
  const [error, setError] = useState<string | null>(null);

  const handleManualSave = (overrides: ManualOverrides) => {
    if (!analysis) return;
    const updated = applyManualOverrides(analysis, overrides);
    saveAnalysis(updated);
    setAnalysis(updated);
  };

  const handleAnalyze = async (q: string, pandtype: PandType) => {
    setError(null);
    const isUrl = /^https?:\/\//i.test(q);
    const cached = isUrl ? undefined : findCached(q);
    if (cached && cached.pandtype === pandtype) {
      setAnalysis(cached);
      return;
    }
    setLoading(true);
    setStages(["PDOK locatie ophalen…", "BAG verblijfsobject…", "Monumenten-check…", "AI-analyse…"]);
    try {
      const result = (await analyze({ data: { query: q, pandtype, isUrl } })) as PropertyAnalysis;
      saveAnalysis(result);
      setAnalysis(result);
      setTab("overzicht");
    } catch (e: any) {
      setError(e?.message ?? "Analyse mislukt");
    } finally {
      setLoading(false);
      setStages([]);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <Sidebar onAnalyze={handleAnalyze} onSelectHistory={(a) => { setAnalysis(a); setTab("overzicht"); }} loading={loading} loadingStages={stages} current={analysis} />

      <main className="flex-1 min-w-0 flex flex-col">
        {!analysis ? (
          <EmptyState error={error} loading={loading} onAnalyze={(q) => handleAnalyze(q, "woning")} />
        ) : (
          <>
            <div className="px-6 pt-6 bg-background">
              <FundaDebugPanel a={analysis} />
            </div>
            <PropertyHeader a={analysis} />
            <KpiStrip a={analysis} />
            <Warnings a={analysis} />
            <div className="px-6 border-b border-border bg-card">
              <div className="flex gap-1 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-3 text-sm border-b-2 transition whitespace-nowrap uppercase tracking-wider text-[12px] font-semibold ${
                      tab === t.id
                        ? "border-primary text-navy"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 flex-1 bg-background">
              {tab === "overzicht" && <OverviewTab a={analysis} />}
              {tab === "kadaster" && <KadasterTab a={analysis} />}
              {tab === "potentieel" && <PotentialTab a={analysis} />}
              {tab === "aankoop" && <PurchaseTab a={analysis} />}
              {tab === "renovatie" && <RenovationTab a={analysis} />}
              {tab === "exit" && <ExitTab a={analysis} />}
              <div className="mt-6 space-y-4">
                <ManualOverridePanel a={analysis} onSave={handleManualSave} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ error, loading, onAnalyze }: { error: string | null; loading: boolean; onAnalyze: (q: string) => void }) {
  const [q, setQ] = useState("");
  const submit = () => { if (q.trim() && !loading) onAnalyze(q.trim()); };
  return (
    <div className="flex-1 relative overflow-hidden flex items-center justify-center">
      {/* Hero background */}
      <img
        src={heroImage}
        alt="Klassieke Amsterdamse grachtenpanden tijdens het gouden uur"
        width={1920}
        height={1080}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Light overlay */}
      <div className="absolute inset-0 bg-white/40" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-white/60" />

      {/* Centered card */}
      <div className="relative w-full max-w-2xl mx-6 panel shadow-elevated p-8 md:p-10">
        <div className="label-eyebrow mb-3 text-center">Nederlandse Vastgoed Investment Terminal</div>
        <h1 className="display text-3xl md:text-4xl font-extrabold tracking-tight text-navy text-center leading-tight">
          Analyseer elk vastgoedobject in seconden
        </h1>
        <p className="text-sm md:text-[15px] text-muted-foreground mt-3 text-center max-w-lg mx-auto leading-relaxed">
          Plak een Funda- of Pararius-URL of voer een Nederlands adres in en krijg direct marktwaarde,
          maximaal bod, risicoprofiel en rendement.
        </p>

        <div className="mt-7 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              placeholder="https://www.funda.nl/...  ·  Damrak 1, Amsterdam"
              className="w-full bg-muted text-foreground placeholder:text-muted-foreground/70 rounded-md pl-10 pr-3 py-3 text-sm border border-border"
            />
          </div>
          <button
            onClick={submit}
            disabled={loading || !q.trim()}
            className="inline-flex items-center justify-center gap-2 bg-navy disabled:opacity-50 text-primary-foreground rounded-md px-6 py-3 text-sm font-bold tracking-wide shadow-card hover:shadow-elevated hover:brightness-110 active:scale-[0.99] transition"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {loading ? "Analyseren…" : "Analyseer"}
          </button>
        </div>

        {error && (
          <p className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3 text-center">{error}</p>
        )}

        <div className="mt-8 grid grid-cols-3 gap-3 text-[11px]">
          {[
            { k: "PDOK · BAG · RCE", v: "Officiële databronnen" },
            { k: "Lovable AI Gateway", v: "Real-time analyse" },
            { k: "Lokale cache 24u", v: "30 analyses" },
          ].map((c) => (
            <div key={c.k} className="rounded-md border border-border bg-background/80 backdrop-blur p-3 text-left">
              <div className="label-eyebrow">{c.k}</div>
              <div className="text-foreground mt-1 font-medium">{c.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
