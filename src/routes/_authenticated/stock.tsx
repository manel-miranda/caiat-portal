/**
 * Stock & groceries screen for signed-in staff (available on every host).
 *
 * Every write goes through a permission-checked RPC; nothing here creates
 * charges or payments. Seeded demo ingredients stay visible with their Demo
 * label so the owner can try the flow safely.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { StockSimulationPanel } from "@/components/StockSimulationPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { mad, shortDate, shortDateTime, todayISO } from "@/lib/format";
import {
  adjustStock,
  inventoryErrorKey,
  inventoryMovementsQuery,
  inventoryStatusQuery,
  newPurchaseId,
  purchaseContextQuery,
  purchaseLinesQuery,
  purchasesQuery,
  qty,
  recordPurchase,
  recordWaste,
  saveSupplier,
  setSupplierActive,
  statusRank,
  suppliersQuery,
  type InventoryStatusRow,
  type MovementType,
  type Purchase,
  type PurchaseContext,
  type StockStatus,
  type Supplier,
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

type Action = { row: InventoryStatusRow; kind: "adjust" | "waste" | "history" };

const MOVEMENT_LABEL: Record<MovementType, string> = {
  receipt: "stockMovementReceipt",
  consumption: "stockMovementConsumption",
  adjustment: "stockMovementAdjustment",
  waste: "stockMovementWaste",
};

function StockPage() {
  const { can, isAdmin } = useAuth();
  const canWrite = can("requests_manage");
  const queryClient = useQueryClient();
  const status = useQuery(inventoryStatusQuery);
  const context = useQuery(purchaseContextQuery);
  const [tab, setTab] = useState<"stock" | "shopping" | "purchases" | "simulation">("stock");
  const [filter, setFilter] = useState<"all" | StockStatus>("all");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [purchase, setPurchase] = useState<DraftLine[] | null>(null);

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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["finance"] }),
    ]);
  }

  return (
    <AppShell title={t("stockTitle")}>
      <p className="text-sm text-muted-foreground">{t("stockIntro")}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Counter label={t("stockStatusBuy")} value={counts.buy} tone="destructive" />
        <Counter label={t("stockStatusLow")} value={counts.low} tone="warning" />
        <Counter label={t("stockStatusGood")} value={counts.good} tone="muted" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <TabButton active={tab === "stock"} onClick={() => setTab("stock")}>
          {t("stockItems")}
        </TabButton>
        <TabButton active={tab === "shopping"} onClick={() => setTab("shopping")}>
          {t("stockShoppingList")}
        </TabButton>
        <TabButton active={tab === "purchases"} onClick={() => setTab("purchases")}>
          {t("stockPurchases")}
        </TabButton>
        {isAdmin ? (
          <TabButton active={tab === "simulation"} onClick={() => setTab("simulation")}>
            {t("simTab")}
          </TabButton>
        ) : null}
      </div>

      {tab === "simulation" && isAdmin ? (
        <StockSimulationPanel onChanged={refresh} />
      ) : tab === "purchases" ? (
        <PurchasesTab
          canWrite={canWrite}
          items={rows}
          onRecord={() => setPurchase([])}
          onChanged={refresh}
        />
      ) : (
        <>
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

                  {tab === "shopping" ? (
                    <ShoppingHint
                      row={row}
                      context={(context.data ?? []).find((c) => c.inventory_item_id === row.id)}
                    />
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-2">
                    {canWrite ? (
                      <>
                        <Button
                          size="sm"
                          className="rounded-xl"
                          onClick={() => setPurchase([{ itemId: row.id, quantity: "", cost: "" }])}
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

          {tab === "shopping" && canWrite && visible.length > 0 ? (
            <Button
              className="mt-3 w-full rounded-xl"
              onClick={() =>
                setPurchase(
                  visible
                    .filter((r) => r.recommended_quantity > 0)
                    .map((r) => ({
                      itemId: r.id,
                      quantity: qty(r.recommended_quantity),
                      cost: "",
                    })),
                )
              }
            >
              {t("purchasePrefill")}
            </Button>
          ) : null}
        </>
      )}

      <Sheet open={Boolean(action)} onOpenChange={(open) => !open && setAction(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          {action ? (
            <>
              <SheetHeader className="text-start">
                <SheetTitle className="text-base">
                  {action.kind === "adjust"
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

      <Sheet open={purchase !== null} onOpenChange={(open) => !open && setPurchase(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-start">
            <SheetTitle className="text-base">{t("purchaseNew")}</SheetTitle>
          </SheetHeader>
          {purchase !== null ? (
            <PurchaseForm
              items={rows}
              initialLines={purchase}
              context={context.data ?? []}
              onDone={async () => {
                setPurchase(null);
                await refresh();
              }}
            />
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
      if (action.kind === "adjust") {
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
              {m.source_type === "purchase" ? ` · ${t("stockSourcePurchase")}` : ""}
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
    status === "buy"
      ? t("stockStatusBuy")
      : status === "low"
        ? t("stockStatusLow")
        : t("stockStatusGood");
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

/* ---------------- purchases & suppliers ---------------- */

