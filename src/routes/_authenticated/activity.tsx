import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { requirePermission } from "@/lib/admin-guard";
import { auditQuery, profilesQuery } from "@/lib/queries";
import { mad, shortDateTime } from "@/lib/format";
import { actionLabel, methodLabel, t } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/activity")({
  beforeLoad: requirePermission("activity_view"),
  head: () => ({ meta: [{ title: "Activity — Caiat Operations" }] }),
  component: ActivityPage,
});

function detailLine(details: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof details["label"] === "string") parts.push(details["label"]);
  if (details["amount"] != null) parts.push(mad(Number(details["amount"])));
  if (details["total"] != null) parts.push(mad(Number(details["total"])));
  if (typeof details["method"] === "string") parts.push(methodLabel(String(details["method"])));
  if (details["difference"] != null)
    parts.push(`${t("difference")} ${mad(Number(details["difference"]))}`);
  if (details["business_date"] != null) parts.push(String(details["business_date"]));
  return parts.join(" · ");
}

function stayIdOf(row: {
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
}) {
  if (typeof row.details["stay_id"] === "string") return row.details["stay_id"];
  if (row.entity_type === "stay" && row.entity_id) return row.entity_id;
  return null;
}

function ActivityPage() {
  const audit = useQuery(auditQuery);
  const profiles = useQuery(profilesQuery);

  function name(userId: string | null) {
    if (!userId) return "—";
    return (profiles.data ?? []).find((p) => p.id === userId)?.full_name ?? "—";
  }

  if (audit.isError) {
    return (
      <AppShell title={t("activity")}>
        <p className="surface-card p-3 sm:p-4 text-sm text-destructive">
          {(audit.error as Error).message}
        </p>
      </AppShell>
    );
  }

  if (audit.isLoading) {
    return (
      <AppShell title={t("activity")}>
        <p className="surface-card p-3 sm:p-4 text-sm text-muted-foreground">{t("loading")}</p>
      </AppShell>
    );
  }

  const rows = audit.data ?? [];

  return (
    <AppShell title={t("activity")}>
      <div className="surface-card divide-y divide-border">
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("noResults")}</p>
        ) : (
          rows.map((row) => {
            const stayId = stayIdOf(row);
            const detail = detailLine(row.details ?? {});
            const body = (
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{actionLabel(row.action)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {name(row.user_id)}
                    {detail ? ` · ${detail}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {shortDateTime(row.created_at)}
                </span>
              </div>
            );
            return stayId ? (
              <Link
                key={row.id}
                to="/stays/$id"
                params={{ id: stayId }}
                className="block active:bg-muted"
              >
                {body}
              </Link>
            ) : (
              <div key={row.id}>{body}</div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
