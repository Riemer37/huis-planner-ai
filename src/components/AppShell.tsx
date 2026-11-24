import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, Calculator, ClipboardList, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/", label: "Bezichtigingen", icon: ClipboardList },
  { to: "/analyse", label: "Snelle analyse", icon: Calculator },
] as const;

/** Vaste layout voor ingelogde pagina's: header op desktop, onderbalk op mobiel. */
export function AppShell({ children }: { children: ReactNode }) {
  const { session, laden, isTeamlid } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!laden && !session) navigate({ to: "/login" });
  }, [laden, session, navigate]);

  if (laden || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="size-8 rounded-md bg-navy flex items-center justify-center">
              <Building2 className="size-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight display text-navy">VastgoedAI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition"
                activeProps={{ className: "!text-navy bg-muted" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-xs text-muted-foreground truncate max-w-[200px]">
              {session.user.email}
            </span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Uitloggen"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-20 md:pb-8">
        {isTeamlid === false ? <GeenToegang email={session.user.email} /> : children}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border grid grid-cols-2 pb-[env(safe-area-inset-bottom)]">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.to === "/" }}
            className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground"
            activeProps={{ className: "!text-navy" }}
          >
            <n.icon className="size-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function GeenToegang({ email }: { email?: string }) {
  return (
    <div className="max-w-md mx-auto mt-16 px-4 text-center">
      <h1 className="text-lg font-bold text-navy">Nog geen toegang</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Je bent ingelogd als <strong>{email}</strong>, maar dit adres staat nog niet in het team. Vraag
        Riemer om je toe te voegen.
      </p>
    </div>
  );
}

export function PageHeader({ titel, sub, actie }: { titel: string; sub?: ReactNode; actie?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div className="min-w-0">
        <h1 className="display text-xl md:text-2xl font-extrabold tracking-tight text-navy truncate">{titel}</h1>
        {sub && <div className="text-sm text-muted-foreground mt-0.5">{sub}</div>}
      </div>
      {actie}
    </div>
  );
}
