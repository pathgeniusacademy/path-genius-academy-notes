import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { mainSupabase } from "@/lib/mainSupabase";
import { loginIdToAuthEmail } from "@/lib/loginId";

export type MainProfile = {
  id: string;
  role: "admin" | "student";
  full_name: string;
  login_id: string;
  mobile: string | null;
  optional_email?: string | null;
  is_active: boolean;
};

type AuthValue = {
  session: Session | null;
  profile: MainProfile | null;
  loading: boolean;
  studentLogin: (loginId: string, password: string) => Promise<string | null>;
  adminLogin: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MainProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await mainSupabase
      .from("profiles")
      .select("id,role,full_name,login_id,mobile,optional_email,is_active")
      .eq("id", userId)
      .single();
    if (error) {
      setProfile(null);
      return null;
    }
    const p = data as MainProfile;
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    let alive = true;
    mainSupabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: listener } = mainSupabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) await loadProfile(next.user.id);
      else setProfile(null);
      setLoading(false);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  async function studentLogin(loginId: string, password: string) {
    setLoading(true);
    const { data, error } = await mainSupabase.auth.signInWithPassword({
      email: loginIdToAuthEmail(loginId),
      password,
    });
    if (error || !data.user) {
      setLoading(false);
      return "Invalid Login ID or password.";
    }
    const p = await loadProfile(data.user.id);
    if (!p || p.role !== "student" || !p.is_active) {
      await mainSupabase.auth.signOut();
      setLoading(false);
      return "This student account is not active.";
    }
    setLoading(false);
    return null;
  }

  async function adminLogin(email: string, password: string) {
    setLoading(true);
    const { data, error } = await mainSupabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      return "Invalid admin credentials.";
    }
    const p = await loadProfile(data.user.id);
    if (!p || p.role !== "admin") {
      await mainSupabase.auth.signOut();
      setLoading(false);
      return "This account does not have admin access.";
    }
    setLoading(false);
    return null;
  }

  async function signOut() {
    await mainSupabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, studentLogin, adminLogin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
