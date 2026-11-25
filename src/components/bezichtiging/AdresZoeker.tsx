import { useEffect, useRef, useState } from "react";
import { Link2, Loader2, MapPin, Search } from "lucide-react";

interface Suggestie {
  id: string;
  weergavenaam: string;
}

const SUGGEST_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest";

/** Adresinvoer met suggesties uit heel Nederland (PDOK Locatieserver), zoals Google Maps. */
export function AdresZoeker({
  waarde,
  onChange,
  onKies,
  autoFocus,
}: {
  waarde: string;
  onChange: (v: string) => void;
  /** Aangeroepen met het volledige adres (of de Funda-link) zodra er gekozen is. */
  onKies: (v: string) => void;
  autoFocus?: boolean;
}) {
  const [suggesties, setSuggesties] = useState<Suggestie[]>([]);
  const [open, setOpen] = useState(false);
  const [actief, setActief] = useState(-1);
  const [laden, setLaden] = useState(false);
  const verzoek = useRef(0);
  const isUrl = /^https?:\/\//i.test(waarde.trim());

  useEffect(() => {
    const q = waarde.trim();
    if (isUrl || q.length < 3) {
      setSuggesties([]);
      return;
    }
    const nr = ++verzoek.current;
    const t = setTimeout(async () => {
      setLaden(true);
      try {
        const url = `${SUGGEST_URL}?q=${encodeURIComponent(q)}&fq=type:adres&rows=8&fl=id,weergavenaam`;
        const r = await fetch(url);
        const j = await r.json();
        if (nr !== verzoek.current) return; // verouderd antwoord
        setSuggesties((j?.response?.docs ?? []) as Suggestie[]);
        setActief(-1);
      } catch {
        if (nr === verzoek.current) setSuggesties([]);
      } finally {
        if (nr === verzoek.current) setLaden(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [waarde, isUrl]);

  const kies = (s: Suggestie) => {
    onChange(s.weergavenaam);
    setOpen(false);
    setSuggesties([]);
    onKies(s.weergavenaam);
  };

  const toets = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggesties.length) {
      e.preventDefault();
      setOpen(true);
      setActief((a) => (a + 1) % suggesties.length);
    } else if (e.key === "ArrowUp" && suggesties.length) {
      e.preventDefault();
      setActief((a) => (a <= 0 ? suggesties.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && actief >= 0 && suggesties[actief]) kies(suggesties[actief]);
      else if (!isUrl && suggesties.length === 1) kies(suggesties[0]);
      else if (waarde.trim().length >= 3) {
        setOpen(false);
        onKies(waarde.trim());
      }
    } else if (e.key === "Escape") setOpen(false);
  };

  const toonLijst = open && !isUrl && suggesties.length > 0;

  return (
    <div className="relative">
      {isUrl ? (
        <Link2 className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      ) : (
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      )}
      <input
        autoFocus={autoFocus}
        value={waarde}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={toets}
        placeholder="Begin met typen: Hoogstraat 12…  of plak een Funda-link"
        autoComplete="off"
        role="combobox"
        aria-expanded={toonLijst}
        className="w-full bg-muted rounded-md pl-9 pr-9 py-3 text-sm border border-border"
      />
      {laden && <Loader2 className="size-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {toonLijst && (
        <ul
          role="listbox"
          className="absolute z-40 mt-1 w-full bg-card border border-border rounded-md shadow-elevated overflow-hidden max-h-80 overflow-y-auto"
        >
          {suggesties.map((s, i) => {
            const [straat, ...rest] = s.weergavenaam.split(",");
            return (
              <li key={s.id} role="option" aria-selected={i === actief}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => kies(s)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 text-sm ${
                    i === actief ? "bg-muted" : "hover:bg-muted"
                  }`}
                >
                  <MapPin className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-medium text-foreground">{straat}</span>
                    {rest.length > 0 && <span className="block text-xs text-muted-foreground">{rest.join(",").trim()}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
