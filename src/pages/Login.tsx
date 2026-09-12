import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { MAIN_SITE_URL } from "@/lib/config";
import SessionProblem from "@/components/SessionProblem";
export default function Login() {
  const { session, profile, loading, authError } = useAuth();
  const [params] = useSearchParams(); const navigate = useNavigate();
  const requested = params.get("next") || "/";
  const next = /^\/(?!\/)/.test(requested) && !requested.includes("\\") ? requested : "/";
  useEffect(() => {
    if (loading || authError) return;
    if (session) {
      if (profile?.role !== "student") { window.location.replace(`${MAIN_SITE_URL}/${profile?.role === "admin" ? "admin/dashboard" : "dashboard"}`); return; }
      navigate(next, { replace: true }); return;
    }
    window.location.replace(`${MAIN_SITE_URL}/login?next=${encodeURIComponent(`/notes${next}`)}`);
  }, [session, profile, loading, authError, next, navigate]);
  if (authError) return <SessionProblem />;
  return <div className="center-screen"><strong>Opening Path Genius…</strong></div>;
}
