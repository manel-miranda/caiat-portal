/**
 * PREVIEW-ONLY demo food menu with curated cross-sell.
 *
 * Rendered only on Lovable preview hosts, gated client-side after hydration
 * and defaulting to hidden. Nothing here touches the database: no requests,
 * charges or payments are created, and all dishes/prices come from the
 * frontend config in `src/lib/demo-menu.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, ChevronLeft, Plus, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mad } from "@/lib/format";
import { t, useLang, type TranslationKey } from "@/lib/i18n";
import {
  DEMO_CATEGORY_ORDER,
  DEMO_MENU,
  demoDish,
  isDemoPreviewHost,
  type DemoCategory,
  type DemoDish,
} from "@/lib/demo-menu";

const CATEGORY_LABEL: Record<DemoCategory, TranslationKey> = {
  signature: "catSignatureDishes",
  mains: "catMainDishes",
  drinks: "catDrinks",
  desserts: "catDesserts",
};

export function DemoFoodMenu() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(isDemoPreviewHost(window.location.hostname));
  }, []);

  if (!visible) return null;
  return <DemoMenuBody />;
}

function DemoMenuBody() {
  const { lang } = useLang();
  const [selected, setSelected] = useState<DemoDish | null>(null);
  const [addOns, setAddOns] = useState<string[]>([]);
  const [summary, setSummary] = useState(false);

  const total = useMemo(() => {
    if (!selected) return 0;
    return (
      selected.priceMad +
      addOns.reduce((sum, id) => sum + (demoDish(id)?.priceMad ?? 0), 0)
    );
  }, [selected, addOns]);

  function choose(dish: DemoDish) {
    setSelected(dish);
    setAddOns([]);
    setSummary(false);
  }

  function toggle(id: string) {
    setAddOns((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function viewIn3d() {
    document.getElementById("caiat-3d-demo")?.scrollIntoView({ behavior: "smooth" });
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
      <p className="mt-1 text-xs text-muted-foreground">{t("demoMenuNote")}</p>

      {!selected ? (
        <div className="mt-3 space-y-4">
          {DEMO_CATEGORY_ORDER.map((cat) => {
            const dishes = DEMO_MENU.filter((d) => d.category === cat);
            if (dishes.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(CATEGORY_LABEL[cat])}
                </p>
                {dishes.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <button
                      type="button"
                      onClick={() => choose(d)}
                      className="tap-target flex w-full items-start gap-3 text-start"
                    >
                      <span className="min-w-0 flex-1">
                        {d.signature ? (
                          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            <Sparkles className="size-3" /> {t("caiatSignature")}
                          </span>
                        ) : null}
                        <span className="block text-sm font-semibold">{d.name[lang]}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {d.description[lang]}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold">{mad(d.priceMad)}</span>
                    </button>
                    {d.arAvailable ? (
                      <button
                        type="button"
                        onClick={viewIn3d}
                        className="tap-target mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
                      >
                        <Box className="size-3.5" /> {t("viewIn3d")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setAddOns([]);
              setSummary(false);
            }}
            className="tap-target -ms-2 flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" /> {t("back")}
          </button>

          <div className="rounded-xl border border-primary bg-primary/5 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("demoMainItem")}
            </p>
            <div className="mt-0.5 flex items-start justify-between gap-3">
              <p className="min-w-0 font-semibold">{selected.name[lang]}</p>
              <p className="shrink-0 font-semibold">{mad(selected.priceMad)}</p>
            </div>
          </div>

          {selected.recommendationIds.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t("recommendedWith")}</p>
              <p className="text-xs text-muted-foreground">{t("completeMeal")}</p>
              {selected.recommendationIds.slice(0, 3).map((id) => {
                const rec = demoDish(id);
                if (!rec) return null;
                const on = addOns.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    className={`tap-target flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-start ${
                      on ? "border-primary bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{rec.name[lang]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {on ? t("removeItem") : t("addForPrice", { price: mad(rec.priceMad) })}
                      </span>
                    </span>
                    {on ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : (
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
            <span className="font-semibold">{t("demoTotal")}</span>
            <span className="font-semibold">{mad(total)}</span>
          </div>

          <Button
            variant="outline"
            className="tap-target w-full rounded-xl"
            onClick={() => setSummary(true)}
          >
            {t("previewOrder")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("demoNoCharge")}</p>

          {summary ? (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{t("demoSummaryTitle")}</p>
              <div className="mt-2 flex items-start justify-between gap-3">
                <span className="min-w-0">{selected.name[lang]}</span>
                <span className="shrink-0">{mad(selected.priceMad)}</span>
              </div>
              {addOns.length > 0 ? (
                <>
                  <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                    {t("demoAddOns")}
                  </p>
                  {addOns.map((id) => {
                    const rec = demoDish(id);
                    if (!rec) return null;
                    return (
                      <div key={id} className="flex items-start justify-between gap-3">
                        <span className="min-w-0">{rec.name[lang]}</span>
                        <span className="shrink-0">{mad(rec.priceMad)}</span>
                      </div>
                    );
                  })}
                </>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2 font-semibold">
                <span>{t("demoTotal")}</span>
                <span>{mad(total)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("demoNoCharge")}</p>
              <Button
                variant="ghost"
                className="tap-target mt-2 w-full rounded-xl"
                onClick={() => setSummary(false)}
              >
                {t("close")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
