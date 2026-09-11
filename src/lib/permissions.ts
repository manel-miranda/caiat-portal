import type { TranslationKey } from "./i18n";

/**
 * Effective-permission model. Roles supply defaults; per-user overrides stored
 * in `user_permissions` can grant or revoke an operational key. The three
 * security-sensitive keys are admin-only and are never grantable — the database
 * function `has_permission` enforces exactly the same rules server-side, this
 * module only mirrors them so the UI can hide what the server would refuse.
 */
export const OPERATIONAL_PERMISSIONS = [
  "reservations_manage",
  "payments_manage",
  "checkout_override",
  "cash_reconcile",
  "customers_manage",
  "guest_access_manage",
  "requests_manage",
  "activity_view",
] as const;

export const PROTECTED_PERMISSIONS = ["users_manage", "roles_manage", "pin_reset"] as const;

export type OperationalPermission = (typeof OPERATIONAL_PERMISSIONS)[number];
export type PermissionKey = OperationalPermission | (typeof PROTECTED_PERMISSIONS)[number];

export type AppRole = "admin" | "supervisor" | "staff";

const SUPERVISOR_DEFAULTS: OperationalPermission[] = [...OPERATIONAL_PERMISSIONS];
const STAFF_DEFAULTS: OperationalPermission[] = ["payments_manage", "requests_manage"];

export function roleDefault(role: AppRole, key: PermissionKey): boolean {
  if (role === "admin") return true;
  if (PROTECTED_PERMISSIONS.includes(key as (typeof PROTECTED_PERMISSIONS)[number])) return false;
  const list = role === "supervisor" ? SUPERVISOR_DEFAULTS : STAFF_DEFAULTS;
  return list.includes(key as OperationalPermission);
}

/** Role defaults with per-user overrides applied (admin keeps everything). */
export function effectivePermission(
  role: AppRole,
  overrides: Record<string, boolean>,
  key: PermissionKey,
  active = true,
): boolean {
  if (!active) return false;
  if (PROTECTED_PERMISSIONS.includes(key as (typeof PROTECTED_PERMISSIONS)[number])) {
    return role === "admin";
  }
  if (role === "admin") return true;
  const override = overrides[key];
  if (typeof override === "boolean") return override;
  return roleDefault(role, key);
}

export const PERMISSION_LABEL_KEYS: Record<OperationalPermission, TranslationKey> = {
  reservations_manage: "permReservations",
  payments_manage: "permPayments",
  checkout_override: "permCheckoutOverride",
  cash_reconcile: "permCash",
  customers_manage: "permCustomers",
  guest_access_manage: "permGuestAccess",
  requests_manage: "permRequests",
  activity_view: "permActivity",
};
