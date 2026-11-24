import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Camera, ImageOff, Loader2, Plus, Search } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusBadge, EnergieLabel } from "@/components/bezichtiging/Badges";
import {
  STATUSSEN,
  datumKort,
  eur,
  getal,
  lijstBezichtigingen,
  omslagFotos,
  prijsPerM2,
} from "@/lib/bezichtigingen";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Overzicht,
  head: () => ({ meta: [{ title: "Bezichtigingen — VastgoedAI" }] }),
});

function Overzicht() {
  return (
    <AppShell>
      <OverzichtInhoud />
    </AppShell>
  );
}

function OverzichtInhoud() {
  const { isTeamlid } = useAuth();
  const [filter, setFilter] = useState<string>("alle");
  const [zoek, setZoek] = useState("");

  const lijst = useQuery({
    queryKey: ["bezichtigingen"],
    queryFn: lijstBezichtigingen,
    enabled: isTeamlid === true,
  });
  const ids = (lijst.data ?? []).map((b) => b.id);
  const fotos = useQuery({
    queryKey: ["omslagfotos", ids.join(",")],
    queryFn: () => omslagFotos(ids),
    enabled: ids.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (lijst.data ?? []).filter(
      (b) =>
        (filter === "alle" || b.status === filter) &&
        (!q || `${b.adres} ${b.woonplaats ?? ""}`.toLowerCase().includes(q)),
    );
  }, [lijst.data, filter, zoek]);

  const telling = useMemo(() => {
    const t: Record<string, number> = {};
    for (const b of lijst.data ?? []) t[b.status] = (t[b.status] ?? 0) + 1;
    return t;
  }, [lijst.data]);

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6">
      <PageHeader
        titel="Bezichtigingen"
        sub={lijst.data ? `${lijst.data.length} panden bekeken` : undefined}
        actie={
          <Link
            to="/bezichtiging/nieuw"
            className="hidden md:inline-flex items-center gap-2 bg-navy text-primary-foreground rounded-md px-4 py-2.5 text-sm font-bold shadow-card hover:brightness-110"
          >
            <Plus className="size-4" /> Nieuwe bezichtiging
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op adres of plaats"
            className="w-full bg-card rounded-md pl-9 pr-3 py-2.5 text-sm border border-border"
          />
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
        <FilterKnop actief={filter === "alle"} onClick={() => setFilter("alle")}>
          Alle {lijst.data ? `(${lijst.data.length})` : ""}
        </FilterKnop>
        {STATUSSEN.map((s) => (
          <FilterKnop key={s.id} actief={filter === s.id} onClick={() => setFilter(s.id)}>
            {s.label} {telling[s.id] ? `(${telling[s.id]})` : ""}
          </FilterKnop>
        ))}
      </div>

      {lijst.isLoading || isTeamlid === null ? (
        <div className="py-20 flex justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : lijst.error ? (
        <p className="text-sm text-destructive">Laden mislukt: {(lijst.error as Error).message}</p>
      ) : !lijst.data?.length ? (
        <LegeStaat />
      ) : !zichtbaar.length ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Geen bezichtigingen met dit filter.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {zichtbaar.map((b) => {
            const ppm = prijsPerM2(b);
            const foto = fotos.data?.[b.id];
            return (
              <Link
                key={b.id}
                to="/bezichtiging/$id"
                params={{ id: b.id }}
                className="panel overflow-hidden lift block"
              >
                <div className="aspect-[16/10] bg-muted relative">
                  {foto ? (
                    <img src={foto} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
                      <ImageOff className="size-7" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <StatusBadge status={b.status} />
                  </div>
                  {b.energielabel && (
                    <div className="absolute top-2 right-2">
                      <EnergieLabel label={b.energielabel} />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="font-semibold text-foreground truncate">{b.adres}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {datumKort(b.datum)}
                    {b.woonplaats ? ` · ${b.woonplaats}` : ""}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm tabular">
                    <Kengetal label="Vraagprijs" waarde={eur(b.vraagprijs)} />
                    <Kengetal label="Woonopp." waarde={getal(b.woonoppervlakte_m2, " m²")} />
                    <Kengetal label="Per m²" waarde={ppm ? eur(ppm) : "—"} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Link
        to="/bezichtiging/nieuw"
        className="md:hidden fixed right-4 bottom-20 z-30 size-14 rounded-full bg-navy text-primary-foreground shadow-elevated flex items-center justify-center"
        aria-label="Nieuwe bezichtiging"
      >
        <Plus className="size-6" />
      </Link>
    </div>
  );
}

function FilterKnop({ actief, onClick, children }: { actief: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
        actief ? "bg-navy text-primary-foreground border-transparent" : "bg-card text-muted-foreground border-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Kengetal({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold truncate">{waarde}</div>
    </div>
  );
}

function LegeStaat() {
  return (
    <div className="panel p-10 text-center max-w-lg mx-auto mt-6">
      <div className="size-12 rounded-full bg-muted mx-auto flex items-center justify-center mb-3">
        <Camera className="size-5 text-navy" />
      </div>
      <h2 className="font-bold text-navy">Nog geen bezichtigingen</h2>
      <p className="text-sm text-muted-foreground mt-1.5">
        Typ een adres of plak een Funda-link. De gegevens uit het Kadaster, de WOZ-waarde en het
        energielabel worden automatisch opgehaald. Daarna voeg je foto's en notities toe.
      </p>
      <Link
        to="/bezichtiging/nieuw"
        className="mt-5 inline-flex items-center gap-2 bg-navy text-primary-foreground rounded-md px-4 py-2.5 text-sm font-bold"
      >
        <Plus className="size-4" /> Eerste bezichtiging
      </Link>
    </div>
  );
}
