import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  BookOpen,
  ConciergeBell,
  History,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  UserCog,
  UserRound,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { LANGUAGES, t, useLang, type Lang } from "@/lib/i18n";
import { CURRENCIES, useCurrency, type Currency } from "@/lib/currency";
import { roleLabel } from "@/lib/roles";
import type { PermissionKey } from "@/lib/permissions";
import { useIsPreviewHost } from "@/lib/preview-orders";

type MenuLink = { to: string; label: string; icon: typeof Banknote; permission?: PermissionKey };

/**
 * Mobile-only overflow menu. Keeps the phone header down to title + tasks +
 * this button, while every secondary destination and preference stays one tap
 * away. Permission checks mirror the routes and the database.
 */
export function MobileMenu({ variant = "icon" }: { variant?: "icon" | "tab" }) {
  const [open, setOpen] = useState(false);
  const { profile, role, can } = useAuth();
  const { lang, setLang } = useLang();
  const { currency, setCurrency } = useCurrency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canDashboard = can("activity_view");
  const previewHost = useIsPreviewHost();

  const links: MenuLink[] = ([
    // Customers moves into the More sheet for Dashboard-capable users because
    // Calendar takes its bottom-nav slot. Calendar is always in the bar.
    canDashboard ? { to: "/customers", label: t("navCustomers"), icon: Users } : null,
    { to: "/services", label: t("navServices"), icon: ConciergeBell },
    // Dashboard is already in the bottom bar for Dashboard-capable users.
    canDashboard ? null : ({ to: "/dashboard", label: t("navDashboard"), icon: LayoutDashboard, permission: "activity_view" } as MenuLink),
    { to: "/cash", label: t("navCash"), icon: Banknote, permission: "cash_reconcile" },
    { to: "/activity", label: t("navActivity"), icon: History, permission: "activity_view" },
    { to: "/catalogue", label: t("navCatalogue"), icon: BookOpen, permission: "users_manage" },
    { to: "/users", label: t("navUsers"), icon: UserCog, permission: "users_manage" },
    // Prototype board: preview hosts only.
    previewHost
      ? ({ to: "/food-orders", label: t("navFoodOrders"), icon: UtensilsCrossed, permission: "requests_manage" } as MenuLink)
      : null,
  ] as (MenuLink | null)[]).filter((l): l is MenuLink => Boolean(l) && (!l!.permission || can(l!.permission)));

  async function signOut() {
    setOpen(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <>
      {variant === "tab" ? (
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-[46px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium leading-tight text-muted-foreground"
        >
          <MoreHorizontal className="size-[18px]" />
          <span className="max-w-full truncate">{t("navMore")}</span>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label={t("menuTitle")}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground active:bg-muted"
        >
          <MoreHorizontal className="size-5" />
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl p-4">
          <SheetHeader className="text-start">
            <SheetTitle className="text-base">{t("menuTitle")}</SheetTitle>
          </SheetHeader>

          <Link
            to="/account"
            onClick={() => setOpen(false)}
            className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 active:bg-muted"
          >
            <UserRound className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {profile?.full_name ?? t("account")}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {profile ? roleLabel(profile, role) : t("account")}
              </span>
            </span>
          </Link>

          <div className="mt-3 grid gap-2">
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 text-sm">
              <span className="text-muted-foreground">{t("language")}</span>
              <select
                aria-label={t("language")}
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="bg-transparent text-sm font-medium outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 text-sm">
              <span className="text-muted-foreground">{t("currency")}</span>
              <select
                aria-label={t("currency")}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="bg-transparent text-sm font-medium outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.symbol}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {links.length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
              {links.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center gap-3 border-b border-border px-3 py-2 text-sm font-medium last:border-b-0 active:bg-muted"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{l.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          <button
            onClick={signOut}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-destructive active:bg-muted"
          >
            <LogOut className="size-4" /> {t("signOut")}
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}
