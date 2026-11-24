import { useCallback, useState } from "react";
import type { Bezichtiging } from "@/integrations/supabase/types";
import type { Concept } from "@/components/bezichtiging/Velden";

/** Lokale bewerkstatus; wijzigingen door de gebruiker krijgen bron "handmatig". */
export function useConcept(begin: Concept) {
  const [concept, setConcept] = useState<Concept>(begin);
  const [gewijzigd, setGewijzigd] = useState(false);

  const zet = useCallback(<K extends keyof Bezichtiging>(veld: K, waarde: Bezichtiging[K] | null) => {
    setConcept((c) => {
      const bronnen = { ...((c.bronnen as Record<string, string>) ?? {}) };
      if (bronnen[veld as string] && bronnen[veld as string] !== "handmatig") bronnen[veld as string] = "handmatig";
      return { ...c, [veld]: waarde, bronnen };
    });
    setGewijzigd(true);
  }, []);

  const reset = useCallback((c: Concept) => {
    setConcept(c);
    setGewijzigd(false);
  }, []);

  return { concept, zet, reset, gewijzigd };
}
