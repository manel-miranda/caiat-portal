import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { customersQuery, matchesCustomer, countedStays, isReturning } from "@/lib/customers";
import { shortDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Caiat Operations" },
      { name: "description", content: "Guest history and returning-customer records for Caiat." },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { can } = useAuth();
  const customers = useQuery(customersQuery);
  const [term, setTerm] = useState("");

  const list = useMemo(() => {
    const rows = (customers.data ?? []).filter((c) => matchesCustomer(c, term));
    return rows.sort((a, b) => {
      const la = lastStayDate(a.stays) ?? "";
      const lb = lastStayDate(b.stays) ?? "";
      return lb.localeCompare(la) || a.full_name.localeCompare(b.full_name);
    });
  }, [customers.data, term]);

  return (
    <AppShell title={t("customers")}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            className="tap-target ps-9 text-base"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("customerSearch")}
            aria-label={t("customerSearch")}
          />
        </div>
        {/* Creating a booking stays open to every operational user. */}
        <Link
          to="/stays/new"
          aria-label={t("newStay")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <UserPlus className="size-4" />
        </Link>
      </div>

      {customers.isLoading ? <p className="mt-6 text-sm text-muted-foreground">{t("loading")}</p> : null}
      {customers.error ? (
        <p className="mt-6 text-sm text-destructive">{(customers.error as Error).message}</p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {list.map((c) => {
          const stays = countedStays(c);
          const last = lastStayDate(c.stays);
          return (
            <li key={c.id}>
              <Link
                to="/customers/$id"
                params={{ id: c.id }}
                className="surface-card flex items-center justify-between gap-3 p-4 active:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <span
                    className={
                      isReturning(c)
                        ? "rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
                        : "rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                    }
                  >
                    {isReturning(c) ? t("returningCustomer") : t("newCustomer")}
                  </span>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {stays.length === 1 ? t("oneStay") : t("stayCount", { count: stays.length })}
                    {last ? ` · ${shortDate(last)}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {!customers.isLoading && list.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("noCustomers")}</p>
      ) : null}
    </AppShell>
  );
}

export function lastStayDate(stays: { check_in: string; confirmation_status: string }[]): string | null {
  const dates = (stays ?? [])
    .filter((s) => s.confirmation_status !== "rejected")
    .map((s) => s.check_in)
    .sort();
  return dates.length ? (dates[dates.length - 1] ?? null) : null;
}
