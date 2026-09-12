import { createContext, useContext, useState, type ReactNode } from "react";
import { mainSupabase } from "@/lib/mainSupabase";
import { loginIdToAuthEmail } from "@/lib/loginId";
import { usePersistentAuth } from "@/lib/usePersistentAuth";
export type MainProfile = { id: string; role: "admin" | "student"; full_name: string; login_id: string; mobile: string | null; optional_email?: string | null; is_active: boolean; };
function useAccount() {
  const state = usePersistentAuth<MainProfile>(mainSupabase, "id,role,full_name,login_id,mobile,optional_email,is_active");
  const [busy, setBusy] = useState(false);
  async function login(email: string, password: string, role: "admin" | "student") {
    setBusy(true);
    try {
      const { data, error } = await mainSupabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) return "Invalid login details. Please try again.";
      const { data: profile, error: failure } = await mainSupabase.from("profiles").select("role,is_active").eq("id", data.user.id).single();
      if (failure) return "Signed in, but your account could not load. Please retry.";
      if (!profile || profile.role !== role || !profile.is_active) { await mainSupabase.auth.signOut(); return "This account is not active or cannot access this area."; }
      return null;
    } catch { return "Could not sign in. Check your connection and try again."; }
    finally { setBusy(false); }
  }
  return { ...state, loading: state.loading || busy,
    studentLogin: (id: string, password: string) => login(loginIdToAuthEmail(id), password, "student"),
    adminLogin: (email: string, password: string) => login(email, password, "admin"),
    signOut: async () => { const { error } = await mainSupabase.auth.signOut(); if (error) throw error; },
  };
}
const AuthContext = createContext<ReturnType<typeof useAccount> | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) { const state = useAccount(); return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>; }
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside AuthProvider"); return value; }
