import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BedDouble,
  CreditCard,
  Bell,
  Plus,
  LogOut,
  Pencil,
  QrCode,
  ChevronDown,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { GuestAccessCard } from "@/components/GuestAccessCard";
import { countedStays, customerQuery } from "@/lib/customers";
import { useAuth } from "@/lib/auth";
import { useOnline } from "@/components/OfflineBanner";
import { businessLocalToISO, mad, nights, roomLabel, shortDate, shortDateTime } from "@/lib/format";
import { methodLabel, sourceLabel, statusLabel, t } from "@/lib/i18n";
import { serviceLabel } from "@/lib/service-i18n";
import {
  PREVIEW_STATUS_LABEL,
  isKitchenMenuDish,
  isOrderableKitchenDish,
  PREVIEW_TIMINGS,
  PREVIEW_TIMING_LABEL,
  staffCreateFoodOrder,
  type PreviewTiming,
  stayFoodOrdersQuery,
} from "@/lib/preview-orders";
import {
  requestsQuery,
  serviceTypesQuery,
  stayChargesQuery,
  stayPaymentsQuery,
  stayQuery,
  stayTotals,
} from "@/lib/queries";
import {
  addCharge,
  addPayment,
  addRequest,
  checkoutStay,
  confirmReservation,
  rejectReservation,
} from "@/lib/mutations";

export const Route = createFileRoute("/_authenticated/stays/$id")({
  head: () => ({ meta: [{ title: "Stay — Caiat Operations" }] }),
  component: StayDetailPage,
});

type Sheet = null | "charge" | "payment" | "request" | "checkout";

