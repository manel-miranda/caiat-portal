import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import type { AppRole, OperationalPermission } from "@/lib/permissions";

export type ManagedUser = {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  active: boolean;
  role: AppRole;
  overrides: Record<string, boolean>;
};

export const managedUsersQuery = queryOptions({
  queryKey: ["managed-users"],
  queryFn: async (): Promise<ManagedUser[]> => {
    const [{ data: profiles, error: e1 }, { data: roles, error: e2 }, { data: perms, error: e3 }] =
      await Promise.all([
        supabase.from("profiles").select("id, username, full_name, phone, active").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_permissions").select("user_id, permission, granted"),
      ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;

    return (profiles ?? []).map((p) => {
      const own = (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string);
      const role: AppRole = own.includes("admin")
        ? "admin"
        : own.includes("supervisor")
          ? "supervisor"
          : "staff";
      const overrides: Record<string, boolean> = {};
      for (const row of perms ?? []) if (row.user_id === p.id) overrides[row.permission] = row.granted;
      return {
        id: p.id,
        username: p.username,
        full_name: p.full_name,
        phone: p.phone,
        active: p.active ?? true,
        role,
        overrides,
      };
    });
  },
});

function userError(message: string): string {
  if (message.includes("LAST_ADMIN")) return t("lastAdminBlocked");
  if (message.includes("PERMISSION_DENIED") || message.includes("NOT_GRANTABLE")) {
    return t("permissionDenied");
  }
  return message;
}

export async function setUserRole(userId: string, role: AppRole) {
  const { error } = await supabase.rpc("set_user_role", { p_user_id: userId, p_role: role });
  if (error) throw new Error(userError(error.message));
}

/** `granted === null` removes the override so the role default applies again. */
export async function setUserPermission(
  userId: string,
  key: OperationalPermission,
  granted: boolean | null,
) {
  const { error } = await supabase.rpc("set_user_permission", {
    p_user_id: userId,
    p_key: key,
    // Omitting the flag clears the override so the role default applies again.
    ...(granted === null ? {} : { p_granted: granted }),
  });
  if (error) throw new Error(userError(error.message));
}

export async function setUserActive(userId: string, active: boolean) {
  const { error } = await supabase.rpc("set_user_active", { p_user_id: userId, p_active: active });
  if (error) throw new Error(userError(error.message));
}

export function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin);
}

export function generatePin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String((buf[0] ?? 0) % 1_000_000).padStart(6, "0");
}
