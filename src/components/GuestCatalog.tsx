/**
 * Guest request catalogue with progressive disclosure.
 *
 * Category -> (optional) subcategory -> item. Only one level is open at a
 * time so the mobile portal never shows a wall of buttons. Pure presentation:
 * request creation, rate limits and validation stay server-side.
 */
import { useMemo, useState } from "react";
import {
  Car,
  ChevronLeft,
  ChevronRight,
  Compass,
  MessageCircle,
  Mountain,
  Sparkles,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { mad } from "@/lib/format";
import { t, type TranslationKey } from "@/lib/i18n";
import {
  activityModeLabel,
  difficultyLabel,
  serviceDescription,
  serviceLabel,
} from "@/lib/service-i18n";
import type { GuestService } from "@/lib/guest";

export type CatalogSelection = { kind: "item"; service: GuestService } | { kind: "else" } | null;

type CategoryDef = { key: string; icon: LucideIcon; labelKey: TranslationKey; subs: string[] };

const CATEGORIES: CategoryDef[] = [
  {
    key: "food",
    icon: UtensilsCrossed,
    labelKey: "gcatFood",
    subs: ["breakfast", "meals", "room_service"],
  },
  {
    key: "activities",
    icon: Mountain,
    labelKey: "catActivities",
    subs: ["hiking", "cycling", "climbing", "wellness", "other"],
  },
  { key: "transport", icon: Car, labelKey: "gcatTransport", subs: [] },
  { key: "explore", icon: Compass, labelKey: "catExplore", subs: [] },
  { key: "extras", icon: Sparkles, labelKey: "catExtras", subs: [] },
  { key: "else", icon: MessageCircle, labelKey: "catElse", subs: [] },
];

const SUB_LABEL: Record<string, TranslationKey> = {
  breakfast: "subBreakfast",
  meals: "subMeals",
  room_service: "subRoomService",
  hiking: "subHiking",
  cycling: "subCycling",
  climbing: "subClimbing",
  wellness: "subWellness",
  other: "subOther",
};

/** Services the catalogue could not place fall back to Stay extras. */
function categoryOf(s: GuestService): string {
  const c = s.guest_category ?? "";
  return CATEGORIES.some((x) => x.key === c) ? c : "extras";
}

function priceText(s: GuestService): string {
  return s.billable && Number(s.default_price) > 0 ? mad(s.default_price) : t("priceAskReception");
}

function metaText(s: GuestService): string | null {
  const parts = [activityModeLabel(s.activity_mode), difficultyLabel(s.difficulty)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function GuestCatalog({
  services,
  selection,
  onSelect,
}: {
  services: GuestService[];
  selection: CatalogSelection;
  onSelect: (next: CatalogSelection) => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);

  const byCategory = useMemo(() => {
    const map = new Map<string, GuestService[]>();
    for (const s of services) {
      const key = categoryOf(s);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [services]);

  function reset() {
    setCategory(null);
    setSub(null);
    onSelect(null);
  }

  /* ---------- selected summary ---------- */
  if (selection) {
    const title = selection.kind === "item" ? serviceLabel(selection.service) : t("catElse");
    return (
      <div className="rounded-xl border border-primary bg-primary/5 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("selectedItem")}
            </p>
            <p className="mt-0.5 truncate font-semibold">{title}</p>
            {selection.kind === "item" ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {priceText(selection.service)}
                {metaText(selection.service) ? ` · ${metaText(selection.service)}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={reset}
            className="tap-target shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
          >
            {t("changeChoice")}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- level 1: categories ---------- */
  if (!category) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("chooseCategory")}</p>
        {CATEGORIES.map((c) => {
          const count = (byCategory.get(c.key) ?? []).length;
          if (c.key !== "else" && count === 0) return null;
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setCategory(c.key);
                setSub(null);
              }}
              className="tap-target flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-start"
            >
              <Icon className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{t(c.labelKey)}</span>
                {c.key !== "else" && count > 0 ? (
                  <span className="block text-xs text-muted-foreground">
                    {t("optionsCount", { count: String(count) })}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          );
        })}
      </div>
    );
  }

  const def = CATEGORIES.find((c) => c.key === category)!;
  const items = byCategory.get(category) ?? [];
  const subsWithItems = def.subs.filter((s) =>
    items.some((i) => (i.guest_subcategory ?? "other") === s),
  );
  const useSubs = subsWithItems.length > 1;

  const back = (
    <button
      type="button"
      onClick={() => (sub ? setSub(null) : setCategory(null))}
      className="tap-target -ms-2 flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground"
    >
      <ChevronLeft className="size-4 rtl:rotate-180" /> {t("back")}
    </button>
  );

  /* ---------- level 2: subcategories ---------- */
  if (useSubs && !sub) {
    return (
      <div className="space-y-2">
        {back}
        <p className="text-sm font-semibold">{t(def.labelKey)}</p>
        {subsWithItems.map((s) => {
          const count = items.filter((i) => (i.guest_subcategory ?? "other") === s).length;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSub(s)}
              className="tap-target flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-start"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {t(SUB_LABEL[s] ?? "subOther")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("optionsCount", { count: String(count) })}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          );
        })}
      </div>
    );
  }

  /* ---------- level 3: items ---------- */
  const shown = useSubs ? items.filter((i) => (i.guest_subcategory ?? "other") === sub) : items;

  return (
    <div className="space-y-2">
      {back}
      <p className="text-sm font-semibold">
        {t(def.labelKey)}
        {useSubs && sub ? ` · ${t(SUB_LABEL[sub] ?? "subOther")}` : ""}
      </p>

      {shown.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect({ kind: "item", service: s })}
          className="tap-target flex w-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-start"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{serviceLabel(s)}</span>
            {serviceDescription(s) ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {serviceDescription(s)}
              </span>
            ) : null}
            {metaText(s) ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">{metaText(s)}</span>
            ) : null}
          </span>
          <span className="shrink-0 text-sm font-semibold">{priceText(s)}</span>
        </button>
      ))}

      {category === "else" ? (
        <button
          type="button"
          onClick={() => onSelect({ kind: "else" })}
          className="tap-target flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card px-3 py-3 text-start text-sm font-semibold"
        >
          {t("describeYourself")}
        </button>
      ) : null}
    </div>
  );
}
