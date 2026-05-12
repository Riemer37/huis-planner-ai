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
import { analyzeProperty } from "@/lib/analyze.functions";
import { findCached, saveAnalysis } from "@/lib/storage";
import type { PandType, PropertyAnalysis } from "@/lib/types";

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

  const handleAnalyze = async (q: string, pandtype: PandType) => {
    setError(null);
    const cached = findCached(q);
    if (cached && cached.pandtype === pandtype) {
      setAnalysis(cached);
      return;
    }
    setLoading(true);
    setStages(["PDOK locatie ophalen…", "BAG verblijfsobject…", "Monumenten-check…", "AI-analyse…"]);
    try {
      const isUrl = /^https?:\/\//i.test(q);
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
          <EmptyState error={error} loading={loading} />
        ) : (
          <>
            <PropertyHeader a={analysis} />
            <KpiStrip a={analysis} />
            <Warnings a={analysis} />
            <div className="px-6 border-b border-border bg-card/30">
              <div className="flex gap-1 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-3 text-sm border-b-2 transition whitespace-nowrap uppercase tracking-wider text-[12px] ${
                      tab === t.id
                        ? "border-primary text-foreground font-bold"
                        : "border-transparent text-muted-foreground hover:text-foreground/90"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 flex-1">
              {tab === "overzicht" && <OverviewTab a={analysis} />}
              {tab === "kadaster" && <KadasterTab a={analysis} />}
              {tab === "potentieel" && <PotentialTab a={analysis} />}
              {tab === "aankoop" && <PurchaseTab a={analysis} />}
              {tab === "renovatie" && <RenovationTab a={analysis} />}
              {tab === "exit" && <ExitTab a={analysis} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ error, loading }: { error: string | null; loading: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center p-10 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07]"
        style={{ backgroundImage: "radial-gradient(circle at 50% 30%, var(--primary), transparent 55%)" }}
      />
      <div className="relative max-w-xl text-center">
        <div className="label-eyebrow mb-3">Nederlandse Vastgoed Investment Terminal</div>
        <h1 className="display text-5xl font-extrabold tracking-tight mb-3">
          Vastgoed<span className="text-gold text-shadow-gold">AI</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
          Institutional-grade beleggingsanalyse op elk Nederlands adres. Plak een Funda/Pararius URL of voer een adres in en krijg
          binnen seconden marktwaarde, max bod, risico en rendement.
        </p>
        {loading && (
          <p className="text-sm text-gold">
            <span className="inline-block size-2 rounded-full bg-primary animate-pulse mr-2 align-middle" />
            Bezig met data ophalen…
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">{error}</p>
        )}
        <div className="mt-10 grid grid-cols-3 gap-3 text-[11px]">
          {[
            { k: "PDOK · BAG · RCE", v: "Officiële databronnen" },
            { k: "Lovable AI Gateway", v: "Real-time analyse" },
            { k: "Lokale cache 24u", v: "30 analyses" },
          ].map((c) => (
            <div key={c.k} className="panel gold-top p-3 text-left lift">
              <div className="label-eyebrow">{c.k}</div>
              <div className="text-foreground/90 mt-1">{c.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
