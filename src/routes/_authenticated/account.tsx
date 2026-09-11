import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { roleLabel } from "@/lib/roles";
import { changeMyPin, isValidPin } from "@/lib/users";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "My account — Caiat Operations" },
      { name: "description", content: "Change your personal Caiat Operations sign-in PIN." },
      { property: "og:title", content: "My account — Caiat Operations" },
      { property: "og:description", content: "Change your personal Caiat Operations sign-in PIN." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

/** Self-service PIN change, reachable by every signed-in user. */
function AccountPage() {
  const { profile, role } = useAuth();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (pin !== confirm) throw new Error(t("pinMismatch"));
      await changeMyPin(pin);
      setPin("");
      setConfirm("");
      toast.success(t("pinReset"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={t("changeMyPin")}>
      <section className="surface-card p-4">
        <h1 className="text-lg font-semibold">{profile?.full_name ?? ""}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile?.username ?? ""} · {roleLabel(profile, role)}
        </p>
      </section>

      <section className="surface-card mt-4 space-y-3 p-4">
        <p className="font-semibold">{t("changeMyPin")}</p>
        <p className="text-xs text-muted-foreground">{t("pinRule")}</p>
        <Input
          className="tap-target text-base"
          inputMode="numeric"
          maxLength={6}
          type="password"
          value={pin}
          placeholder={t("newPin")}
          aria-label={t("newPin")}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <Input
          className="tap-target text-base"
          inputMode="numeric"
          maxLength={6}
          type="password"
          value={confirm}
          placeholder={t("confirmPin")}
          aria-label={t("confirmPin")}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <Button
          className="tap-target w-full rounded-xl"
          disabled={busy || !isValidPin(pin)}
          onClick={() => void save()}
        >
          {t("changeMyPin")}
        </Button>
      </section>
    </AppShell>
  );
}