function StayDetailPage() {
  const { id } = Route.useParams();
  const { user, can } = useAuth();
  const online = useOnline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [overrideConfirm, setOverrideConfirm] = useState(false);
  const [guestAccessOpen, setGuestAccessOpen] = useState(false);

  const stayQ = useQuery(stayQuery(id));
  const chargesQ = useQuery(stayChargesQuery(id));
  const paymentsQ = useQuery(stayPaymentsQuery(id));
  const servicesQ = useQuery(serviceTypesQuery);
  const foodOrdersQ = useQuery(stayFoodOrdersQuery(id));
  const requestsQ = useQuery(requestsQuery);
  // Customer history behind this booking: new face or someone coming back?
  const guestId = stayQ.data?.guest_id;
  const customerQ = useQuery({ ...customerQuery(guestId ?? ""), enabled: Boolean(guestId) });
  const customerStayCount = customerQ.data ? countedStays(customerQ.data).length : 0;

  const stay = stayQ.data;
  const services = servicesQ.data ?? [];
  const stayRequests = (requestsQ.data ?? []).filter((r) => r.stay_id === id);

  async function refresh() {
    await queryClient.invalidateQueries();
  }

  if (stayQ.isPending) {
    return (
      <AppShell title={t("stay")}>
        <p className="surface-card p-3 sm:p-4 text-sm text-muted-foreground">{t("loading")}</p>
      </AppShell>
    );
  }

  if (stayQ.isError || !stay) {
    return (
      <AppShell title={t("stay")}>
        <div className="surface-card space-y-3 p-3 sm:p-4">
          <p className="text-sm text-destructive">
            {stayQ.error ? (stayQ.error as Error).message : t("stayNotFound")}
          </p>
          <Button
            variant="outline"
            className="tap-target rounded-xl"
            onClick={() => navigate({ to: "/home" })}
          >
            {t("back")}
          </Button>
        </div>
      </AppShell>
    );
  }

  const totals = stayTotals(stay);
  const isPendingRequest = stay.confirmation_status === "pending";
  const isRejected = stay.confirmation_status === "rejected";

  async function decide(accept: boolean) {
    if (!online) {
      toast.error(t("offline"));
      return;
    }
    try {
      if (accept) await confirmReservation(id, user?.id);
      else await rejectReservation(id, user?.id);
      await refresh();
      toast.success(accept ? t("reservationConfirmed") : t("reservationRejected"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell title={roomLabel(stay.room)}>
      <section className="surface-card p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{stay.guest?.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {stay.guest?.phone ?? ""}{" "}
              {stay.guest?.nationality ? `· ${stay.guest.nationality}` : ""}
            </p>
            {guestId && customerQ.data ? (
              <Link
                to="/customers/$id"
                params={{ id: guestId }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold"
              >
                {customerStayCount > 1
                  ? `${t("returningCustomer")} · ${t("stayCount", { count: customerStayCount })}`
                  : t("newCustomer")}
              </Link>
            ) : null}
          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isPendingRequest
                ? "bg-warning/15 text-warning-foreground"
                : isRejected
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted"
            }`}
          >
            {isPendingRequest
              ? t("pending")
              : isRejected
                ? t("rejectedLabel")
                : statusLabel(stay.status)}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Info label={t("room")} value={`${roomLabel(stay.room)} · #${stay.room?.number ?? ""}`} />
          <Info
            label={`${t("arrival")} → ${t("departure")}`}
            value={`${shortDate(stay.check_in)} – ${shortDate(stay.check_out)} (${nights(
              stay.check_in,
              stay.check_out,
            )} ${t("nights")})`}
          />
          <Info label={t("guests")} value={String(stay.num_guests)} />
          <Info label={t("source")} value={sourceLabel(stay.source)} />
        </dl>
        {stay.notes ? (
          <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">{stay.notes}</p>
        ) : null}
        {can("reservations_manage") && stay.status === "active" && !isRejected ? (
          <Button
            variant="outline"
            className="tap-target mt-4 w-full rounded-xl"
            onClick={() => navigate({ to: "/stays/$id/edit", params: { id } })}
          >
            <Pencil className="me-2 size-4" />
            {t("editStay")}
          </Button>
        ) : null}
      </section>

      <section className="surface-card mt-4 p-3 sm:p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("bill")}
        </h2>
        <div className="mt-3 space-y-2 text-sm">
          <Line label={t("accommodation")} value={mad(stay.accommodation_total)} />
          {(chargesQ.data ?? []).map((c) => (
            <Line
              key={c.id}
              label={`${c.label}${Number(c.quantity) !== 1 ? ` ×${c.quantity}` : ""}`}
              value={mad(c.total)}
              sub={(c.notes ?? "").replace(/\[req:[^\]]+\]/g, "").trim()}
            />
          ))}
          <div className="!mt-3 border-t border-border pt-3">
            <Line label={t("total")} value={mad(totals.total)} strong />
            <Line label={t("paid")} value={mad(totals.paid)} />
            <Line
              label={t("outstanding")}
              value={mad(totals.outstanding)}
              strong
              tone={totals.outstanding > 0 ? "warn" : "ok"}
            />
          </div>
        </div>
      </section>

      <section className="surface-card mt-4 p-3 sm:p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("payment")}
        </h2>
        {(paymentsQ.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noResults")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {(paymentsQ.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>
                  {methodLabel(p.method)}
                  <span className="block text-xs text-muted-foreground">
                    {shortDateTime(p.created_at)}
                  </span>
                </span>
                <span className="font-semibold">{mad(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card mt-4 p-3 sm:p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("kitchenOrders")}
        </h2>
        {(foodOrdersQ.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noKitchenOrders")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {(foodOrdersQ.data ?? []).map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  {o.items.map((i) => `${i.quantity} × ${i.label}`).join(", ")}
                  <span className="block text-xs text-muted-foreground">
                    {shortDateTime(o.created_at)} ·{" "}
                    {o.origin === "staff" ? t("staffOriginTag") : t("guestOriginTag")}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                    {t(PREVIEW_STATUS_LABEL[o.status])}
                  </span>
                  <span className="mt-1 block font-semibold">{mad(o.subtotal)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card mt-4 p-3 sm:p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("navRequests")}
        </h2>
        {stayRequests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("noResults")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {stayRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>
                  {r.label}
                  {r.created_via === "guest_portal" ? (
                    <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {t("guestOriginTag")}
                    </span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {r.scheduled_at ? shortDateTime(r.scheduled_at) : "—"}
                  </span>
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                  {statusLabel(r.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {stay.status === "active" && stay.confirmation_status === "confirmed" ? (
        <section className="mt-4">
          <Button
            type="button"
            variant="outline"
            className="tap-target w-full justify-between rounded-xl"
            aria-expanded={guestAccessOpen}
            onClick={() => setGuestAccessOpen((open) => !open)}
          >
            <span className="flex items-center gap-2">
              <QrCode className="size-4" /> {t("guestAccess")}
            </span>
            <ChevronDown
              className={`size-4 transition-transform ${guestAccessOpen ? "rotate-180" : ""}`}
            />
          </Button>
          {guestAccessOpen ? <GuestAccessCard stayId={id} /> : null}
        </section>
      ) : null}

      {isPendingRequest ? (
        <section className="mt-4 space-y-3">
          <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
            {t("pendingNoOperations")}
          </p>
          {can("reservations_manage") ? (
            <div className="grid grid-cols-2 gap-3">
              <Button className="tap-target rounded-xl text-base" onClick={() => void decide(true)}>
                {t("accept")}
              </Button>
              <Button
                variant="outline"
                className="tap-target rounded-xl text-base"
                onClick={() => void decide(false)}
              >
                {t("reject")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : isRejected ? (
        <p className="mt-4 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          {t("rejectedLabel")}
        </p>
      ) : stay.status === "active" ? (
        <section className="mt-4 space-y-2">
          {can("payments_manage") ? (
            <Action
              icon={<Plus className="size-5" />}
              label={t("addCharge")}
              onClick={() => setSheet("charge")}
              primary
            />
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {can("payments_manage") ? (
              <Action
                icon={<CreditCard className="size-4" />}
                label={t("addPayment")}
                onClick={() => setSheet("payment")}
                compact
              />
            ) : null}
            {can("requests_manage") ? (
              <Action
                icon={<Bell className="size-4" />}
                label={t("addRequest")}
                onClick={() => setSheet("request")}
                compact
              />
            ) : null}
            <Action
              icon={<LogOut className="size-4" />}
              label={t("checkout")}
              onClick={() => setSheet("checkout")}
              compact
            />
          </div>
        </section>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          <BedDouble className="size-4" /> {t("checkoutDone")}
        </p>
      )}

      {/* ---- Add charge ---- */}
      <SheetDialog open={sheet === "charge"} onClose={() => setSheet(null)} title={t("addCharge")}>
        <ChargeForm
          services={services.filter((s) => s.billable)}
          onSubmit={async (values) => {
            if (!online) {
              toast.error(t("offline"));
              return;
            }
            try {
              await addCharge({ stayId: id, userId: user?.id, ...values });
              await refresh();
              setSheet(null);
              toast.success(t("chargeAdded"));
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </SheetDialog>

      {/* ---- Add payment ---- */}
      <SheetDialog
        open={sheet === "payment"}
        onClose={() => setSheet(null)}
        title={t("addPayment")}
      >
        <PaymentForm
          suggested={totals.outstanding}
          onSubmit={async (values) => {
            if (!online) {
              toast.error(t("offline"));
              return;
            }
            if (!user) {
              return;
            }
            try {
              await addPayment({ stayId: id, userId: user.id, ...values });
              await refresh();
              setSheet(null);
              toast.success(t("paymentRecorded"));
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </SheetDialog>

      {/* ---- Add request ---- */}
      <SheetDialog
        open={sheet === "request"}
        onClose={() => setSheet(null)}
        title={t("addRequest")}
      >
        <RequestForm
          services={services.filter(
            (s) => s.requestable && (!isMenuDish(s) || isOrderableKitchenDish(s)),
          )}
          onSubmit={async (values) => {
            if (!online) {
              toast.error(t("offline"));
              return;
            }
            try {
              const dish = services.find((s) => s.id === values.serviceTypeId);
              // A catalogue refresh may remove a selected dish; never treat it as custom.
              if (values.serviceTypeId && !dish) throw new Error(t("foodOrderInvalidItem"));
              if (isMenuDish(dish)) {
                await staffCreateFoodOrder({
                  stayId: id,
                  items: [
                    { service_type_id: values.serviceTypeId as string, quantity: values.quantity },
                  ],
                  notes: values.notes,
                  timing: values.timing,
                });
                await refresh();
                setSheet(null);
                toast.success(t("foodOrderCreated"));
                return;
              }
              await addRequest({
                stayId: id,
                roomId: stay.room_id,
                userId: user?.id,
                serviceTypeId: values.serviceTypeId,
                label: values.label,
                scheduledAt: values.scheduledAt,
                notes: values.notes,
              });
              await refresh();
              setSheet(null);
              toast.success(t("requestAdded"));
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </SheetDialog>

      {/* ---- Checkout ---- */}
      <SheetDialog
        open={sheet === "checkout"}
        onClose={() => setSheet(null)}
        title={t("checkoutSummary")}
      >
        <div className="space-y-3 text-sm">
          <Line label={t("total")} value={mad(totals.total)} strong />
          <Line label={t("paid")} value={mad(totals.paid)} />
          <Line
            label={t("outstanding")}
            value={mad(totals.outstanding)}
            strong
            tone={totals.outstanding > 0 ? "warn" : "ok"}
          />
          {totals.outstanding > 0 ? (
            <>
              <p className="rounded-xl bg-warning/20 p-3 font-medium text-foreground">
                {t("outstandingWarning")}
              </p>
              <Button className="tap-target w-full rounded-xl" onClick={() => setSheet("payment")}>
                {t("recordPayment")}
              </Button>
              {can("checkout_override") && !overrideConfirm ? (
                <Button
                  variant="outline"
                  className="tap-target w-full rounded-xl"
                  onClick={() => setOverrideConfirm(true)}
                >
                  {t("adminOverride")}
                </Button>
              ) : null}
              {can("checkout_override") && overrideConfirm ? (
                <div className="space-y-2 rounded-xl border border-destructive/40 p-3">
                  <p className="text-sm font-semibold">{t("overrideConfirmTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("overrideConfirmBody")}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="tap-target flex-1 rounded-xl"
                      onClick={() => setOverrideConfirm(false)}
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      className="tap-target flex-1 rounded-xl"
                      onClick={async () => {
                        if (!online) {
                          toast.error(t("offline"));
                          return;
                        }
                        try {
                          await checkoutStay({
                            stayId: id,
                            outstanding: totals.outstanding,
                            override: true,
                            userId: user?.id,
                          });
                          await refresh();
                          setOverrideConfirm(false);
                          setSheet(null);
                          toast.success(t("checkoutDone"));
                          navigate({ to: "/home" });
                        } catch (e) {
                          toast.error((e as Error).message);
                          await refresh();
                        }
                      }}
                    >
                      {t("confirm")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <Button
              className="tap-target w-full rounded-xl"
              onClick={async () => {
                if (!online) {
                  toast.error(t("offline"));
                  return;
                }
                try {
                  await checkoutStay({
                    stayId: id,
                    outstanding: 0,
                    override: false,
                    userId: user?.id,
                  });
                  await refresh();
                  setSheet(null);
                  toast.success(t("checkoutDone"));
                  navigate({ to: "/home" });
                } catch (e) {
                  toast.error((e as Error).message);
                  await refresh();
                }
              }}
            >
              {t("confirmCheckout")}
            </Button>
          )}
        </div>
      </SheetDialog>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function Line({
  label,
  value,
  sub,
  strong,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  strong?: boolean;
  tone?: "warn" | "ok";
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className={strong ? "font-semibold" : ""}>
        {label}
        {sub ? <span className="block text-xs text-muted-foreground">{sub}</span> : null}
      </span>
      <span
        className={[
          strong ? "font-semibold" : "",
          tone === "warn" ? "text-destructive" : tone === "ok" ? "text-primary" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function Action({
  icon,
  label,
  onClick,
  primary,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        compact
          ? "flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold active:scale-[0.99] sm:text-sm"
          : "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold active:scale-[0.99] sm:min-h-14 sm:text-base",
        primary
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

export function SheetDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

type ServiceLike = {
  id: string;
  key?: string | null;
  label: string;
  default_price: number;
  billable: boolean;
  requestable: boolean;
  guest_category?: string | null;
  guest_subcategory?: string | null;
  guest_visible?: boolean | null;
  available_today?: boolean | null;
  preview_only?: boolean | null;
};

/** Real menu dishes go through the shared kitchen order flow, not plain requests. */
function isMenuDish(s: ServiceLike | undefined): boolean {
  return isKitchenMenuDish(s);
}

function ChargeForm({
  services,
  onSubmit,
}: {
  services: ServiceLike[];
  onSubmit: (v: {
    serviceTypeId: string | null;
    label: string;
    quantity: number;
    unitPrice: number;
    notes: string;
  }) => Promise<unknown>;
}) {
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [customLabel, setCustomLabel] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(String(services[0]?.default_price ?? 0));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = services.find((s) => s.id === serviceId);
  const totalValue = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit({
          serviceTypeId: serviceId || null,
          label: (selected?.label ?? customLabel).trim() || "Other",
          quantity: Number(quantity) || 1,
          unitPrice: Number(unitPrice) || 0,
          notes,
        });
        setBusy(false);
      }}
    >
      <div className="space-y-2">
        <Label>{t("service")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {services.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => {
                setServiceId(s.id);
                setUnitPrice(String(s.default_price));
              }}
              className={`rounded-xl border px-2 py-3 text-sm font-semibold ${
                serviceId === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              {serviceLabel(s)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setServiceId("")}
            className={`rounded-xl border px-2 py-3 text-sm font-semibold ${
              serviceId === ""
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card"
            }`}
          >
            {t("custom")}
          </button>
        </div>
      </div>

      {serviceId === "" ? (
        <div className="space-y-2">
          <Label>{t("service")}</Label>
          <Input
            className="tap-target text-base"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            required
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t("quantity")}</Label>
          <Input
            type="number"
            min={1}
            className="tap-target text-base"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("unitPrice")}</Label>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            className="tap-target text-base"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{`${t("notes")} (${t("optional")})`}</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <DialogFooter className="sm:justify-between">
        <p className="text-sm font-semibold">
          {t("chargeTotal")}: {mad(totalValue)}
        </p>
        <Button type="submit" disabled={busy} className="tap-target rounded-xl">
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PaymentForm({
  suggested,
  onSubmit,
}: {
  suggested: number;
  onSubmit: (v: {
    amount: number;
    method: "cash" | "card" | "bank_transfer";
    notes: string;
  }) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : "");
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer">("cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOver, setConfirmOver] = useState(false);
  const value = Number(amount);
  const overpaying = Number.isFinite(value) && value > suggested + 0.005;

  async function send() {
    setBusy(true);
    await onSubmit({ amount: value, method, notes });
    setBusy(false);
    setConfirmOver(false);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!Number.isFinite(value) || value <= 0) {
          toast.error(t("amountPositive"));
          return;
        }
        if (overpaying && !confirmOver) {
          setConfirmOver(true);
          return;
        }
        await send();
      }}
    >
      <div className="space-y-2">
        <Label>{t("amount")}</Label>
        <Input
          type="number"
          inputMode="decimal"
          min={0.01}
          step="0.01"
          className="tap-target text-base"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>{t("method")}</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["cash", "card", "bank_transfer"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-xl border px-2 py-3 text-xs font-semibold ${
                method === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>
        {method === "cash" ? (
          <p className="text-xs text-muted-foreground">{t("cashInSafe")}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>{`${t("notes")} (${t("optional")})`}</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {confirmOver ? (
        <div className="space-y-1 rounded-xl border border-destructive/40 p-3">
          <p className="text-sm font-semibold">{t("overpaymentTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("overpaymentBody")} ({t("outstanding")}: {mad(suggested)})
          </p>
        </div>
      ) : null}
      <Button type="submit" disabled={busy} className="tap-target w-full rounded-xl text-base">
        {confirmOver ? t("confirm") : t("save")}
      </Button>
    </form>
  );
}

function RequestForm({
  services,
  onSubmit,
}: {
  services: ServiceLike[];
  onSubmit: (v: {
    serviceTypeId: string | null;
    label: string;
    quantity: number;
    timing: PreviewTiming;
    scheduledAt: string | null;
    notes: string;
  }) => Promise<unknown>;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [customLabel, setCustomLabel] = useState("");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState("1");
  const [timing, setTiming] = useState<PreviewTiming>("asap");
  const [busy, setBusy] = useState(false);
  const selected = services.find((s) => s.id === serviceId);
  const dish = isMenuDish(selected);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit({
          serviceTypeId: serviceId || null,
          label: (selected?.label ?? customLabel).trim() || "Request",
          quantity: Math.min(20, Math.max(1, Number(qty) || 1)),
          timing,
          scheduledAt: businessLocalToISO(when),
          notes,
        });
        setBusy(false);
      }}
    >
      <div className="space-y-2">
        <Label>{t("requestType")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {services.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setServiceId(s.id)}
              className={`rounded-xl border px-2 py-3 text-sm font-semibold ${
                serviceId === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              {serviceLabel(s)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setServiceId("")}
            className={`rounded-xl border px-2 py-3 text-sm font-semibold ${
              serviceId === ""
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card"
            }`}
          >
            {t("custom")}
          </button>
        </div>
      </div>
      {serviceId === "" ? (
        <div className="space-y-2">
          <Label>{t("requestType")}</Label>
          <Input
            className="tap-target text-base"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            required
          />
        </div>
      ) : null}
      {dish ? (
        <div className="space-y-2">
          <Label>{t("quantity")}</Label>
          <Input
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            className="tap-target text-base"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <Label>{t("requestedTiming")}</Label>
          <div className="grid grid-cols-4 gap-2">
            {PREVIEW_TIMINGS.map((option) => (
              <button
                type="button"
                key={option}
                onClick={() => setTiming(option)}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
                  timing === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {t(PREVIEW_TIMING_LABEL[option])}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("foodOrderBillsOnDelivery")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>{t("when")}</Label>
          <Input
            type="datetime-local"
            className="tap-target text-base"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label>{`${t("notes")} (${t("optional")})`}</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy} className="tap-target w-full rounded-xl text-base">
        {t("save")}
      </Button>
    </form>
  );
}
