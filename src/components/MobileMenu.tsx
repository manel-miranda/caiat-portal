import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  BookOpen,
  Boxes,
  ConciergeBell,
  History,
  LogOut,
  MoreHorizontal,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { LANGUAGES, t, useLang, type Lang } from "@/lib/i18n";
import { CURRENCIES, useCurrency, type Currency } from "@/lib/currency";
import { roleLabel } from "@/lib/roles";
import type { PermissionKey } from "@/lib/permissions";

type MenuLink = { to: string; label: string; icon: typeof Banknote; permission?: PermissionKey };

/**
 * Shared secondary menu. Phones include settings and management destinations;
 * desktop uses the same permission-filtered destination list from its nav.
 */
export function MobileMenu({ variant = "icon" }: { variant?: "icon" | "tab" | "manage" }) {
  const [open, setOpen] = useState(false);
  const { profile, role, can } = useAuth();
  const { lang, setLang } = useLang();
  const { currency, setCurrency } = useCurrency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const desktopManage = variant === "manage";
  const canManage = role === "supervisor" || role === "admin";

  const links: MenuLink[] = (
    canManage
      ? ([
          { to: "/customers", label: t("navCustomers"), icon: Users },
          { to: "/services", label: t("navServices"), icon: ConciergeBell },
          { to: "/stock", label: t("navStock"), icon: Boxes },
          { to: "/cash", label: t("navCash"), icon: Banknote, permission: "cash_reconcile" },
          { to: "/activity", label: t("navActivity"), icon: History, permission: "activity_view" },
          {
            to: "/catalogue",
            label: t("navCatalogue"),
            icon: BookOpen,
            permission: "users_manage",
          },
          { to: "/users", label: t("navUsers"), icon: UserCog, permission: "users_manage" },
        ] as MenuLink[])
      : []
  ).filter((link) => !link.permission || can(link.permission));

  if (desktopManage && links.length === 0) return null;

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
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(true)}
          className="flex min-h-[46px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium leading-tight text-muted-foreground"
        >
          <MoreHorizontal className="size-[18px]" />
          <span className="max-w-full truncate">{t("navMore")}</span>
        </Button>
      ) : desktopManage ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(true)}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-medium leading-tight text-muted-foreground"
        >
          <MoreHorizontal className="size-6" />
          <span className="max-w-full truncate">{t("manage")}</span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label={t("menuTitle")}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground active:bg-muted"
        >
          <MoreHorizontal className="size-5" />
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={desktopManage ? "right" : "bottom"}
          className={
            desktopManage
              ? "overflow-y-auto p-4"
              : "max-h-[85dvh] overflow-y-auto rounded-t-2xl p-4"
          }
        >
          <SheetHeader className="text-start">
            <SheetTitle className="text-base">
              {desktopManage ? t("manage") : t("menuTitle")}
            </SheetTitle>
          </SheetHeader>

          {!desktopManage ? (
            <section className="mt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("settings")}
              </p>
              <Link
                to="/account"
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 active:bg-muted"
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

              <div className="mt-2 grid gap-2">
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

              <Button
                type="button"
                variant="outline"
                onClick={signOut}
                className="mt-2 min-h-11 w-full rounded-xl text-destructive"
              >
                <LogOut className="size-4" /> {t("signOut")}
              </Button>
            </section>
          ) : null}

          {links.length > 0 ? (
            <section className={desktopManage ? "mt-3" : "mt-5"}>
              {!desktopManage ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("manage")}
                </p>
              ) : null}
              <div className="overflow-hidden rounded-xl border border-border bg-card">
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
            </section>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
