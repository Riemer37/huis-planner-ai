import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  session: Session | null;
  laden: boolean;
  /** null = nog onbekend */
  isTeamlid: boolean | null;
}

const AuthContext = createContext<AuthState>({ session: null, laden: true, isTeamlid: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [laden, setLaden] = useState(true);
  const [isTeamlid, setIsTeamlid] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLaden(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsTeamlid(null);
      return;
    }
    supabase.rpc("is_teamlid").then(({ data }) => setIsTeamlid(!!data));
  }, [session?.user.id]);

  return <AuthContext.Provider value={{ session, laden, isTeamlid }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
