import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usernameToEmail } from "@/lib/auth";
import { resolveLandingPath } from "@/lib/landing";
import { isPublicDemo } from "@/lib/demo";
import { t } from "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { InstallAppButton } from "@/components/InstallAppButton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: isPublicDemo
          ? "Try Caiat Portal — public demo"
          : "Caiat Operations — Guesthouse staff sign in",
      },
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
  // Guards against a double navigation when the auth state settles while the
  // post-login redirect is already in flight.
  const redirecting = useRef(false);

  const goToLanding = useCallback(async () => {
    if (redirecting.current) return;
    redirecting.current = true;
    const to = await resolveLandingPath();
    navigate({ to, replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!loading && session) {
      void goToLanding();
    }
  }, [loading, session, goToLanding]);

  async function tryDemo() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/public/demo/login", { method: "POST" });
      if (!response.ok)
        throw new Error(
          "The demo is busy or temporarily unavailable. Please try again in a minute.",
        );
      const tokens = await response.json();
      const { error: sessionError } = await supabase.auth.setSession(tokens);
      if (sessionError) throw sessionError;
      await goToLanding();
    } catch {
      setError("The demo is busy or temporarily unavailable. Please try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const identifier = username.trim();
    const email = identifier.includes("@") ? identifier : usernameToEmail(identifier);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password: pin });
    if (err) {
      setBusy(false);
      setError(t("invalidCredentials"));
      return;
    }
    await goToLanding();
    setBusy(false);
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

        {isPublicDemo ? (
          <section className="surface-card space-y-4 p-5">
            <h2 className="text-xl font-semibold">Explore Caiat Portal</h2>
            <p className="text-sm text-muted-foreground">
              Try managing a stay, adding charges and recording a simulated payment before checkout.
              No registration needed.
            </p>
            <p className="text-sm text-muted-foreground">
              This is a shared demo with fictional data. Changes reset every hour. Please use
              invented names and details. No real payments are processed.
            </p>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              className="tap-target w-full"
              disabled={busy || loading}
              onClick={() => void tryDemo()}
            >
              {busy ? "Opening demo…" : "Try demo"}
            </Button>
          </section>
        ) : (
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
            <Button
              type="submit"
              className="tap-target w-full rounded-xl text-base"
              disabled={busy}
            >
              {busy ? t("loading") : t("enter")}
            </Button>
          </form>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <LanguageSwitcher />
          <CurrencySwitcher />
        </div>

        <InstallAppButton className="mx-auto mt-4 max-w-[16rem]" />

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {isPublicDemo
            ? "Public demo · Account and security settings are locked."
            : t("loginHelp")}
        </p>
      </div>
    </div>
  );
}
