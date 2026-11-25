import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPinned, RefreshCw } from "lucide-react";
import type { Bezichtiging } from "@/integrations/supabase/types";
import { haalBuurtData, type BuurtData } from "@/lib/buurt.functions";
import { datumKort, eur, getal } from "@/lib/bezichtigingen";
import { Sectie } from "./Velden";

function huisnummerUit(adres: string) {
  return adres.match(/\b(\d+)\s*[a-zA-Z]?\b/)?.[1];
}

export function BuurtSectie({
  b,
  opslaan,
  zetPerceel,
}: {
  b: Bezichtiging;
  opslaan: (d: BuurtData) => Promise<void>;
  zetPerceel: (m2: number) => Promise<void>;
}) {
  const ophalenFn = useServerFn(haalBuurtData);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const data = b.buurt_data as unknown as BuurtData | null;
  const automatisch = useRef(false);

  const ophalen = async () => {
    if (b.lat == null || b.lon == null) return;
    setBezig(true);
    setFout(null);
    try {
      const d = await ophalenFn({
        data: {
          lat: b.lat,
          lon: b.lon,
          postcode: b.postcode ?? undefined,
          huisnummer: huisnummerUit(b.adres),
          buurtcode: b.buurtcode ?? undefined,
          bag_id_eigen: b.bag_id ?? undefined,
        },
      });
      await opslaan(d);
    } catch (e) {
      setFout((e as Error).message || "Ophalen mislukt");
    } finally {
      setBezig(false);
    }
  };

  // Eerste keer automatisch ophalen
  useEffect(() => {
    if (!data && !automatisch.current && b.lat != null) {
      automatisch.current = true;
      ophalen();
    }
  }, []);

  if (b.lat == null || b.lon == null) {
    return (
      <div className="panel p-6 text-center text-sm text-muted-foreground">
        Geen locatie bekend voor dit adres. Pas het adres aan bij Gegevens zodat het op de kaart gevonden wordt.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="panel p-8 text-center">
        {bezig ? (
          <>
            <Loader2 className="size-6 animate-spin text-navy mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Kadaster, WOZ van de buren en verkopen in de buurt ophalen…</p>
          </>
        ) : (
          <>
            <MapPinned className="size-6 text-navy mx-auto mb-2" />
            {fout && <p className="text-sm text-destructive mb-3">{fout}</p>}
            <button onClick={ophalen} className="bg-navy text-primary-foreground rounded-md px-5 py-3 text-sm font-bold">
              Buurtgegevens ophalen
            </button>
          </>
        )}
      </div>
    );
  }

  const eigenPpm = b.vraagprijs && b.woonoppervlakte_m2 ? Math.round(b.vraagprijs / b.woonoppervlakte_m2) : null;
  const verkochtPpm = data.verkopen.map((v) => v.prijs_per_m2).filter((x): x is number => !!x);
  const gemVerkochtPpm = verkochtPpm.length
    ? Math.round(verkochtPpm.reduce((a, c) => a + c, 0) / verkochtPpm.length)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Opgehaald {datumKort(data.opgehaald)}</span>
        <button onClick={ophalen} disabled={bezig} className="inline-flex items-center gap-1.5 font-semibold hover:text-foreground disabled:opacity-50">
          {bezig ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Opnieuw ophalen
        </button>
      </div>
      {fout && <p className="text-sm text-destructive">{fout}</p>}

      {/* Prijsvergelijking */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Vraagprijs per m²" waarde={eigenPpm ? eur(eigenPpm) : "—"} />
        <Kpi label="Verkocht in buurt, per m²" waarde={gemVerkochtPpm ? eur(gemVerkochtPpm) : "—"} sub={verkochtPpm.length ? `${verkochtPpm.length} ${verkochtPpm.length === 1 ? "verkoop" : "verkopen"}` : undefined} />
        <Kpi label="WOZ buren, per m²" waarde={data.woz_buren_mediaan_m2 ? eur(data.woz_buren_mediaan_m2) : "—"} sub="mediaan" />
        <Kpi label="Gem. WOZ buurt" waarde={eur(data.cijfers?.gemiddelde_woz)} sub={data.cijfers?.jaar ? `CBS ${data.cijfers.jaar}` : undefined} />
      </div>

      {/* Verkopen */}
      <Sectie titel="Recent verkocht in de buurt">
        {data.verkopen_status === "ok" && data.verkopen.length ? (
          <div className="overflow-x-auto -mx-4 md:-mx-5">
            <table className="w-full text-sm tabular min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-4 md:px-5 py-2 font-semibold">Adres</th>
                  <th className="py-2 font-semibold">Datum</th>
                  <th className="py-2 font-semibold text-right">Prijs</th>
                  <th className="py-2 font-semibold text-right">m²</th>
                  <th className="px-4 md:px-5 py-2 font-semibold text-right">Per m²</th>
                </tr>
              </thead>
              <tbody>
                {data.verkopen.map((v, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-4 md:px-5 py-2">
                      <div className="font-medium">{v.adres}</div>
                      <div className="text-xs text-muted-foreground">
                        {[v.type, v.bouwjaar && `bj ${v.bouwjaar}`, v.energielabel && `label ${v.energielabel}`].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="py-2 whitespace-nowrap">{v.datum ? datumKort(v.datum) : "—"}</td>
                    <td className="py-2 text-right">{eur(v.prijs)}</td>
                    <td className="py-2 text-right">{getal(v.m2)}</td>
                    <td className="px-4 md:px-5 py-2 text-right font-semibold">{eur(v.prijs_per_m2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {data.verkopen_status === "geen_key"
              ? "Verkoopprijzen komen via Altum AI, maar die koppeling is niet ingesteld."
              : data.verkopen_status === "leeg"
                ? "Geen recente verkopen gevonden binnen 1 km."
                : `Verkopen konden niet worden opgehaald${data.verkopen_melding ? ` (${data.verkopen_melding})` : ""}.`}{" "}
            Bekijk ze zelf via de Funda-link hieronder.
          </p>
        )}
      </Sectie>

      {/* WOZ buren */}
      <Sectie titel="WOZ-waarde van de buren">
        {data.woz_buren.length ? (
          <div className="overflow-x-auto -mx-4 md:-mx-5">
            <table className="w-full text-sm tabular">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-4 md:px-5 py-2 font-semibold">Adres</th>
                  <th className="py-2 font-semibold text-right">WOZ</th>
                  <th className="hidden sm:table-cell py-2 font-semibold text-right">m²</th>
                  <th className="px-4 md:px-5 py-2 font-semibold text-right">Per m²</th>
                </tr>
              </thead>
              <tbody>
                {data.woz_buren.map((w, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-4 md:px-5 py-2">
                      <div className="font-medium">{w.adres.split(",")[0]}</div>
                      <div className="text-xs text-muted-foreground">
                        {[w.afstand_m != null && `${w.afstand_m} m`, w.bouwjaar && `bj ${w.bouwjaar}`].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      {eur(w.woz)}
                      <div className="text-xs text-muted-foreground">{w.woz_jaar}{w.m2 ? ` · ${w.m2} m²` : ""}</div>
                    </td>
                    <td className="hidden sm:table-cell py-2 text-right">{getal(w.m2)}</td>
                    <td className="px-4 md:px-5 py-2 text-right font-semibold">{eur(w.woz_per_m2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Geen WOZ-waarden van omliggende adressen gevonden.</p>
        )}
      </Sectie>

      {/* Kadaster */}
      <Sectie titel="Kadaster">
        {data.perceel ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Kadastrale aanduiding" waarde={data.perceel.aanduiding || "—"} />
            <Info label="Perceelgrootte" waarde={getal(data.perceel.grootte_m2, " m²")} />
            <Info label="BAG-id" waarde={b.bag_id ?? "—"} />
            <Info label="Gebruiksdoel" waarde={b.gebruiksdoel ?? "—"} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Geen perceel gevonden op deze locatie.</p>
        )}
        {data.perceel?.grootte_m2 && b.perceel_m2 !== data.perceel.grootte_m2 && (
          <button
            onClick={() => zetPerceel(data.perceel!.grootte_m2!)}
            className="mt-3 text-sm font-semibold text-navy hover:underline"
          >
            Perceelgrootte ({getal(data.perceel.grootte_m2, " m²")}) overnemen in de gegevens
          </button>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Eigenaar, hypotheek en betaalde koopsom staan niet in open data. Die koop je per adres bij het Kadaster
          (link hieronder).
        </p>
      </Sectie>

      {/* Buurt */}
      {data.cijfers && (
        <Sectie titel={`Buurt${b.buurt ? `: ${b.buurt}` : ""}`}>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Info label="Inwoners" waarde={getal(data.cijfers.inwoners)} />
            <Info label="Woningen" waarde={getal(data.cijfers.woningvoorraad)} />
            <Info label="Koopwoningen" waarde={getal(data.cijfers.perc_koop, "%")} />
            <Info label="Huurwoningen" waarde={getal(data.cijfers.perc_huur, "%")} />
            <Info label="Corporatiebezit" waarde={getal(data.cijfers.perc_corporatie, "%")} />
            <Info label="Inkomen per inwoner" waarde={eur(data.cijfers.inkomen_per_inwoner)} />
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Bron: CBS kerncijfers wijken en buurten {data.cijfers.jaar}</p>
        </Sectie>
      )}

      {/* Links */}
      <Sectie titel="Zelf verder kijken">
        <ul className="space-y-2">
          {data.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline">
                {l.label} <ExternalLink className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </Sectie>
    </div>
  );
}

function Kpi({ label, waarde, sub }: { label: string; waarde: string; sub?: string }) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="label-eyebrow">{label}</div>
      <div className="font-bold text-foreground tabular mt-0.5">{waarde}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Info({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div>
      <dt className="label-eyebrow">{label}</dt>
      <dd className="font-medium mt-0.5">{waarde}</dd>
    </div>
  );
}
