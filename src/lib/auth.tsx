import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  phone: string | null;
};

type AuthValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  loading: true,
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  refresh: async () => {},
});

/** Auth credentials need an email; staff sign in with a username + PIN. */
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@caiat.local`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadIdentity(userId: string | undefined) {
    if (!userId) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    const [{ data: p }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, username, full_name, phone").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((p as Profile) ?? null);
    setIsAdmin(Boolean(roles?.some((r) => r.role === "admin")));
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

  const value: AuthValue = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    isAdmin,
    refresh: async () => loadIdentity(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
