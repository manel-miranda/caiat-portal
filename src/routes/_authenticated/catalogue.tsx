import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { RecipeSheet } from "@/components/RecipeSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requireAdmin } from "@/lib/admin-guard";
import { mad } from "@/lib/format";
import { t, LANGUAGES, type Lang } from "@/lib/i18n";
import { serviceLabel } from "@/lib/service-i18n";
import { recipeComponentsQuery } from "@/lib/inventory";
import {
  catalogErrorKey,
  catalogItemsQuery,
  catalogRecommendationsQuery,
  saveCatalogItem,
  setCatalogItemActive,
  setCatalogItemAvailable,
  setCatalogRecommendations,
  setCatalogIncomingRecommendations,
  type CatalogItem,
  type LocalizedText,
} from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/catalogue")({
  beforeLoad: requireAdmin,
  head: () => ({
    meta: [
      { title: "Catalogue manager — Caiat Operations" },
      {
        name: "description",
        content:
          "Admin catalogue manager for Caiat: create, edit and archive guest-facing menu items, prices and recommendations.",
      },
      { property: "og:title", content: "Catalogue manager — Caiat Operations" },
      {
        property: "og:description",
        content: "Maintain the Caiat guest catalogue: items, prices, visibility and cross-sells.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CataloguePage,
});

type Draft = {
  id: string | null;
  key: string;
  label: string;
  price: string;
  billable: boolean;
  requestable: boolean;
  active: boolean;
  guestVisible: boolean;
  category: string;
  guestCategory: string;
  guestSubcategory: string;
  shortDescription: string;
  activityMode: string;
  difficulty: string;
  displayOrder: string;
  sortOrder: string;
  featured: boolean;
  signature: boolean;
  names: LocalizedText;
  descriptions: LocalizedText;
  recommended: string[];
  /** Items this one should be suggested after (incoming relationships). */
  recommendedIn: string[];
};

function emptyDraft(): Draft {
  return {
    id: null,
    key: "",
    label: "",
    price: "0",
    billable: true,
    requestable: false,
    active: false,
    guestVisible: false,

    category: "food",
    guestCategory: "food",
    guestSubcategory: "",
    shortDescription: "",
    activityMode: "",
    difficulty: "",
    displayOrder: "0",
    sortOrder: "0",
    featured: false,
    signature: false,
    names: {},
    descriptions: {},
    recommended: [],
    recommendedIn: [],
  };
}

function toDraft(item: CatalogItem, recommended: string[], recommendedIn: string[]): Draft {
  return {
    id: item.id,
    key: item.key,
    label: item.label,
    price: String(item.default_price ?? 0),
    billable: item.billable,
    requestable: item.requestable,
    active: item.active,
    guestVisible: item.guest_visible,
    category: item.category ?? "other",
    guestCategory: item.guest_category ?? "",
    guestSubcategory: item.guest_subcategory ?? "",
    shortDescription: item.short_description ?? "",
    activityMode: item.activity_mode ?? "",
    difficulty: item.difficulty ?? "",
    displayOrder: String(item.display_order ?? 0),
    sortOrder: String(item.sort_order ?? 0),
    featured: item.featured,
    signature: item.signature,
    names: (item.name_i18n ?? {}) as LocalizedText,
    descriptions: (item.description_i18n ?? {}) as LocalizedText,
    recommended,
    recommendedIn,
  };
}

const CATEGORIES = ["food", "transport", "visit", "outdoor", "route", "included", "other"];
/** Dishes are the only items a stock recipe makes sense for. */
function isFoodItem(item: CatalogItem): boolean {
  return item.category === "food" || item.guest_category === "food";
}

const GUEST_CATEGORIES = ["", "food", "activities", "transport", "explore", "extras", "else"];

function CataloguePage() {
  const queryClient = useQueryClient();
  const items = useQuery(catalogItemsQuery);
  const recs = useQuery(catalogRecommendationsQuery);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState<"all" | "real" | "demo">("all");
  const [sortBy, setSortBy] = useState<"order" | "name" | "price">("order");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recipeFor, setRecipeFor] = useState<CatalogItem | null>(null);
  const recipeComponents = useQuery(recipeComponentsQuery);
  const recipeIds = new Set((recipeComponents.data ?? []).map((r) => r.service_type_id));
  const [busy, setBusy] = useState(false);

  const all = items.data ?? [];
  const recMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of recs.data ?? []) {
      map.set(r.service_type_id, [...(map.get(r.service_type_id) ?? []), r.recommended_service_type_id]);
    }
    return map;
  }, [recs.data]);

  /** Reverse index: item id -> sources that recommend it. */
  const incomingMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of recs.data ?? []) {
      const target = r.recommended_service_type_id;
      map.set(target, [...(map.get(target) ?? []), r.service_type_id]);
    }
    return map;
  }, [recs.data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = all.filter((i) => {
      if (status === "active" && !i.active) return false;
      if (status === "inactive" && i.active) return false;
      if (category && (i.category ?? "other") !== category) return false;
      if (kind === "real" && i.preview_only) return false;
      if (kind === "demo" && !i.preview_only) return false;
      if (!term) return true;
      return (
        i.label.toLowerCase().includes(term) ||
        i.key.toLowerCase().includes(term) ||
        (i.short_description ?? "").toLowerCase().includes(term)
      );
    });
    list = [...list];
    if (sortBy === "name") list.sort((a, b) => a.label.localeCompare(b.label));
    else if (sortBy === "price") list.sort((a, b) => Number(b.default_price) - Number(a.default_price));
    else list.sort((a, b) => a.display_order - b.display_order || a.sort_order - b.sort_order);
    return list;
  }, [all, search, status, category, kind, sortBy]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    await queryClient.invalidateQueries({ queryKey: ["service_types"] });
  }

  function fail(e: unknown) {
    const key = catalogErrorKey((e as Error).message);
    toast.error(key ? t(key as never) : (e as Error).message);
  }

  async function toggleActive(item: CatalogItem) {
    setBusy(true);
    try {
      await setCatalogItemActive(item.id, !item.active);
      await refresh();
      toast.success(t("catalogueSaved"));
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  }

  async function toggleAvailable(item: CatalogItem) {
    setBusy(true);
    try {
      await setCatalogItemAvailable(item.id, !item.available_today);
      await refresh();
      toast.success(t("catalogueSaved"));
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  }

  async function save() {
    if (!draft) return;
    const price = Number(draft.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error(t("amountPositive"));
      return;
    }
    setBusy(true);
    try {
      const id = await saveCatalogItem({
        id: draft.id,
        key: draft.key.trim().toLowerCase(),
        label: draft.label.trim(),
        defaultPrice: price,
        billable: draft.billable,
        requestable: draft.requestable,
        active: draft.active,
        guestVisible: draft.guestVisible,
        category: draft.category,
        guestCategory: draft.guestCategory,
        guestSubcategory: draft.guestSubcategory,
        shortDescription: draft.shortDescription,
        activityMode: draft.activityMode,
        difficulty: draft.difficulty,
        displayOrder: Number(draft.displayOrder) || 0,
        sortOrder: Number(draft.sortOrder) || 0,
        featured: draft.featured,
        signature: draft.signature,
        nameI18n: cleanText(draft.names),
        descriptionI18n: cleanText(draft.descriptions),
      });
      await setCatalogRecommendations(id, draft.recommended.slice(0, 3));
      await setCatalogIncomingRecommendations(id, draft.recommendedIn);
      await refresh();
      toast.success(t("catalogueSaved"));
      setDraft(null);
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  }

  function toggleRecommended(id: string) {
    setDraft((d) => {
      if (!d) return d;
      const has = d.recommended.includes(id);
      if (has) return { ...d, recommended: d.recommended.filter((x) => x !== id) };
      if (d.recommended.length >= 3) {
        toast.error(t("catalogueTooManyRecommendations"));
        return d;
      }
      return { ...d, recommended: [...d.recommended, id] };
    });
  }

  function toggleRecommendedIn(id: string) {
    setDraft((d) => {
      if (!d) return d;
      const has = d.recommendedIn.includes(id);
      return {
        ...d,
        recommendedIn: has ? d.recommendedIn.filter((x) => x !== id) : [...d.recommendedIn, id],
      };
    });
  }

  return (
    <AppShell title={t("catalogueTitle")}>
      <p className="text-sm text-muted-foreground">{t("catalogueIntro")}</p>

      <div className="surface-card mt-3 space-y-2 p-3 sm:p-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("catalogueSearch")}
          aria-label={t("catalogueSearch")}
        />
        <div className="flex flex-wrap gap-2">
          <select
            aria-label={t("catalogueFilterAll")}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-card px-2 text-sm"
          >
            <option value="all">{t("catalogueFilterAll")}</option>
            <option value="active">{t("catalogueFilterActive")}</option>
            <option value="inactive">{t("catalogueFilterInactive")}</option>
          </select>
          <select
            aria-label={t("catalogueGuestCategory")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-card px-2 text-sm"
          >
            <option value="">{t("catalogueFilterAll")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label={t("catalogueSortBy")}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-card px-2 text-sm"
          >
            <option value="order">{t("catalogueSortOrder")}</option>
            <option value="name">{t("catalogueSortName")}</option>
            <option value="price">{t("catalogueSortPrice")}</option>
          </select>
          <select
            aria-label={t("catalogueDemoBadge")}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-card px-2 text-sm"
          >
            <option value="all">{t("catalogueFilterAll")}</option>
            <option value="real">{t("catalogueFilterReal")}</option>
            <option value="demo">{t("catalogueFilterDemo")}</option>
          </select>
        </div>
        <Button className="w-full rounded-xl" onClick={() => setDraft(emptyDraft())}>
          {t("catalogueNew")}
        </Button>
      </div>

      {items.isLoading ? (
        <p className="surface-card mt-3 p-3 text-sm text-muted-foreground">{t("loading")}</p>
      ) : visible.length === 0 ? (
        <p className="surface-card mt-3 p-3 text-sm text-muted-foreground">{t("noResults")}</p>
      ) : (
        <ul className="surface-card mt-3 divide-y divide-border">
          {visible.map((item) => (
            <li key={item.id} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {serviceLabel(item)}
                    {!item.active ? (
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        {t("catalogueFilterInactive")}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.key} · {mad(item.default_price)} · {item.category}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.featured ? <Tag>{t("catalogueFeatured")}</Tag> : null}
                    {item.signature ? <Tag>{t("catalogueSignature")}</Tag> : null}
                    {item.requestable ? <Tag>{t("catalogueRequestable")}</Tag> : null}
                    {item.guest_visible ? <Tag>{t("catalogueGuestVisible")}</Tag> : null}
                    {item.available_today ? (
                      <Tag>{t("catalogueAvailableToday")}</Tag>
                    ) : (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        {t("unavailableToday")}
                      </span>
                    )}
                    {isFoodItem(item) && !recipeIds.has(item.id) ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {t("recipeMissing")}
                      </span>
                    ) : null}
                    {item.preview_only ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-400">
                        {t("catalogueDemoBadge")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() =>
                      setDraft(
                        toDraft(item, recMap.get(item.id) ?? [], incomingMap.get(item.id) ?? []),
                      )
                    }
                  >
                    {t("catalogueEdit")}
                  </Button>
                  <Button
                    size="sm"
                    variant={item.active ? "outline" : "default"}
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() => void toggleActive(item)}
                  >
                    {item.active ? t("catalogueDeactivate") : t("catalogueReactivate")}
                  </Button>
                  {isFoodItem(item) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => setRecipeFor(item)}
                    >
                      {t("recipeButton")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={busy}
                    onClick={() => void toggleAvailable(item)}
                  >
                    {item.available_today
                      ? t("catalogueMarkUnavailable")
                      : t("catalogueMarkAvailable")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {draft?.id ? t("catalogueEdit") : t("catalogueNew")}
            </DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="grid gap-3">
              <Field label={t("catalogueGuestName")}>
                <Input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                />
              </Field>
              <Field
                label={t("catalogueKey")}
                hint={draft.id ? t("catalogueKeyLocked") : t("catalogueKeyHint")}
              >
                <Input
                  value={draft.key}
                  readOnly={!!draft.id}
                  disabled={!!draft.id}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                />
              </Field>
              {!draft.id ? (
                <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                  {t("catalogueDraftHint")}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("cataloguePrice")}>
                  <Input
                    inputMode="decimal"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  />
                </Field>
                <Field label={t("catalogueSortOrder")}>
                  <Input
                    inputMode="numeric"
                    value={draft.displayOrder}
                    onChange={(e) => setDraft({ ...draft, displayOrder: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("catalogueGuestCategory")}>
                  <select
                    value={draft.guestCategory}
                    onChange={(e) => setDraft({ ...draft, guestCategory: e.target.value })}
                    className="min-h-11 w-full rounded-xl border border-border bg-card px-2 text-sm"
                  >
                    {GUEST_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c || t("catalogueNone")}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("catalogueGuestSubcategory")}>
                  <Input
                    value={draft.guestSubcategory}
                    onChange={(e) => setDraft({ ...draft, guestSubcategory: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={t("catalogueShortDescription")}>
                <Input
                  value={draft.shortDescription}
                  onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("catalogueActivityMode")}>
                  <Input
                    value={draft.activityMode}
                    onChange={(e) => setDraft({ ...draft, activityMode: e.target.value })}
                  />
                </Field>
                <Field label={t("catalogueDifficulty")}>
                  <Input
                    value={draft.difficulty}
                    onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Toggle
                  label={t("catalogueBillable")}
                  checked={draft.billable}
                  onChange={(v) => setDraft({ ...draft, billable: v })}
                />
                <Toggle
                  label={t("catalogueRequestable")}
                  checked={draft.requestable}
                  disabled={!draft.id}
                  onChange={(v) => setDraft({ ...draft, requestable: v })}
                />
                <Toggle
                  label={t("catalogueActive")}
                  checked={draft.active}
                  disabled={!draft.id}
                  onChange={(v) => setDraft({ ...draft, active: v })}
                />
                <Toggle
                  label={t("catalogueGuestVisible")}
                  checked={draft.guestVisible}
                  disabled={!draft.id}
                  onChange={(v) => setDraft({ ...draft, guestVisible: v })}
                />

                <Toggle
                  label={t("catalogueFeatured")}
                  checked={draft.featured}
                  onChange={(v) => setDraft({ ...draft, featured: v })}
                />
                <Toggle
                  label={t("catalogueSignature")}
                  checked={draft.signature}
                  onChange={(v) => setDraft({ ...draft, signature: v })}
                />
              </div>

              <div>
                <p className="text-sm font-semibold">{t("catalogueTranslations")}</p>
                <p className="text-xs text-muted-foreground">{t("catalogueTranslationsHint")}</p>
                <div className="mt-2 grid gap-2">
                  {LANGUAGES.map((l) => (
                    <div key={l.code} className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">{l.label}</Label>
                      <Input
                        value={draft.names[l.code as Lang] ?? ""}
                        placeholder={t("catalogueGuestName")}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            names: { ...draft.names, [l.code]: e.target.value },
                          })
                        }
                      />
                      <Input
                        value={draft.descriptions[l.code as Lang] ?? ""}
                        placeholder={t("catalogueShortDescription")}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            descriptions: { ...draft.descriptions, [l.code]: e.target.value },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              {draft.id && all.find((i) => i.id === draft.id)?.preview_only ? (
                <p className="rounded-xl bg-amber-500/10 p-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {t("catalogueDemoHint")}
                </p>
              ) : null}

              <div>
                <p className="text-sm font-semibold">{t("catalogueRecommendedIn")}</p>
                <p className="text-xs text-muted-foreground">{t("catalogueRecommendedInHint")}</p>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border">
                  {all
                    .filter((i) => i.id !== draft.id && i.active)
                    .map((i) => (
                      <label
                        key={i.id}
                        className="flex min-h-11 items-center gap-2 border-b border-border px-3 text-sm last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={draft.recommendedIn.includes(i.id)}
                          onChange={() => toggleRecommendedIn(i.id)}
                        />
                        <span className="min-w-0 truncate">
                          {serviceLabel(i)}
                          {i.preview_only ? (
                            <span className="ms-1 text-[11px] uppercase text-amber-700 dark:text-amber-400">
                              {t("catalogueDemoBadge")}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">{t("catalogueRecommended")}</p>
                <p className="text-xs text-muted-foreground">{t("catalogueRecommendedHint")}</p>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border">
                  {all
                    .filter((i) => i.id !== draft.id && i.active)
                    .map((i) => (
                      <label
                        key={i.id}
                        className="flex min-h-11 items-center gap-2 border-b border-border px-3 text-sm last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={draft.recommended.includes(i.id)}
                          onChange={() => toggleRecommended(i.id)}
                        />
                        <span className="min-w-0 truncate">
                          {serviceLabel(i)}
                          {i.preview_only ? (
                            <span className="ms-1 text-[11px] uppercase text-amber-700 dark:text-amber-400">
                              {t("catalogueDemoBadge")}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                </div>
              </div>

              <Button className="w-full rounded-xl" disabled={busy} onClick={() => void save()}>
                {t("save")}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <RecipeSheet
        serviceTypeId={recipeFor?.id ?? null}
        serviceLabel={recipeFor ? serviceLabel(recipeFor) : ""}
        onClose={() => setRecipeFor(null)}
      />
    </AppShell>
  );
}

function cleanText(value: LocalizedText): LocalizedText {
  const out: LocalizedText = {};
  for (const [k, v] of Object.entries(value)) {
    const trimmed = (v ?? "").trim();
    if (trimmed) out[k as Lang] = trimmed;
  }
  return out;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>


  );
}
