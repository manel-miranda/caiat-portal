import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only user administration. Every handler re-checks the caller's admin
 * role with the caller's own token before touching the Auth Admin API, and the
 * privileged client is imported inside the handler so it never reaches the
 * browser bundle. PINs are Supabase passwords: they are written, never read.
 */

const pinSchema = z.string().regex(/^\d{6}$/, "PIN_INVALID");

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("PERMISSION_DENIED");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function audit(
  actorId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
) {
  const db = await admin();
  await db.from("audit_log").insert({
    user_id: actorId,
    action,
    entity_type: "user",
    entity_id: entityId,
    details,
  });
}

export const resetUserPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid(), pin: pinSchema }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(data.userId, { password: data.pin });
    if (error) throw new Error(error.message);
    // The PIN itself is never logged.
    await audit(context.userId, "pin.reset", data.userId, {});
    return { ok: true };
  });

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        username: z
          .string()
          .trim()
          .min(2)
          .max(32)
          .regex(/^[a-z0-9._-]+$/i, "USERNAME_INVALID"),
        fullName: z.string().trim().min(2).max(80),
        pin: pinSchema,
        role: z.enum(["staff", "supervisor", "admin"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const db = await admin();
    const username = data.username.toLowerCase();

    const { data: existing } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) throw new Error("USERNAME_TAKEN");

    const { data: created, error } = await db.auth.admin.createUser({
      email: `${username}@caiat.local`,
      password: data.pin,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "USER_CREATE_FAILED");

    const userId = created.user.id;
    await db.from("profiles").insert({
      id: userId,
      username,
      full_name: data.fullName,
      active: true,
    });
    await db.from("user_roles").insert({ user_id: userId, role: data.role });
    await audit(context.userId, "user.created", userId, { username, role: data.role });
    return { id: userId };
  });

export const setUserActiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    // The RPC keeps the last-admin and self-deactivation guards plus the audit row.
    const { error } = await context.supabase.rpc("set_user_active", {
      p_user_id: data.userId,
      p_active: data.active,
    });
    if (error) throw new Error(error.message);
    const db = await admin();
    // Blocking the Auth account is what actually stops a sign-in.
    await db.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    return { ok: true };
  });
