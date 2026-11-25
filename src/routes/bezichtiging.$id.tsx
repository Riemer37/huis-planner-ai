import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Loader2, MapPin, Trash2 } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { EnergieLabel, StatusBadge } from "@/components/bezichtiging/Badges";
import { BeoordelingVelden, BezichtigingVelden, PandVelden } from "@/components/bezichtiging/Velden";
import { MediaGalerij } from "@/components/bezichtiging/MediaGalerij";
import { AnalyseSectie } from "@/components/bezichtiging/AnalyseSectie";
import { BuurtSectie } from "@/components/bezichtiging/BuurtSectie";
import type { BuurtData } from "@/lib/buurt.functions";
import {
  STATUSSEN,
  datumKort,
  eur,
  getal,
  haalBezichtiging,
  prijsPerM2,
  verwijderBezichtiging,
  wijzigBezichtiging,
} from "@/lib/bezichtigingen";
import { useConcept } from "@/lib/useConcept";
import { useAuth } from "@/lib/auth";
import type { Bezichtiging } from "@/integrations/supabase/types";
import type { PropertyAnalysis } from "@/lib/types";

const TABS = [
  { id: "gegevens", label: "Gegevens" },
  { id: "media", label: "Foto's & video's" },
  { id: "buurt", label: "Buurt & Kadaster" },
  { id: "beoordeling", label: "Beoordeling" },
  { id: "analyse", label: "Analyse" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/bezichtiging/$id")({
  validateSearch: z.object({ tab: z.enum(["gegevens", "media", "buurt", "beoordeling", "analyse"]).optional() }),
  component: () => (
    <AppShell>
      <Detail />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Bezichtiging — VastgoedAI" }] }),
});

function Detail() {
  const { id } = Route.useParams();
  const { tab: tabParam } = Route.useSearch();
  const tab: TabId = tabParam ?? "gegevens";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isTeamlid } = useAuth();
  const q = useQuery({ queryKey: ["bezichtiging", id], queryFn: () => haalBezichtiging(id), enabled: isTeamlid === true });
  const { concept, zet, reset, gewijzigd } = useConcept({});
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !gewijzigd) reset(q.data);
  }, [q.data]);

  // Adres in de tabtitel, zodat je tabbladen en bladwijzers herkent
  useEffect(() => {
    if (q.data?.adres) document.title = `${q.data.adres.split(",")[0]} — VastgoedAI`;
  }, [q.data?.adres]);

  const zetTab = (t: TabId) => navigate({ to: ".", search: { tab: t }, replace: true });

  const bijwerken = (b: Bezichtiging) => {
    qc.setQueryData(["bezichtiging", id], b);
    qc.invalidateQueries({ queryKey: ["bezichtigingen"] });
  };

  const bewaar = async () => {
    setOpslaan(true);
    setFout(null);
    try {
      const { id: _i, created_at: _c, updated_at: _u, created_by: _b, analyse_data: _a, buurt_data: _bd, buurt_at: _ba, ...patch } = concept;
      const b = await wijzigBezichtiging(id, patch);
      bijwerken(b);
      reset(b);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setOpslaan(false);
    }
  };

  const snelStatus = async (status: string) => {
    const b = await wijzigBezichtiging(id, { status });
    bijwerken(b);
    reset({ ...concept, status });
  };

  const bewaarAnalyse = async (a: PropertyAnalysis) => {
    const b = await wijzigBezichtiging(id, { analyse_data: a as any, analyse_at: new Date().toISOString() });
    bijwerken(b);
  };

  const bewaarBuurt = async (d: BuurtData) => {
    const b = await wijzigBezichtiging(id, { buurt_data: d as any, buurt_at: new Date().toISOString() });
    bijwerken(b);
  };

  const zetPerceel = async (m2: number) => {
    const bronnen = { ...((q.data?.bronnen as Record<string, string>) ?? {}), perceel_m2: "kadaster" };
    const b = await wijzigBezichtiging(id, { perceel_m2: m2, bronnen });
    bijwerken(b);
    if (!gewijzigd) reset(b);
  };

  const verwijder = async () => {
    if (!confirm("Deze bezichtiging met alle foto's en video's definitief verwijderen?")) return;
    await verwijderBezichtiging(id);
    await qc.invalidateQueries({ queryKey: ["bezichtigingen"] });
    navigate({ to: "/" });
  };

  if (q.isLoading || isTeamlid === null) {
    return (
      <div className="py-20 flex justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-10 text-center">
        <p className="text-sm text-muted-foreground">Deze bezichtiging bestaat niet (meer).</p>
        <Link to="/" className="text-sm font-semibold text-navy mt-2 inline-block">
          Terug naar overzicht
        </Link>
      </div>
    );
  }

  const b = q.data;
  const ppm = prijsPerM2(b);

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="size-4" /> Overzicht
      </Link>

      <div className="flex items-start gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={b.status} />
            {b.energielabel && <EnergieLabel label={b.energielabel} />}
            <span className="text-xs text-muted-foreground">Bezocht {datumKort(b.datum)}</span>
          </div>
          <h1 className="display text-xl md:text-2xl font-extrabold tracking-tight text-navy mt-1.5">{b.adres}</h1>
          <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap mt-0.5">
            {b.woonplaats && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {b.woonplaats}
              </span>
            )}
            {b.lat && b.lon && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lon}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Kaart <ExternalLink className="size-3" />
              </a>
            )}
            {b.funda_url && (
              <a href={b.funda_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                Funda <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <select
          value={b.status}
          onChange={(e) => snelStatus(e.target.value)}
          className="bg-card rounded-md px-2.5 py-2 text-sm border border-border font-semibold"
          aria-label="Status"
        >
          {STATUSSEN.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Kpi label="Vraagprijs" waarde={eur(b.vraagprijs)} />
        <Kpi label="Woonoppervlakte" waarde={getal(b.woonoppervlakte_m2, " m²")} />
        <Kpi label="Prijs per m²" waarde={ppm ? eur(ppm) : "—"} />
        <Kpi label={`WOZ${b.woz_jaar ? ` ${b.woz_jaar}` : ""}`} waarde={eur(b.woz_waarde)} />
      </div>

      <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto -mx-4 px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => zetTab(t.id)}
            className={`px-3 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap ${
              tab === t.id ? "border-primary text-navy" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "gegevens" && (
        <div className="space-y-4">
          <BezichtigingVelden c={concept} zet={zet} />
          <PandVelden c={concept} zet={zet} />
          <button onClick={verwijder} className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline">
            <Trash2 className="size-4" /> Bezichtiging verwijderen
          </button>
        </div>
      )}
      {tab === "media" && <MediaGalerij bezichtigingId={id} />}
      {tab === "buurt" && <BuurtSectie b={b} opslaan={bewaarBuurt} zetPerceel={zetPerceel} />}
      {tab === "beoordeling" && <BeoordelingVelden c={concept} zet={zet} />}
      {tab === "analyse" && <AnalyseSectie b={b} opslaan={bewaarAnalyse} />}

      {gewijzigd && (tab === "gegevens" || tab === "beoordeling") && (
        <div className="sticky bottom-16 md:bottom-4 z-20 mt-4 flex items-center justify-end gap-2">
          {fout && <span className="text-sm text-destructive mr-auto">{fout}</span>}
          <button
            onClick={() => reset(b)}
            className="rounded-md px-4 py-3 text-sm font-semibold border border-border bg-card shadow-card"
          >
            Annuleren
          </button>
          <button
            onClick={bewaar}
            disabled={opslaan}
            className="inline-flex items-center gap-2 bg-navy text-primary-foreground rounded-md px-5 py-3 text-sm font-bold shadow-elevated disabled:opacity-50"
          >
            {opslaan ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Opslaan
          </button>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="label-eyebrow">{label}</div>
      <div className="font-bold text-foreground tabular mt-0.5">{waarde}</div>
    </div>
  );
}
