/**
 * Stock & groceries screen for signed-in staff (available on every host).
 *
 * Every write goes through a permission-checked RPC; nothing here creates
 * charges or payments. Seeded demo ingredients stay visible with their Demo
 * label so the owner can try the flow safely.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { shortDateTime } from "@/lib/format";
import {
  adjustStock,
  inventoryErrorKey,
  inventoryMovementsQuery,
  inventoryStatusQuery,
  qty,
  receiveStock,
  recordWaste,
  statusRank,
  type InventoryStatusRow,
  type MovementType,
  type StockStatus,
} from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/stock")({
  head: () => ({
    meta: [
      { title: "Stock & groceries — Caiat Operations" },
      {
        name: "description",
        content:
          "Estimated ingredient stock, usage forecast and shopping recommendations for the Caiat guesthouse.",
      },
      { property: "og:title", content: "Stock & groceries — Caiat Operations" },
      {
        property: "og:description",
        content: "Track estimated stock, record purchases and see what to buy next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockPage,
});

type Action = { row: InventoryStatusRow; kind: "receive" | "adjust" | "waste" | "history" };

const MOVEMENT_LABEL: Record<MovementType, string> = {
  receipt: "stockMovementReceipt",
  consumption: "stockMovementConsumption",
  adjustment: "stockMovementAdjustment",
  waste: "stockMovementWaste",
};

function StockPage() {
  const { can } = useAuth();
  const canWrite = can("requests_manage");
  const queryClient = useQueryClient();
  const status = useQuery(inventoryStatusQuery);
  const [tab, setTab] = useState<"stock" | "shopping">("stock");
  const [filter, setFilter] = useState<"all" | StockStatus>("all");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<Action | null>(null);

  const rows = useMemo(() => {
    const list = (status.data ?? []).filter((r) => r.active);
    return [...list].sort(
      (a, b) => statusRank(a.status) - statusRank(b.status) || a.label.localeCompare(b.label),
    );
  }, [status.data]);

  const counts = {
    buy: rows.filter((r) => r.status === "buy").length,
    low: rows.filter((r) => r.status === "low").length,
    good: rows.filter((r) => r.status === "good").length,
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = tab === "shopping" ? rows.filter((r) => r.status !== "good") : rows;
    return base.filter((r) => {
      if (tab === "stock" && filter !== "all" && r.status !== filter) return false;
      return !term || r.label.toLowerCase().includes(term) || r.key.includes(term);
    });
  }, [rows, tab, filter, search]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["inventory"] });
  }

  return (
    <AppShell title={t("stockTitle")}>
      <p className="text-sm text-muted-foreground">{t("stockIntro")}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Counter label={t("stockStatusBuy")} value={counts.buy} tone="destructive" />
        <Counter label={t("stockStatusLow")} value={counts.low} tone="warning" />
        <Counter label={t("stockStatusGood")} value={counts.good} tone="muted" />
      </div>

      <div className="mt-3 flex gap-2">
        <TabButton active={tab === "stock"} onClick={() => setTab("stock")}>
          {t("stockItems")}
        </TabButton>
        <TabButton active={tab === "shopping"} onClick={() => setTab("shopping")}>
          {t("stockShoppingList")}
        </TabButton>
      </div>

      <div className="surface-card mt-3 space-y-2 p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("stockSearch")}
          aria-label={t("stockSearch")}
        />
        {tab === "stock" ? (
          <div className="flex flex-wrap gap-2">
            {(["all", "buy", "low", "good"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
                  filter === f
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {f === "all"
                  ? t("filterAll")
                  : f === "buy"
                    ? t("stockStatusBuy")
                    : f === "low"
                      ? t("stockStatusLow")
                      : t("stockStatusGood")}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {status.isLoading ? (
        <p className="surface-card mt-3 p-3 text-sm text-muted-foreground">{t("loading")}</p>
      ) : visible.length === 0 ? (
        <p className="surface-card mt-3 p-3 text-sm text-muted-foreground">
          {tab === "shopping" ? t("stockShoppingEmpty") : t("noResults")}
        </p>
      ) : (
        <ul className="surface-card mt-3 divide-y divide-border">
          {visible.map((row) => (
            <li key={row.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {row.label}
                    {row.preview_only ? (
                      <span className="ms-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-400">
                        {t("stockDemoBadge")}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("stockEstimated")}: {qty(row.estimated_stock)} {row.unit} ·{" "}
                    {row.days_remaining != null
                      ? `~${qty(row.days_remaining)} ${t("stockDaysLeft")}`
                      : t("stockNoHistory")}
                  </p>
                  {row.recommended_quantity > 0 ? (
                    <p className="mt-0.5 text-xs font-medium text-foreground">
                      {t("stockRecommended")} {qty(row.recommended_quantity)} {row.unit}
                      <span className="ms-1 font-normal text-muted-foreground">
                        (
                        {row.estimated_stock <= row.safety_stock
                          ? t("stockReasonBelowSafety")
                          : t("stockReasonDaysLeft")}
                        )
                      </span>
                    </p>
                  ) : null}
                </div>
                <StatusPill status={row.status} />
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {canWrite ? (
                  <>
                    <Button
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setAction({ row, kind: "receive" })}
                    >
                      {t("stockReceive")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => setAction({ row, kind: "adjust" })}
                    >
                      {t("stockAdjust")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => setAction({ row, kind: "waste" })}
                    >
                      {t("stockWaste")}
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => setAction({ row, kind: "history" })}
                >
                  {t("stockHistory")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={Boolean(action)} onOpenChange={(open) => !open && setAction(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          {action ? (
            <>
              <SheetHeader className="text-start">
                <SheetTitle className="text-base">
                  {action.kind === "receive"
                    ? t("stockReceive")
                    : action.kind === "adjust"
                      ? t("stockAdjust")
                      : action.kind === "waste"
                        ? t("stockWaste")
                        : t("stockHistory")}{" "}
                  · {action.row.label}
                </SheetTitle>
              </SheetHeader>
              {action.kind === "history" ? (
                <HistoryList itemId={action.row.id} unit={action.row.unit} />
              ) : (
                <MovementForm
                  action={action}
                  onDone={async () => {
                    setAction(null);
                    await refresh();
                  }}
                />
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function MovementForm({ action, onDone }: { action: Action; onDone: () => Promise<void> }) {
  const [value, setValue] = useState(
    action.kind === "adjust" ? qty(action.row.estimated_stock) : "",
  );
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amount = Number(value);
    if (!Number.isFinite(amount) || (action.kind !== "adjust" && amount <= 0) || amount < 0) {
      toast.error(t("stockQuantityInvalid"));
      return;
    }
    setBusy(true);
    try {
      if (action.kind === "receive") {
        // A total cost is friendlier to type than a unit cost, so derive it.
        const total = Number(cost);
        const unitCost = Number.isFinite(total) && total > 0 ? total / amount : null;
        await receiveStock(action.row.id, amount, unitCost, note);
      } else if (action.kind === "adjust") {
        await adjustStock(action.row.id, amount, note);
      } else {
        await recordWaste(action.row.id, amount, note);
      }
      toast.success(t("stockSaved"));
      await onDone();
    } catch (e) {
      const key = inventoryErrorKey((e as Error).message);
      toast.error(key ? t(key as never) : (e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="mt-2 grid gap-3 pb-6">
      {action.kind === "adjust" ? (
        <p className="text-xs text-muted-foreground">
          {t("stockEstimated")}: {qty(action.row.estimated_stock)} {action.row.unit}
        </p>
      ) : null}
      <div className="grid gap-1">
        <Label className="text-sm">
          {action.kind === "adjust" ? t("stockActual") : t("stockQuantity")} ({action.row.unit})
        </Label>
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      {action.kind === "receive" ? (
        <div className="grid gap-1">
          <Label className="text-sm">{t("stockUnitCost")}</Label>
          <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      ) : null}
      <div className="grid gap-1">
        <Label className="text-sm">{t("stockNote")}</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button className="w-full rounded-xl" disabled={busy} onClick={() => void submit()}>
        {t("save")}
      </Button>
    </div>
  );
}

function HistoryList({ itemId, unit }: { itemId: string; unit: string }) {
  const movements = useQuery(inventoryMovementsQuery(itemId));
  const list = movements.data ?? [];
  if (movements.isLoading) {
    return <p className="py-4 text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (list.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{t("noResults")}</p>;
  }
  return (
    <ul className="mt-2 divide-y divide-border pb-6">
      {list.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {t(MOVEMENT_LABEL[m.movement_type] as never)}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {shortDateTime(m.created_at)}
              {m.source_type === "preview_food_order" ? ` · ${t("stockSourceOrder")}` : ""}
              {m.notes ? ` · ${m.notes}` : ""}
            </span>
          </span>
          <span
            className={`shrink-0 text-sm font-semibold ${
              m.quantity < 0 ? "text-destructive" : "text-foreground"
            }`}
          >
            {m.quantity > 0 ? "+" : ""}
            {qty(m.quantity)} {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "destructive" | "warning" | "muted";
}) {
  const color =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <div className="surface-card p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: StockStatus }) {
  const map: Record<StockStatus, string> = {
    buy: "bg-destructive/10 text-destructive",
    low: "bg-warning/15 text-warning",
    good: "bg-muted text-muted-foreground",
  };
  const label =
    status === "buy" ? t("stockStatusBuy") : status === "low" ? t("stockStatusLow") : t("stockStatusGood");
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status]}`}>
      {label}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
