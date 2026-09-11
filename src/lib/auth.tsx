import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { effectivePermission, type AppRole, type PermissionKey } from "./permissions";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
  active?: boolean | null;
};

type AuthValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole;
  isAdmin: boolean;
  isSupervisor: boolean;
  /** Effective permission check, mirroring the database `has_permission`. */
  can: (key: PermissionKey) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  loading: true,
  session: null,
  user: null,
  profile: null,
  role: "staff",
  isAdmin: false,
  isSupervisor: false,
  can: () => false,
  refresh: async () => {},
});

/** Auth credentials need an email; staff sign in with a username + PIN. */
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@caiat.local`;
}

function pickRole(roles: { role: string }[] | null | undefined): AppRole {
  const set = new Set((roles ?? []).map((r) => r.role));
  if (set.has("admin")) return "admin";
  if (set.has("supervisor")) return "supervisor";
  return "staff";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole>("staff");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  async function loadIdentity(userId: string | undefined) {
    if (!userId) {
      setProfile(null);
      setRole("staff");
      setOverrides({});
      return;
    }
    const [{ data: p }, { data: roles }, { data: perms }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, full_name, phone, active")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_permissions").select("permission, granted").eq("user_id", userId),
    ]);
    setProfile((p as Profile) ?? null);
    setRole(pickRole(roles));
    const map: Record<string, boolean> = {};
    for (const row of perms ?? []) map[row.permission] = row.granted;
    setOverrides(map);
  }

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      void loadIdentity(next?.user?.id).then(() => setLoading(false));
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadIdentity(data.session?.user?.id);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // A role or permission change by an admin must take effect immediately, with
  // no sign-out: watch only the rows that describe the signed-in user.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`identity-${userId}`);
    const reload = () => {
      void loadIdentity(userId);
    };
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${userId}` }, reload)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_permissions", filter: `user_id=eq.${userId}` },
        reload,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const isActive = profile?.active !== false;
  const value: AuthValue = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    role,
    isAdmin: role === "admin",
    isSupervisor: role === "supervisor",
    can: (key) => effectivePermission(role, overrides, key, isActive),
    refresh: async () => loadIdentity(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
