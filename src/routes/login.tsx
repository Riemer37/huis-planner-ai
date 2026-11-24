import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: Login,
  head: () => ({ meta: [{ title: "Inloggen — VastgoedAI" }] }),
});

function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [modus, setModus] = useState<"inloggen" | "registreren">("inloggen");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  const verstuur = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    setMelding(null);
    const { data, error } =
      modus === "inloggen"
        ? await supabase.auth.signInWithPassword({ email, password: wachtwoord })
        : await supabase.auth.signUp({
            email,
            password: wachtwoord,
            options: { emailRedirectTo: window.location.origin },
          });
    setBezig(false);
    if (error) {
      setFout(
        error.message.includes("Invalid login")
          ? "E-mail of wachtwoord klopt niet."
          : error.message.includes("Email not confirmed")
            ? "Bevestig eerst je e-mailadres via de link in je mail."
            : error.message,
      );
      return;
    }
    if (modus === "registreren" && !data.session) {
      setMelding("Account aangemaakt. Open de bevestigingslink in je mail en log daarna in.");
      setModus("inloggen");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={verstuur} className="w-full max-w-sm panel shadow-elevated p-7 space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="size-9 rounded-md bg-navy flex items-center justify-center">
            <Building2 className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold display text-navy">VastgoedAI</div>
            <div className="text-xs text-muted-foreground">Bezichtigingen & analyse</div>
          </div>
        </div>

        <label className="block">
          <span className="label-eyebrow">E-mail</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full bg-muted rounded-md px-3 py-2.5 text-sm border border-border"
          />
        </label>
        <label className="block">
          <span className="label-eyebrow">Wachtwoord</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={modus === "inloggen" ? "current-password" : "new-password"}
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            className="mt-1 w-full bg-muted rounded-md px-3 py-2.5 text-sm border border-border"
          />
        </label>

        {fout && <p className="text-sm text-destructive">{fout}</p>}
        {melding && <p className="text-sm text-positive">{melding}</p>}

        <button
          disabled={bezig}
          className="w-full inline-flex items-center justify-center gap-2 bg-navy text-primary-foreground rounded-md py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {bezig && <Loader2 className="size-4 animate-spin" />}
          {modus === "inloggen" ? "Inloggen" : "Account aanmaken"}
        </button>
        <button
          type="button"
          onClick={() => setModus(modus === "inloggen" ? "registreren" : "inloggen")}
          className="w-full text-xs text-muted-foreground hover:text-foreground"
        >
          {modus === "inloggen" ? "Nog geen account? Maak er een aan" : "Ik heb al een account"}
        </button>
      </form>
    </div>
  );
}
