import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

// Auth listeners must stay synchronous: querying Supabase inside an awaited
// onAuthStateChange callback can deadlock the client's refresh lock.
export function usePersistentAuth<P extends { id: string }>(client: SupabaseClient, columns: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<P | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const authRevision = useRef(0);
  const refreshProfile = useCallback(async () => { setRevision(n => n + 1); }, []);

  const restore = useCallback(async () => {
    const version = authRevision.current;
    try {
      const { data, error } = await client.auth.getSession();
      if (version !== authRevision.current) return;
      if (error) { setSessionError("Could not restore your session. Check your connection and retry."); return; }
      setSession(data.session); setSessionError(null);
    } catch { setSessionError("Could not restore your session. Check your connection and retry."); }
    finally { setInitialized(true); }
  }, [client]);

  useEffect(() => {
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      authRevision.current++;
      setSession(next); setInitialized(true); setSessionError(null);
      if (!next) { setProfile(null); setProfileError(null); }
    });
    void restore();
    const resume = () => { if (!document.hidden) { void restore(); void refreshProfile(); } };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => { authRevision.current++; listener.subscription.unsubscribe(); document.removeEventListener("visibilitychange", resume); window.removeEventListener("pageshow", resume); };
  }, [client, restore, refreshProfile]);

  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    setProfileError(null);
    if (!userId) { setProfile(null); return; }
    // Keep a valid session on network/profile failures; show Retry, not a login loop.
    void (async () => {
      try {
        const { data, error } = await client.from("profiles").select(columns).eq("id", userId).single();
        if (!active) return;
        if (error || !data) { setProfile(null); setProfileError("Could not load your account. Check your connection or contact support, then retry."); return; }
        setProfile(data as unknown as P);
      } catch { if (active) { setProfile(null); setProfileError("Could not load your account. Check your connection and retry."); } }
    })();
    return () => { active = false; };
  }, [client, columns, userId, revision]);

  const currentProfile = profile?.id === userId ? profile : null;
  const retrySession = async () => { setSessionError(null); setProfileError(null); await restore(); await refreshProfile(); };
  return { session, profile: currentProfile, initialized,
    loading: !initialized || (!!session && !currentProfile && !profileError && !sessionError),
    authError: sessionError || profileError, retrySession, refreshProfile };
}
