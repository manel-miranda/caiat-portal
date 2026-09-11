import { t } from "./i18n";

/**
 * Display-only job titles. Permissions still come from user_roles (admin/staff);
 * these labels never grant or restrict anything.
 */
const OWNER_USERNAMES = new Set(["bernardo", "cristiana"]);

export function roleLabel(
  profile: { username?: string | null } | null | undefined,
  isAdmin: boolean,
): string {
  const username = (profile?.username ?? "").trim().toLowerCase();
  if (OWNER_USERNAMES.has(username)) return t("roleOwner");
  if (isAdmin) return t("roleAdmin");
  return t("roleStaff");
}
