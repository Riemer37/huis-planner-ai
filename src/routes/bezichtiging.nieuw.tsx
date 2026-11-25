import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, Info, Loader2, Search } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { BezichtigingVelden, PandVelden } from "@/components/bezichtiging/Velden";
import { prefillPand } from "@/lib/prefill.functions";
import { maakBezichtiging } from "@/lib/bezichtigingen";
import { useConcept } from "@/lib/useConcept";
import { AdresZoeker } from "@/components/bezichtiging/AdresZoeker";
import type { BezichtigingInsert } from "@/integrations/supabase/types";

export const Route = createFileRoute("/bezichtiging/nieuw")({
  component: () => (
    <AppShell>
      <Nieuw />
    </AppShell>
  ),
  head: () => ({ meta: [{ title: "Nieuwe bezichtiging — VastgoedAI" }] }),
});

function vandaag() {
  return new Date().toISOString().slice(0, 10);
}

function Nieuw() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const prefill = useServerFn(prefillPand);
  const [zoek, setZoek] = useState("");
  const [stap, setStap] = useState<"zoeken" | "controleren">("zoeken");
  const [laden, setLaden] = useState(false);
  const [opslaan, setOpslaan] = useState(false);
  const [meldingen, setMeldingen] = useState<string[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const { concept, zet, reset } = useConcept({ datum: vandaag(), status: "bezocht", pandtype: "woning", bronnen: {} });

  const ophalen = async (tekst = zoek) => {
    if (tekst.trim().length < 3 || laden) return;
    setLaden(true);
    setFout(null);
    try {
      const r = await prefill({ data: { query: tekst.trim() } });
      const { meldingen: m, bronnen, ...velden } = r;
      reset({ ...concept, ...velden, bronnen });
      setMeldingen(m);
      setStap("controleren");
    } catch (e) {
      setFout((e as Error).message || "Ophalen mislukt");
    } finally {
      setLaden(false);
    }
  };

  const handmatig = () => {
    reset({ ...concept, adres: zoek.trim() || "" });
    setMeldingen([]);
    setStap("controleren");
  };

  const bewaar = async () => {
    if (!concept.adres?.trim()) {
      setFout("Vul een adres in.");
      return;
    }
    setOpslaan(true);
    setFout(null);
    try {
      const { id: _i, created_at: _c, updated_at: _u, created_by: _b, ...rest } = concept;
      const b = await maakBezichtiging(rest as BezichtigingInsert);
      await qc.invalidateQueries({ queryKey: ["bezichtigingen"] });
      navigate({ to: "/bezichtiging/$id", params: { id: b.id }, search: { tab: "media" } });
    } catch (e) {
      setFout((e as Error).message);
      setOpslaan(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="size-4" /> Overzicht
      </Link>
      <PageHeader titel="Nieuwe bezichtiging" />

      {stap === "zoeken" ? (
        <div className="panel p-5 space-y-4">
          <div className="block">
            <span className="label-eyebrow">Adres of Funda-link</span>
            <div className="mt-1">
              <AdresZoeker waarde={zoek} onChange={setZoek} onKies={(v) => ophalen(v)} autoFocus />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Kies een adres uit de lijst; je hoeft de plaats er niet bij te typen. We halen automatisch op: m² en gebruiksdoel (BAG), bouwjaar, energielabel (EP-online), WOZ-waarde en
            monumentstatus. Met een Funda-link ook de vraagprijs.
          </p>
          {fout && <p className="text-sm text-destructive">{fout}</p>}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => ophalen()}
              disabled={laden || zoek.trim().length < 3}
              className="inline-flex items-center justify-center gap-2 bg-navy text-primary-foreground rounded-md px-5 py-3 text-sm font-bold disabled:opacity-50"
            >
              {laden ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {laden ? "Gegevens ophalen…" : "Gegevens ophalen"}
            </button>
            <button onClick={handmatig} className="rounded-md px-5 py-3 text-sm font-semibold border border-border bg-card">
              Zelf invullen
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {meldingen.length > 0 && (
            <div className="panel p-3 flex gap-2 text-sm bg-[var(--source-manual-bg)] border-transparent">
              <Info className="size-4 mt-0.5 shrink-0 text-[var(--source-manual)]" />
              <ul className="space-y-0.5">
                {meldingen.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <BezichtigingVelden c={concept} zet={zet} />
          <PandVelden c={concept} zet={zet} />
          {fout && <p className="text-sm text-destructive">{fout}</p>}
          <div className="sticky bottom-16 md:bottom-4 z-20 flex gap-2 justify-end">
            <button
              onClick={() => setStap("zoeken")}
              className="rounded-md px-4 py-3 text-sm font-semibold border border-border bg-card shadow-card"
            >
              Terug
            </button>
            <button
              onClick={bewaar}
              disabled={opslaan}
              className="inline-flex items-center gap-2 bg-navy text-primary-foreground rounded-md px-5 py-3 text-sm font-bold shadow-elevated disabled:opacity-50"
            >
              {opslaan ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Opslaan & foto's toevoegen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
