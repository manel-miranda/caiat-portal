import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BedDouble,
  Bell,
  CalendarDays,
  LogOut,
  LayoutDashboard,
  Banknote,
  BookOpen,
  ConciergeBell,
  Users,
  Boxes,
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
import { MobileMenu } from "@/components/MobileMenu";
import { useRealtimeSync } from "@/lib/realtime";
import { useIsPreviewHost } from "@/lib/preview-orders";
import type { ReactNode } from "react";

type NavItem = { to: string; label: string; icon: typeof BedDouble; permission?: PermissionKey };

// Only routes that exist are listed. Hiding an entry is convenience only — the
// routes and the database both re-check the permission.
function desktopNavItems(previewHost: boolean): NavItem[] {
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
    // Catalogue is admin-only; `users_manage` is admin-only by definition.
    { to: "/catalogue", label: t("navCatalogue"), icon: BookOpen, permission: "users_manage" },
    // Preview-only stock prototype; hidden on the live hosts.
    ...(previewHost ? [{ to: "/stock", label: t("navStock"), icon: Boxes } as NavItem] : []),
  ];
}

// Phones keep five slots only; everything else moves into the More sheet.
// Dashboard-capable users see Dashboard + Calendar in the bar and find
// Customers inside More; everyone else keeps Customers + Calendar.
function mobileNavItems(canDashboard: boolean): NavItem[] {
  return [
    { to: "/home", label: t("navRooms"), icon: BedDouble },
    { to: "/requests", label: t("navRequests"), icon: Bell },
    canDashboard
      ? { to: "/dashboard", label: t("navDashboard"), icon: LayoutDashboard }
      : { to: "/customers", label: t("navCustomers"), icon: Users },
    { to: "/calendar", label: t("navCalendar"), icon: CalendarDays },
  ];
}

export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const { profile, role, can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const previewHost = useIsPreviewHost();
  const desktopItems = desktopNavItems(previewHost).filter((i) => !i.permission || can(i.permission));
  const mobileItems = mobileNavItems(can("activity_view"));
  // One shared live-updates channel for every authenticated screen.
  useRealtimeSync();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-dvh bg-background pb-[4.5rem] sm:pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold tracking-tight sm:text-lg">
              {title ?? t("appName")}
            </p>
            <Link
              to="/account"
              className="hidden truncate text-xs text-muted-foreground underline-offset-2 active:underline sm:block"
            >
              {profile?.full_name ?? ""}
              {profile ? ` · ${roleLabel(profile, role)}` : ""}
            </Link>
          </div>

          {/* Phone: tasks + one overflow control, so the title keeps its width. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
            <TaskBell />
            <MobileMenu />
          </div>

          {/* Desktop keeps the full control row. */}
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <LanguageSwitcher />
            <CurrencySwitcher />
            <TaskBell />
            <button
              onClick={signOut}
              aria-label={t("signOut")}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors active:bg-muted"
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
          {/* Mobile: four destinations + More. */}
          <div className="flex flex-1 items-stretch justify-around sm:hidden">
            {mobileItems.map((item) => (
              <NavTab key={item.to} item={item} pathname={pathname} />
            ))}
            <MobileMenu variant="tab" />
          </div>

          {/* Desktop keeps the wider destination row. */}
          <div className="hidden flex-1 items-stretch justify-around sm:flex">
            {desktopItems.map((item) => (
              <NavTab key={item.to} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}

function NavTab({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex min-h-[46px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium leading-tight transition-colors sm:min-h-[56px] sm:gap-1 sm:py-2.5 sm:text-[11px]",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-[18px] sm:size-6", active && "stroke-[2.4]")} />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}
