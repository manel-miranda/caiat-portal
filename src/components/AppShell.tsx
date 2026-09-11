import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BedDouble,
  Bell,
  LogOut,
  LayoutDashboard,
  Banknote,
  ConciergeBell,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { PermissionKey } from "@/lib/permissions";
import { OfflineBanner } from "@/components/OfflineBanner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { TaskBell } from "@/components/TaskBell";
import { useRealtimeSync } from "@/lib/realtime";
import type { ReactNode } from "react";

type NavItem = { to: string; label: string; icon: typeof BedDouble; permission?: PermissionKey };

// Only routes that exist are listed. Hiding an entry is convenience only — the
// routes and the database both re-check the permission.
function navItems(): NavItem[] {
  return [
    { to: "/home", label: t("navRooms"), icon: BedDouble },
    { to: "/requests", label: t("navRequests"), icon: Bell },
    { to: "/customers", label: t("navCustomers"), icon: Users },
    { to: "/services", label: t("navServices"), icon: ConciergeBell },
    {
      to: "/dashboard",
      label: t("navDashboard"),
      icon: LayoutDashboard,
      permission: "activity_view",
    },
    { to: "/cash", label: t("navCash"), icon: Banknote, permission: "cash_reconcile" },
    // Activity lives behind the Dashboard so the bottom bar stays readable at 390px.
  ];
}

export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const { profile, role, can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navItems().filter((i) => !i.permission || can(i.permission));
  // One shared live-updates channel for every authenticated screen.
  useRealtimeSync();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-dvh bg-background pb-20 sm:pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight sm:text-lg">{title ?? t("appName")}</p>
            <Link
              to="/account"
              className="block truncate text-xs text-muted-foreground underline-offset-2 active:underline"
            >
              {profile?.full_name ?? ""}
              {profile ? ` · ${roleLabel(profile, role)}` : ""}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LanguageSwitcher />
            <CurrencySwitcher />
            <TaskBell />

            <button
              onClick={signOut}
              aria-label={t("signOut")}
              className="flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11 border border-border bg-card text-muted-foreground transition-colors active:bg-muted"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <OfflineBanner />

      <main className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-4 sm:py-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {items.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium leading-tight transition-colors sm:min-h-[56px] sm:gap-1 sm:py-2.5 sm:text-[11px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5 sm:size-6", active && "stroke-[2.4]")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
