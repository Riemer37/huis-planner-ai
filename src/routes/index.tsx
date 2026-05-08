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
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar onAnalyze={handleAnalyze} onSelectHistory={(a) => { setAnalysis(a); setTab("overzicht"); }} loading={loading} loadingStages={stages} current={analysis} />

      <main className="flex-1 min-w-0 flex flex-col">
        {!analysis ? (
          <EmptyState error={error} loading={loading} />
        ) : (
          <>
            <PropertyHeader a={analysis} />
            <KpiStrip a={analysis} />
            <Warnings a={analysis} />
            <div className="px-6 border-b">
              <div className="flex gap-1 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-2.5 text-sm border-b-2 transition whitespace-nowrap ${
                      tab === t.id ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
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
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-2">VastgoedAI</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Plak een Funda/Pararius/Vendr URL of voer een adres in. Selecteer pandtype en klik Analyseer.
        </p>
        {loading && <p className="text-sm">Bezig met data ophalen…</p>}
        {error && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-3">{error}</p>}
        <div className="mt-8 text-xs text-muted-foreground space-y-1">
          <div>• PDOK Locatieserver, BAG, RCE monumenten</div>
          <div>• AI-analyse via Lovable AI Gateway</div>
          <div>• Lokale cache 24u (max 30 entries)</div>
        </div>
      </div>
    </div>
  );
}
