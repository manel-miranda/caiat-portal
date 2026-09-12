import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BedDouble, CalendarDays, CreditCard, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DishViewer } from "@/components/DishViewer";
import { DemoFoodMenu, isMenuDish } from "@/components/DemoFoodMenu";
import { GuestCatalog, type CatalogSelection } from "@/components/GuestCatalog";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { mad, nights, shortDate } from "@/lib/format";
import { statusLabel, t } from "@/lib/i18n";
import { guestCreateRequest, guestPortalQuery, type GuestPortalData } from "@/lib/guest";
import { paymentStatusQuery, startCheckout, type PaymentConfig } from "@/lib/payments";

export const Route = createFileRoute("/guest/$token")({
  head: () => ({
    meta: [
      { title: "Guest portal — Caiat Lounge Refuge" },
      {
        name: "description",
        content:
          "Private guest portal for your stay at Caiat Lounge Refuge: request services, see your bill and contact reception.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Caiat Lounge Refuge — Guest portal" },
      {
        property: "og:description",
        content: "Request services and view your bill during your stay at Caiat Lounge Refuge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuestPortalPage,
});

function GuestPortalPage() {
  const { token } = Route.useParams();
  const q = useQuery(guestPortalQuery(token));

  if (q.isPending) {
    return <Centered>{t("loading")}</Centered>;
  }
  if (q.isError || !q.data) {
    // Identical response for unknown, revoked and closed stays: no leakage.
    return <Centered>{t("linkInactive")}</Centered>;
  }

  return <Portal token={token} data={q.data} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <h1 className="text-2xl font-semibold text-primary">Caiat Lounge Refuge</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <LanguageSwitcher />
        <CurrencySwitcher />
      </div>
    </main>
  );
}

function Portal({ token, data }: { token: string; data: GuestPortalData }) {
  const queryClient = useQueryClient();
  const paymentStatus = useQuery(paymentStatusQuery());
  const payment: PaymentConfig = paymentStatus.data ?? { available: false };
  const [selection, setSelection] = useState<CatalogSelection>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payResult, setPayResult] = useState<"success" | "cancelled" | "error" | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["guest-portal", token] });
  }

  // Outcome of a PayPal redirect: read once, then clean the URL.
  useEffect(() => {
    const state = new URLSearchParams(window.location.search).get("payment");
    if (state === "success" || state === "cancelled" || state === "error") {
      setPayResult(state);
      window.history.replaceState({}, "", window.location.pathname);
      if (state === "success") void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function payNow() {
    setPayBusy(true);
    try {
      // The server decides the amount; the browser never sends one.
      const approveUrl = await startCheckout(token);
      window.location.href = approveUrl;
    } catch (e) {
      const code = (e as Error).message;
      toast.error(code === "NOTHING_DUE" ? t("paymentNothingDue") : t("paymentError"));
      setPayBusy(false);
    }
  }

  function errorText(code: string) {
    if (code === "TOO_MANY_REQUESTS") return t("requestTooMany");
    if (code === "TOO_LONG") return t("requestTooLong");
    if (code === "INVALID_TOKEN") return t("linkInactive");
    return t("requestFailed");
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await guestCreateRequest({
        token,
        serviceTypeId: selection?.kind === "item" ? selection.service.id : null,
        customLabel: customLabel.slice(0, 80),
        notes: notes.slice(0, 500),
      });
      setCustomLabel("");
      setNotes("");
      setSelection(null);
      await refresh();
      toast.success(t("requestSent"));
    } catch (e2) {
      toast.error(errorText((e2 as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function askReception() {
    setBusy(true);
    try {
      await guestCreateRequest({
        token,
        serviceTypeId: null,
        customLabel: "",
        notes: "",
        kind: "payment_help",
      });
      await refresh();
      toast.success(t("paymentHelpSent"));
    } catch (e2) {
      toast.error(errorText((e2 as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg bg-background px-4 pb-16 pt-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Caiat Lounge Refuge</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {t("guestPortalTitle")}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <LanguageSwitcher />
          <CurrencySwitcher />
        </div>
      </header>

      {/* ---- My stay ---- */}
      <section className="surface-card mt-6 p-3 sm:p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("myStay")}
        </h2>
        <p className="mt-2 text-lg font-semibold">
          {t("guestWelcome", { name: data.guest_first_name ?? "" })}
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <BedDouble className="size-4 shrink-0 text-muted-foreground" />
            {data.room_name ?? data.room_number}
          </li>
          <li className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            {shortDate(data.check_in)} – {shortDate(data.check_out)} (
            {nights(data.check_in, data.check_out)} {t("nights")})
          </li>
          <li className="flex items-center gap-2">
            <Users className="size-4 shrink-0 text-muted-foreground" />
            {data.num_guests} {t("guests")}
          </li>
        </ul>
      </section>

      {/* ---- Menu 3D/AR prototype ---- */}
      <DishViewer />

      {/* ---- Food & drinks menu with cart ---- */}
      <DemoFoodMenu
        token={token}
        services={data.services}
        demoServices={data.demo_services ?? []}
      />


      {/* ---- Request something ---- */}
      <section className="surface-card mt-4 p-3 sm:p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("requestSomething")}
        </h2>
        <form className="mt-3 space-y-4" onSubmit={submitRequest}>
          <GuestCatalog
            services={data.services.filter((s) => !isMenuDish(s))}
            selection={selection}
            onSelect={(next) => {
              setSelection(next);
              if (next?.kind !== "else") setCustomLabel("");
            }}
          />

          {selection?.kind === "else" ? (
            <div className="space-y-2">
              <Label htmlFor="what">{t("describeRequest")}</Label>
              <Input
                id="what"
                maxLength={80}
                className="tap-target text-base"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                required
              />
            </div>
          ) : null}

          {selection ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="gnotes">{`${t("notes")} (${t("optional")})`}</Label>
                <Textarea
                  id="gnotes"
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="tap-target w-full rounded-xl text-base"
              >
                <Send className="me-2 size-4" /> {t("sendRequest")}
              </Button>
            </>
          ) : null}
        </form>
      </section>

      {/* ---- My requests ---- */}
      <section className="surface-card mt-4 p-3 sm:p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("myRequests")}
        </h2>
        {data.requests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noRequestsYet")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {data.requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                  {statusLabel(r.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- My bill ---- */}
      <section className="surface-card mt-4 p-3 sm:p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("myBill")}
        </h2>
        <div className="mt-3 space-y-2 text-sm">
          <Row label={t("accommodation")} value={mad(data.accommodation_total)} />
          {data.charges.map((c) => (
            <Row
              key={c.id}
              label={`${c.label}${Number(c.quantity) !== 1 ? ` ×${c.quantity}` : ""}`}
              value={mad(c.total)}
            />
          ))}
          <div className="!mt-3 space-y-2 border-t border-border pt-3">
            <Row label={t("total")} value={mad(data.total)} strong />
            <Row label={t("paid")} value={mad(data.paid)} />
            <Row label={t("outstanding")} value={mad(data.outstanding)} strong />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("baseCurrencyNote")}</p>
      </section>

      {/* ---- Pay ---- */}
      <section className="surface-card mt-4 p-3 sm:p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <CreditCard className="size-4" /> {t("payOnline")}
        </h2>

        {payResult ? (
          <p
            className={`mt-2 rounded-xl px-3 py-2 text-sm ${
              payResult === "success"
                ? "bg-primary/10 font-semibold text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {payResult === "success"
              ? t("paymentSuccess")
              : payResult === "cancelled"
                ? t("paymentCancelled")
                : t("paymentError")}
          </p>
        ) : null}

        {payment.available && Number(data.outstanding) > 0 ? (
          <>
            <Button
              className="tap-target mt-3 w-full rounded-xl text-base"
              disabled={payBusy}
              onClick={() => void payNow()}
            >
              {payBusy ? t("paymentRedirecting") : t("payWithPaypal")}
            </Button>
            {payment.environment === "sandbox" ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("paypalSandboxNote")}</p>
            ) : null}
          </>
        ) : payment.available ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("paymentNothingDue")}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{t("paymentUnavailable")}</p>
            <Button
              variant="outline"
              className="tap-target mt-3 w-full rounded-xl"
              disabled={busy}
              onClick={() => void askReception()}
            >
              {t("askReception")}
            </Button>
          </>
        )}
      </section>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className={`min-w-0 break-words ${strong ? "font-semibold" : ""}`}>{label}</span>
      <span className={`shrink-0 ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