type DraftLine = { itemId: string; quantity: string; cost: string; costDerived?: boolean };

/** Small, non-binding buying hint on the shopping list. */
function ShoppingHint({
  row,
  context,
}: {
  row: InventoryStatusRow;
  context: PurchaseContext | undefined;
}) {
  if (!context) return null;
  const estimate =
    context.last_unit_cost != null && row.recommended_quantity > 0
      ? context.last_unit_cost * row.recommended_quantity
      : null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {context.last_supplier_name
        ? `${t("purchaseLastBoughtAt")} ${context.last_supplier_name}`
        : t("purchaseLastBought")}{" "}
      · {shortDate(context.last_purchased_at)}
      {context.last_unit_cost != null ? ` · ${mad(context.last_unit_cost)}/${row.unit}` : ""}
      {estimate != null ? ` · ${t("purchaseEstimatedCost")} ~${mad(estimate)}` : ""}
    </p>
  );
}

function PurchasesTab({
  canWrite,
  items,
  onRecord,
  onChanged,
}: {
  canWrite: boolean;
  items: InventoryStatusRow[];
  onRecord: () => void;
  onChanged: () => Promise<void>;
}) {
  const purchases = useQuery(purchasesQuery);
  const [open, setOpen] = useState<Purchase | null>(null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const list = [...(purchases.data ?? [])]
    .filter(
      (purchase) =>
        !normalizedSearch ||
        [purchase.supplier_name, purchase.notes]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch)),
    )
    .sort(
      (a, b) =>
        new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime() ||
        (a.supplier_name ?? "").localeCompare(b.supplier_name ?? ""),
    );

  return (
    <div className="mt-3 space-y-3">
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1 rounded-xl" onClick={onRecord}>
            {t("purchaseNew")}
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={() => setSuppliersOpen(true)}>
            {t("stockSuppliers")}
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("purchaseHint")}</p>
      {(purchases.data ?? []).length > 4 ? (
        <Input
          value={search}
          placeholder={t("purchaseSearch")}
          aria-label={t("purchaseSearch")}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}

      {purchases.isLoading ? (
        <p className="surface-card p-3 text-sm text-muted-foreground">{t("loading")}</p>
      ) : list.length === 0 ? (
        <p className="surface-card p-3 text-sm text-muted-foreground">{t("purchaseEmpty")}</p>
      ) : (
        <ul className="surface-card divide-y divide-border">
          {list.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setOpen(p)}
                className="flex w-full items-center justify-between gap-3 p-3 text-start"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {p.supplier_name ?? t("purchaseNoSupplier")}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {shortDateTime(p.purchased_at)} · {p.line_count} {t("purchaseItemsCount")}
                  </span>
                  {p.notes ? (
                    <span className="block truncate text-xs text-muted-foreground">{p.notes}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-semibold">{mad(p.total_cost)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-start">
            <SheetTitle className="text-base">{t("purchaseDetails")}</SheetTitle>
          </SheetHeader>
          {open ? <PurchaseDetails purchase={open} items={items} /> : null}
        </SheetContent>
      </Sheet>

      <Sheet open={suppliersOpen} onOpenChange={setSuppliersOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-start">
            <SheetTitle className="text-base">{t("stockSuppliers")}</SheetTitle>
          </SheetHeader>
          <SuppliersTab canWrite={canWrite} onChanged={onChanged} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PurchaseDetails({ purchase, items }: { purchase: Purchase; items: InventoryStatusRow[] }) {
  const lines = useQuery(purchaseLinesQuery(purchase.id));
  const label = (id: string) => items.find((i) => i.id === id)?.label ?? id;
  const unit = (id: string) => items.find((i) => i.id === id)?.unit ?? "";
  return (
    <div className="mt-2 space-y-2 pb-6">
      <p className="text-sm text-muted-foreground">
        {shortDateTime(purchase.purchased_at)} · {purchase.supplier_name ?? t("purchaseNoSupplier")}
      </p>
      {purchase.notes ? <p className="text-sm">{purchase.notes}</p> : null}
      {lines.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {(lines.data ?? []).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                {label(l.inventory_item_id)} · {qty(l.quantity)} {unit(l.inventory_item_id)}
                {l.unit_cost != null ? (
                  <span className="text-muted-foreground"> · {mad(l.unit_cost)}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-medium">{mad(l.line_total)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
        <span>{t("purchaseTotal")}</span>
        <span>{mad(purchase.total_cost)}</span>
      </p>
    </div>
  );
}

function PurchaseForm({
  items,
  initialLines,
  context,
  onDone,
}: {
  items: InventoryStatusRow[];
  initialLines: DraftLine[];
  context: PurchaseContext[];
  onDone: () => Promise<void>;
}) {
  const suppliers = useQuery(suppliersQuery);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(
    initialLines.length > 0 ? initialLines : [{ itemId: "", quantity: "", cost: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [initialised, setInitialised] = useState(false);
  // Stable across retries: the server records this purchase at most once.
  const [purchaseId, setPurchaseId] = useState(() => newPurchaseId());

  const activeSuppliers = (suppliers.data ?? [])
    .filter((supplier) => supplier.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  const total = lines.reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
  const chosen = lines.map((l) => l.itemId).filter(Boolean);

  function derivedCost(line: DraftLine, hint: PurchaseContext | undefined) {
    const quantity = Number(line.quantity);
    return hint?.last_unit_cost != null && Number.isFinite(quantity) && quantity > 0
      ? (quantity * hint.last_unit_cost).toFixed(2)
      : "";
  }

  useEffect(() => {
    if (initialised || !suppliers.data) return;

    const firstPreviousSupplier = initialLines
      .map(
        (line) => context.find((item) => item.inventory_item_id === line.itemId)?.last_supplier_id,
      )
      .find((supplierId) => activeSuppliers.some((supplier) => supplier.id === supplierId));
    if (firstPreviousSupplier) setSupplierId(firstPreviousSupplier);

    setLines((currentLines) =>
      currentLines.map((line) => {
        const cost = derivedCost(
          line,
          context.find((item) => item.inventory_item_id === line.itemId),
        );
        return cost && !line.cost ? { ...line, cost, costDerived: true } : line;
      }),
    );
    setInitialised(true);
  }, [activeSuppliers, context, initialLines, initialised, suppliers.data]);

  function update(index: number, patch: Partial<DraftLine>) {
    const current = lines[index];
    if (!current) return;
    const next = { ...current, ...patch };
    const hint = context.find((item) => item.inventory_item_id === next.itemId);

    if (patch.itemId && !supplierId && hint?.last_supplier_id) {
      const previousSupplier = activeSuppliers.find(
        (supplier) => supplier.id === hint.last_supplier_id,
      );
      if (previousSupplier) setSupplierId(previousSupplier.id);
    }

    if ((patch.quantity || patch.itemId) && (!current.cost || current.costDerived)) {
      const cost = derivedCost(next, hint);
      next.cost = cost;
      next.costDerived = Boolean(cost);
    }
    if (patch.cost !== undefined) {
      next.costDerived = false;
    }

    setLines((prev) => prev.map((line, i) => (i === index ? next : line)));
  }

  async function addSupplier() {
    const name = (newSupplier ?? "").trim();
    if (!name) {
      toast.error(t("supplierNameRequired"));
      return;
    }
    try {
      const id = await saveSupplier({
        id: null,
        name,
        phone: "",
        location: "",
        notes: "",
        active: true,
      });
      await suppliers.refetch();
      setSupplierId(id);
      setNewSupplier(null);
      toast.success(t("supplierSaved"));
    } catch (e) {
      const key = inventoryErrorKey((e as Error).message);
      toast.error(key ? t(key as never) : (e as Error).message);
    }
  }

  async function submit() {
    const payload = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0)
      .map((l) => {
        const quantity = Number(l.quantity);
        const lineTotal = Math.max(Number(l.cost) || 0, 0);
        // The user types the total they paid; the ledger stores unit cost.
        return {
          inventory_item_id: l.itemId,
          quantity,
          unit_cost: quantity > 0 ? lineTotal / quantity : 0,
        };
      });
    if (payload.length === 0) {
      toast.error(t("purchaseLinesRequired"));
      return;
    }
    if (new Set(payload.map((l) => l.inventory_item_id)).size !== payload.length) {
      toast.error(t("purchaseDuplicateItem"));
      return;
    }
    setBusy(true);
    try {
      await recordPurchase({
        purchaseId,
        supplierId: supplierId || null,
        purchasedAt: new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`).toISOString(),
        notes,
        lines: payload,
      });
      toast.success(t("purchaseSaved"));
      setPurchaseId(newPurchaseId());
      await onDone();
    } catch (e) {
      const key = inventoryErrorKey((e as Error).message);
      toast.error(key ? t(key as never) : (e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="mt-2 grid gap-3 pb-6">
      <div className="grid gap-1">
        <Label className="text-sm">{t("purchaseSupplier")}</Label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">{t("purchaseNoSupplier")}</option>
          {activeSuppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {newSupplier === null ? (
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start rounded-xl"
            onClick={() => setNewSupplier("")}
          >
            {t("supplierNew")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Input
              value={newSupplier}
              placeholder={t("supplierName")}
              aria-label={t("supplierName")}
              onChange={(e) => setNewSupplier(e.target.value)}
            />
            <Button size="sm" className="rounded-xl" onClick={() => void addSupplier()}>
              {t("save")}
            </Button>
          </div>
        )}
      </div>
      <div className="grid gap-1">
        <Label className="text-sm">{t("purchaseDate")}</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <Label className="text-sm">{t("purchaseLinesLabel")}</Label>
      {lines.map((line, index) => {
        const hint = context.find((c) => c.inventory_item_id === line.itemId);
        return (
          <div key={index} className="grid gap-2 rounded-xl border border-border p-2">
            <select
              value={line.itemId}
              onChange={(e) => update(index, { itemId: e.target.value })}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">—</option>
              {items
                .filter((i) => i.id === line.itemId || !chosen.includes(i.id))
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label} ({i.unit})
                  </option>
                ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                inputMode="decimal"
                placeholder={t("stockQuantity")}
                aria-label={t("stockQuantity")}
                value={line.quantity}
                onChange={(e) => update(index, { quantity: e.target.value })}
              />
              <Input
                inputMode="decimal"
                placeholder={t("purchaseLineTotal")}
                aria-label={t("purchaseLineTotal")}
                value={line.cost}
                onChange={(e) => update(index, { cost: e.target.value })}
              />
            </div>
            {hint?.last_supplier_name || hint?.last_unit_cost != null ? (
              <p className="text-xs text-muted-foreground">
                {hint?.last_supplier_name ? (
                  <span>
                    {t("purchaseLastBoughtAt")} {hint.last_supplier_name}
                    {hint.last_unit_cost != null ? " · " : ""}
                  </span>
                ) : null}
                {hint?.last_unit_cost != null ? (
                  <span>
                    {t("purchaseLastPrice")} {mad(hint.last_unit_cost)}
                  </span>
                ) : null}
              </p>
            ) : null}
            {lines.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                className="justify-self-start rounded-xl"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              >
                {t("purchaseRemoveLine")}
              </Button>
            ) : null}
          </div>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        className="rounded-xl"
        onClick={() => setLines((prev) => [...prev, { itemId: "", quantity: "", cost: "" }])}
      >
        {t("purchaseAddLine")}
      </Button>

      <div className="grid gap-1">
        <Label className="text-sm">{t("stockNote")}</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <p className="flex items-center justify-between text-sm font-semibold">
        <span>{t("purchaseTotal")}</span>
        <span>{mad(total)}</span>
      </p>
      <Button className="w-full rounded-xl" disabled={busy} onClick={() => void submit()}>
        {t("save")}
      </Button>
    </div>
  );
}

function SuppliersTab({
  canWrite,
  onChanged,
}: {
  canWrite: boolean;
  onChanged: () => Promise<void>;
}) {
  const suppliers = useQuery(suppliersQuery);
  const [draft, setDraft] = useState<Supplier | "new" | null>(null);
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const list = [...(suppliers.data ?? [])]
    .filter(
      (supplier) =>
        !normalizedSearch ||
        [supplier.name, supplier.phone, supplier.location]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch)),
    )
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  async function toggle(supplier: Supplier) {
    try {
      await setSupplierActive(supplier.id, !supplier.active);
      toast.success(t("supplierSaved"));
      await onChanged();
    } catch (e) {
      const key = inventoryErrorKey((e as Error).message);
      toast.error(key ? t(key as never) : (e as Error).message);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {canWrite ? (
        <Button className="w-full rounded-xl" onClick={() => setDraft("new")}>
          {t("supplierNew")}
        </Button>
      ) : null}

      {(suppliers.data ?? []).length > 4 ? (
        <Input
          value={search}
          placeholder={t("supplierSearch")}
          aria-label={t("supplierSearch")}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}

      {suppliers.isLoading ? (
        <p className="surface-card p-3 text-sm text-muted-foreground">{t("loading")}</p>
      ) : list.length === 0 ? (
        <p className="surface-card p-3 text-sm text-muted-foreground">{t("supplierEmpty")}</p>
      ) : (
        <ul className="surface-card divide-y divide-border">
          {list.map((s) => (
            <li key={s.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.phone, s.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {!s.active ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {t("supplierInactive")}
                  </span>
                ) : null}
              </div>
              {canWrite ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setDraft(s)}
                  >
                    {t("supplierEdit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => void toggle(s)}
                  >
                    {s.active ? t("supplierDeactivate") : t("supplierActivate")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-start">
            <SheetTitle className="text-base">
              {draft === "new" ? t("supplierNew") : t("supplierEdit")}
            </SheetTitle>
          </SheetHeader>
          {draft !== null ? (
            <SupplierForm
              supplier={draft === "new" ? null : draft}
              onDone={async () => {
                setDraft(null);
                await onChanged();
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SupplierForm({
  supplier,
  onDone,
}: {
  supplier: Supplier | null;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [location, setLocation] = useState(supplier?.location ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error(t("supplierNameRequired"));
      return;
    }
    setBusy(true);
    try {
      await saveSupplier({
        id: supplier?.id ?? null,
        name,
        phone,
        location,
        notes,
        active: supplier?.active ?? true,
      });
      toast.success(t("supplierSaved"));
      await onDone();
    } catch (e) {
      const key = inventoryErrorKey((e as Error).message);
      toast.error(key ? t(key as never) : (e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="mt-2 grid gap-3 pb-6">
      <div className="grid gap-1">
        <Label className="text-sm">{t("supplierName")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label className="text-sm">{t("supplierPhone")}</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label className="text-sm">{t("supplierLocation")}</Label>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label className="text-sm">{t("supplierNotes")}</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button className="w-full rounded-xl" disabled={busy} onClick={() => void submit()}>
        {t("save")}
      </Button>
    </div>
  );
}
