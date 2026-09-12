/**
 * PREVIEW-ONLY demo food ordering prototype with curated cross-sell.
 *
 * Rendered only on Lovable preview hosts, gated client-side after hydration and
 * defaulting to hidden. Submitting creates a row in the dedicated
 * `preview_food_orders` tables only: never a request, charge, payment or
 * PayPal session.
 *
 * Dishes come from the seeded `preview_only` catalogue rows returned by the
 * guest portal, so recommendations configured in the Catalogue manager
 * (including real items such as Pampa) can be demonstrated. The static config
 * in `src/lib/demo-menu.ts` is only a display fallback when those rows are
 * unavailable, and cannot be ordered.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Box, ChevronLeft, Plus, Minus, Sparkles, ShoppingBag, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mad } from "@/lib/format";
import { t, useLang, type TranslationKey } from "@/lib/i18n";
import { serviceDescription, serviceLabel } from "@/lib/service-i18n";
import type { GuestService } from "@/lib/guest";
import {
  PREVIEW_TIMINGS,
  PREVIEW_TIMING_LABEL,
  submitPreviewOrder,
  type PreviewTiming,
} from "@/lib/preview-orders";
import {
  DEMO_CATEGORY_ORDER,
  DEMO_MENU,
  isDemoPreviewHost,
  type DemoCategory,
} from "@/lib/demo-menu";

const CATEGORY_LABEL: Record<DemoCategory, TranslationKey> = {
  signature: "catSignatureDishes",
  mains: "catMainDishes",
  drinks: "catDrinks",
  desserts: "catDesserts",
};

/** Flattened dish shape shared by the seeded rows and the static fallback. */
type Dish = {
  id: string;
  name: string;
  description: string;
  priceMad: number;
  category: DemoCategory;
  signature: boolean;
  recommendationIds: string[];
  arAvailable: boolean;
  available: boolean;
  /** Only database-backed dishes can be ordered in the prototype. */
  orderable: boolean;
};

function categoryOf(value: string | null | undefined): DemoCategory {
  if (value === "signature" || value === "drinks" || value === "desserts") return value;
  return "mains";
}

export function DemoFoodMenu(props: {
  token?: string;
  services?: GuestService[];
  demoServices?: GuestService[];
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(isDemoPreviewHost(window.location.hostname));
  }, []);

  if (!visible) return null;
  return (
    <DemoMenuBody
      token={props.token ?? ""}
      services={props.services ?? []}
      demoServices={props.demoServices ?? []}
    />
  );
}

