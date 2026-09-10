import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usernameToEmail } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caiat Operations — Guesthouse staff sign in" },
      {
        name: "description",
        content:
          "Internal operations app for the Caiat guesthouse: rooms, stays, charges, payments and cash control.",
      },
      { property: "og:title", content: "Caiat Operations" },
      {
        property: "og:description",
        content: "Internal operations app for the Caiat guesthouse in Morocco.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: "/home", replace: true });
    }
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const identifier = username.trim();
    const email = identifier.includes("@") ? identifier : usernameToEmail(identifier);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password: pin });
    setBusy(false);
    if (err) {
      setError(t("invalidCredentials"));
      return;
    }
    navigate({ to: "/home", replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-primary">{t("appName")}</h1>
          <p className="mt-1 text-sm uppercase tracking-[0.2em] text-muted-foreground">
            {t("appSubtitle")}
          </p>
        </div>

        <form onSubmit={submit} className="surface-card space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="username">{t("usernameOrPhone")}</Label>
            <Input
              id="username"
              autoCapitalize="none"
              autoCorrect="off"
              className="tap-target text-base"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pin">{t("pin")}</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              className="tap-target text-center text-2xl tracking-[0.4em]"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          <Button type="submit" className="tap-target w-full rounded-xl text-base" disabled={busy}>
            {busy ? t("loading") : t("enter")}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">{t("loginHelp")}</p>

      </div>
    </div>
  );
}
