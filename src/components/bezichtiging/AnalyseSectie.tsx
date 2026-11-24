import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { Bezichtiging } from "@/integrations/supabase/types";
import type { PandType, PropertyAnalysis } from "@/lib/types";
import { analyzeProperty } from "@/lib/analyze.functions";
import { datumKort } from "@/lib/bezichtigingen";
import { KpiStrip } from "@/components/KpiStrip";
import { Warnings } from "@/components/Warnings";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { KadasterTab } from "@/components/tabs/KadasterTab";
import { PotentialTab } from "@/components/tabs/PotentialTab";
import { PurchaseTab } from "@/components/tabs/PurchaseTab";
import { RenovationTab } from "@/components/tabs/RenovationTab";
import { ExitTab } from "@/components/tabs/ExitTab";

const TABS = [
  { id: "overzicht", label: "Overzicht" },
  { id: "aankoop", label: "Aankoop" },
  { id: "renovatie", label: "Renovatie" },
  { id: "potentieel", label: "Potentieel" },
  { id: "exit", label: "Exit" },
  { id: "kadaster", label: "Databronnen" },
] as const;

const STAAT_NAAR_AI: Record<string, string> = {
  uitstekend: "uitstekend",
  goed: "goed",
  redelijk: "redelijk",
  slecht: "slecht",
  sloop: "slecht",
};

export function AnalyseSectie({ b, opslaan }: { b: Bezichtiging; opslaan: (a: PropertyAnalysis) => Promise<void> }) {
  const analyze = useServerFn(analyzeProperty);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overzicht");
  const analyse = b.analyse_data as unknown as PropertyAnalysis | null;

  const start = async () => {
    setBezig(true);
    setFout(null);
    try {
      // Onze eigen waarnemingen zijn leidend: niet opnieuw scrapen
      const bijzonderheden = [
        b.pluspunten && `Pluspunten: ${b.pluspunten}`,
        b.minpunten && `Minpunten: ${b.minpunten}`,
        b.notities && `Notities bezichtiging: ${b.notities}`,
        b.renovatie_schatting && `Eigen schatting renovatie/sloop: €${b.renovatie_schatting}`,
        b.staat === "sloop" && "Plan: slopen en herbouwen",
      ]
        .filter(Boolean)
        .join(". ");
      const r = (await analyze({
        data: {
          query: b.adres,
          pandtype: (b.pandtype as PandType) || "woning",
          isUrl: false,
          manualInput: {
            asking_price: b.vraagprijs ?? undefined,
            living_area_m2: b.woonoppervlakte_m2 ?? undefined,
            plot_area_m2: b.perceel_m2 ?? undefined,
            rooms: b.kamers ?? undefined,
            build_year: b.bouwjaar ?? undefined,
            energielabel: b.energielabel ?? undefined,
            woning_type: b.woningtype ?? undefined,
            staat: b.staat ? STAAT_NAAR_AI[b.staat] : undefined,
            erfpacht: b.erfpacht ?? undefined,
            bijzonderheden: bijzonderheden || undefined,
          },
        },
      })) as PropertyAnalysis;
      await opslaan(r);
      setTab("overzicht");
    } catch (e) {
      setFout((e as Error).message || "Analyse mislukt");
    } finally {
      setBezig(false);
    }
  };

  if (!analyse) {
    return (
      <div className="panel p-8 text-center">
        <Sparkles className="size-6 text-navy mx-auto mb-2" />
        <h2 className="font-bold text-navy">Nog geen analyse</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          De analyse gebruikt de pandgegevens en jullie notities om marktwaarde, maximaal bod, renovatiekosten en
          exit-opties te berekenen.
        </p>
        {fout && <p className="text-sm text-destructive mt-3">{fout}</p>}
        <button
          onClick={start}
          disabled={bezig}
          className="mt-5 inline-flex items-center gap-2 bg-navy text-primary-foreground rounded-md px-5 py-3 text-sm font-bold disabled:opacity-50"
        >
          {bezig ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {bezig ? "Analyseren (± 30 sec)…" : "Analyse starten"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Analyse van {datumKort(b.analyse_at)}</span>
        <button onClick={start} disabled={bezig} className="inline-flex items-center gap-1.5 font-semibold hover:text-foreground disabled:opacity-50">
          {bezig ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Opnieuw analyseren
        </button>
      </div>
      {fout && <p className="text-sm text-destructive">{fout}</p>}
      <div className="panel overflow-hidden">
        <KpiStrip a={analyse} />
        <Warnings a={analyse} />
        <div className="px-3 border-y border-border bg-card flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-3 border-b-2 whitespace-nowrap uppercase tracking-wider text-[11px] font-semibold ${
                tab === t.id ? "border-primary text-navy" : "border-transparent text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4 md:p-6 bg-background">
          {tab === "overzicht" && <OverviewTab a={analyse} />}
          {tab === "aankoop" && <PurchaseTab a={analyse} />}
          {tab === "renovatie" && <RenovationTab a={analyse} />}
          {tab === "potentieel" && <PotentialTab a={analyse} />}
          {tab === "exit" && <ExitTab a={analyse} />}
          {tab === "kadaster" && <KadasterTab a={analyse} onUpdate={(n) => opslaan(n)} />}
        </div>
      </div>
    </div>
  );
}
