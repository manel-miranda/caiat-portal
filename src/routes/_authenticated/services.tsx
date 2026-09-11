import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useOnline } from "@/components/OfflineBanner";
import { mad, roomLabel } from "@/lib/format";
import { t } from "@/lib/i18n";
import { activeStaysQuery, serviceTypesQuery, type ServiceType } from "@/lib/queries";
import { addCharge, addRequest } from "@/lib/mutations";

export const Route = createFileRoute("/_authenticated/services")({
  head: () => ({
    meta: [
      { title: "Services & activities — Caiat Operations" },
      {
        name: "description",
        content:
          "Caiat guesthouse service catalogue: meals, transfers, guided treks, climbing, yoga and named Rif routes with default prices in MAD.",
      },
      { property: "og:title", content: "Services & activities — Caiat Operations" },
      {
        property: "og:description",
        content: "Internal catalogue of Caiat meals, transport, outdoor activities and route experiences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicesPage,
});

const GROUPS: { key: string; label: string }[] = [
  { key: "food", label: t("catFood") },
  { key: "transport", label: t("catTransport") },
  { key: "visit", label: t("catVisit") },
  { key: "outdoor", label: t("catOutdoor") },
  { key: "route", label: t("catRoute") },
  { key: "other", label: t("catOther") },
];

function ServicesPage() {
  const { user } = useAuth();
  const online = useOnline();
  const queryClient = useQueryClient();
  const services = useQuery(serviceTypesQuery);
  const stays = useQuery(activeStaysQuery);
  const [stayId, setStayId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const stayOptions = stays.data ?? [];
  const items = services.data ?? [];

  async function quickCharge(svc: ServiceType) {
    if (!online) { toast.error(t("offline")); return; }
    if (!stayId) return;
    setBusy(svc.id);
    try {
      await addCharge({
        stayId,
        serviceTypeId: svc.id,
        label: svc.label,
        quantity: 1,
        unitPrice: Number(svc.default_price),
        userId: user?.id,
      });
      await queryClient.invalidateQueries();
      toast.success(`${svc.label} · ${mad(svc.default_price)}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(null);
  }

  async function quickRequest(svc: ServiceType) {
    if (!online) { toast.error(t("offline")); return; }
    if (!stayId) return;
    const stay = stayOptions.find((s) => s.id === stayId);
    setBusy(svc.id);
    try {
      await addRequest({
        stayId,
        roomId: stay?.room_id ?? null,
        serviceTypeId: svc.id,
        label: svc.label,
        scheduledAt: null,
        userId: user?.id,
      });
      await queryClient.invalidateQueries();
      toast.success(`${t("request")}: ${svc.label}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(null);
  }

  if (services.isError) {
    return (
      <AppShell title={t("servicesTitle")}>
        <p className="surface-card p-4 text-sm text-muted-foreground">
          {(services.error as Error).message}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("servicesTitle")}>
      <p className="text-sm text-muted-foreground">{t("servicesIntro")}</p>

      <div className="surface-card mt-4 space-y-2 p-4">
        <Label className="text-sm">{t("stay")}</Label>
        <select
          value={stayId}
          onChange={(e) => setStayId(e.target.value)}
          className="tap-target w-full rounded-xl border border-border bg-card px-3 text-base"
        >
          <option value="">{`— ${t("optional")} —`}</option>
          {stayOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {`${roomLabel(s.room)} · ${s.guest?.full_name ?? ""}`}
            </option>
          ))}
        </select>
      </div>

      {services.isLoading ? (
        <p className="surface-card mt-4 p-4 text-sm text-muted-foreground">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="surface-card mt-4 p-4 text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <>
        {(() => {
          const facilities = items
            .filter((s) => s.category === "included")
            .sort((a, b) => a.sort_order - b.sort_order);
          if (facilities.length === 0) return null;
          return (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("catIncluded")}
              </h2>
              <div className="surface-card p-4">
                <ul className="flex flex-wrap gap-2">
                  {facilities.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground"
                    >
                      {s.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">{t("includedNote")}</p>
              </div>
            </section>
          );
        })()}
        {GROUPS.map((g) => {
          const group = items
            .filter((s) => (s.category ?? "other") === g.key)
            .sort((a, b) => a.sort_order - b.sort_order);
          if (group.length === 0) return null;
          return (
            <section key={g.key} className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </h2>
              <ul className="surface-card divide-y divide-border">
                {group.map((s) => (
                  <li key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{s.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {s.default_price > 0 ? mad(s.default_price) : "—"} ·{" "}
                          {s.requestable ? t("requestable") : t("billableOnly")}
                        </p>
                        {s.activity_mode || s.difficulty ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[s.activity_mode, s.difficulty].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      {stayId ? (
                        <div className="flex shrink-0 gap-2">
                          {s.requestable ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              disabled={busy === s.id}
                              onClick={() => void quickRequest(s)}
                            >
                              {t("addRequest")}
                            </Button>
                          ) : null}
                          {s.billable ? (
                            <Button
                              size="sm"
                              className="rounded-xl"
                              disabled={busy === s.id}
                              onClick={() => void quickCharge(s)}
                            >
                              {t("addCharge")}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        </>
      )}
    </AppShell>
  );
}
