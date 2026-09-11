import { t } from "./i18n";
import type { AppRole } from "./permissions";

/**
 * Display-only job titles. Permissions come from the effective-permission model;
 * these labels never grant or restrict anything.
 */
const OWNER_USERNAMES = new Set(["bernardo", "cristiana"]);

export function roleLabel(
  profile: { username?: string | null } | null | undefined,
  role: AppRole,
): string {
  const username = (profile?.username ?? "").trim().toLowerCase();
  if (OWNER_USERNAMES.has(username)) return t("roleOwner");
  if (role === "admin") return t("roleAdmin");
  if (role === "supervisor") return t("roleSupervisor");
  return t("roleStaff");
}