function DemoMenuBody({
  token,
  services,
  demoServices,
}: {
  token: string;
  services: GuestService[];
  demoServices: GuestService[];
}) {
  const { lang } = useLang();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<"menu" | "review">("menu");
  const [notes, setNotes] = useState("");
  const [timing, setTiming] = useState<PreviewTiming>("asap");
  const [busy, setBusy] = useState(false);
  /** Reference of the last submitted preview order, shown as a confirmation. */
  const [confirmed, setConfirmed] = useState<string | null>(null);

  // Every item a recommendation can point at: demo dishes plus real services.
  const pool = useMemo(() => {
    const map = new Map<string, Dish>();
    for (const s of [...demoServices, ...services]) {
      map.set(s.id, {
        id: s.id,
        name: serviceLabel(s),
        description: serviceDescription(s) ?? "",
        priceMad: Number(s.default_price ?? 0),
        category: categoryOf(s.guest_subcategory),
        signature: Boolean(s.signature),
        recommendationIds: s.recommended_ids ?? [],
        arAvailable: s.key === "demo_kefta_tajine",
        available: s.available_today !== false,
        orderable: true,
      });
    }
    return map;
  }, [demoServices, services, lang]);

  const dishes = useMemo<Dish[]>(() => {
    if (demoServices.length > 0) {
      return demoServices.map((s) => pool.get(s.id)!).filter(Boolean);
    }
    // Offline fallback: static preview config, display only.
    return DEMO_MENU.map((d) => ({
      id: d.id,
      name: d.name[lang],
      description: d.description[lang],
      priceMad: d.priceMad,
      category: d.category,
      signature: Boolean(d.signature),
      recommendationIds: d.recommendationIds,
      arAvailable: Boolean(d.arAvailable),
      available: true,
      orderable: false,
    }));
  }, [demoServices, pool, lang]);

  const byId = useMemo(() => {
    const map = new Map<string, Dish>(pool);
    for (const d of dishes) map.set(d.id, d);
    return map;
  }, [pool, dishes]);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ dish: byId.get(id), qty }))
        .filter((l): l is { dish: Dish; qty: number } => Boolean(l.dish) && l.qty > 0),
    [cart, byId],
  );

  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.dish.priceMad * l.qty, 0);

  /** Curated cross-sells for what is currently in the cart, minus unavailable. */
  const recommendations = useMemo(() => {
    const out: Dish[] = [];
    for (const line of lines) {
      for (const id of line.dish.recommendationIds) {
        const rec = byId.get(id);
        if (!rec || !rec.available || cart[id] || out.some((d) => d.id === id)) continue;
        out.push(rec);
      }
    }
    return out.slice(0, 3);
  }, [lines, byId, cart]);

  function add(dish: Dish, delta = 1) {
    if (!dish.available) return;
    setCart((prev) => {
      const next = { ...prev };
      const qty = (next[dish.id] ?? 0) + delta;
      if (qty <= 0) delete next[dish.id];
      else next[dish.id] = Math.min(qty, 20);
      return next;
    });
  }

  function viewIn3d() {
    document.getElementById("caiat-3d-demo")?.scrollIntoView({ behavior: "smooth" });
  }

  async function send() {
    if (lines.length === 0 || !token) return;
    const payload = lines.filter((l) => l.dish.orderable);
    if (payload.length === 0) {
      toast.error(t("linkInactive"));
      return;
    }
    setBusy(true);
    try {
      const orderId = await submitPreviewOrder({
        token,
        items: payload.map((l) => ({ service_type_id: l.dish.id, quantity: l.qty })),
        notes: notes.slice(0, 500),
        timing,
      });
      setConfirmed(orderId);
      setCart({});
      setNotes("");
      setTiming("asap");
      setStep("menu");
      toast.success(t("previewOrderSent"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-card mt-4 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("demoMenuSection")}
        </h2>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase">
          {t("demoMenuBadge")}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("previewOrderBanner")}</p>

      {step === "menu" ? (
        <div className="mt-3 space-y-4">
          {DEMO_CATEGORY_ORDER.map((cat) => {
            const list = dishes.filter((d) => d.category === cat);
            if (list.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(CATEGORY_LABEL[cat])}
                </p>
                {list.map((d) => (
                  <DishRow
                    key={d.id}
                    dish={d}
                    qty={cart[d.id] ?? 0}
                    onAdd={() => add(d, 1)}
                    onRemove={() => add(d, -1)}
                    onView3d={d.arAvailable ? viewIn3d : undefined}
                  />
                ))}
              </div>
            );
          })}

          {recommendations.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm font-semibold">{t("recommendedWith")}</p>
              <p className="text-xs text-muted-foreground">{t("completeMeal")}</p>
              {recommendations.map((rec) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => add(rec, 1)}
                  className="tap-target flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-start"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{rec.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("addForPrice", { price: mad(rec.priceMad) })}
                    </span>
                  </span>
                  <Plus className="size-4 shrink-0 text-primary" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={() => setStep("menu")}
            className="tap-target -ms-2 flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" /> {t("backToMenu")}
          </button>

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cartEmpty")}</p>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {lines.map(({ dish, qty }) => (
                  <li key={dish.id} className="flex items-center gap-2 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{dish.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {qty} × {mad(dish.priceMad)}
                      </span>
                    </span>
                    <Stepper
                      qty={qty}
                      onAdd={() => add(dish, 1)}
                      onRemove={() => add(dish, -1)}
                    />
                    <span className="w-20 shrink-0 text-end text-sm font-semibold">
                      {mad(dish.priceMad * qty)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <Label htmlFor="fo-timing">{t("requestedTiming")}</Label>
                <select
                  id="fo-timing"
                  value={timing}
                  onChange={(e) => setTiming(e.target.value as PreviewTiming)}
                  className="min-h-11 w-full rounded-xl border border-border bg-card px-2 text-sm"
                >
                  {PREVIEW_TIMINGS.map((v) => (
                    <option key={v} value={v}>
                      {t(PREVIEW_TIMING_LABEL[v])}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fo-notes">{`${t("orderNotes")} (${t("optional")})`}</Label>
                <Textarea
                  id="fo-notes"
                  rows={2}
                  maxLength={500}
                  placeholder={t("orderNotesHint")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm font-semibold">
                <span>{t("subtotal")}</span>
                <span>{mad(subtotal)}</span>
              </div>

              <Button
                className="tap-target w-full rounded-xl"
                disabled={busy}
                onClick={() => void send()}
              >
                <Send className="me-2 size-4" /> {t("sendPreviewOrder")}
              </Button>
              <Button
                variant="ghost"
                className="tap-target w-full rounded-xl"
                onClick={() => setCart({})}
              >
                {t("clearCart")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("demoNoCharge")}</p>
            </>
          )}
        </div>
      )}

      {count > 0 && step === "menu" ? (
        <div className="sticky bottom-2 mt-4">
          <Button
            className="tap-target flex w-full items-center justify-between rounded-xl"
            onClick={() => setStep("review")}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="size-4" /> {t("cartCount", { count: String(count) })}
            </span>
            <span>{mad(subtotal)}</span>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Stepper({
  qty,
  onAdd,
  onRemove,
}: {
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label="-"
        onClick={onRemove}
        className="flex size-11 items-center justify-center rounded-xl border border-border"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-6 text-center text-sm font-semibold">{qty}</span>
      <button
        type="button"
        aria-label="+"
        onClick={onAdd}
        className="flex size-11 items-center justify-center rounded-xl border border-border"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function DishRow({
  dish,
  qty,
  onAdd,
  onRemove,
  onView3d,
}: {
  dish: Dish;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
  onView3d?: (() => void) | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {dish.signature ? (
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="size-3" /> {t("caiatSignature")}
            </span>
          ) : null}
          <p className="text-sm font-semibold">{dish.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{dish.description}</p>
          <p className="mt-1 text-sm font-semibold">{mad(dish.priceMad)}</p>
          {!dish.available ? (
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {t("unavailableToday")}
            </p>
          ) : null}
        </div>
        {dish.available ? (
          qty > 0 ? (
            <Stepper qty={qty} onAdd={onAdd} onRemove={onRemove} />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="tap-target shrink-0 rounded-xl"
              onClick={onAdd}
            >
              <Plus className="me-1 size-4" /> {t("addToCart")}
            </Button>
          )
        ) : null}
      </div>
      {onView3d ? (
        <button
          type="button"
          onClick={onView3d}
          className="tap-target mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
        >
          <Box className="size-3.5" /> {t("viewIn3d")}
        </button>
      ) : null}
    </div>
  );
}
