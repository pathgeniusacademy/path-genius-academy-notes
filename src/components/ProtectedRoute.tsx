import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

function BrandedLoader() {
  return <div className="center-screen branded-loader"><div className="loader-logo">PG</div><div className="spinner" /><strong>Path Genius Notes</strong><span>Opening your secure notes vault…</span></div>;
}

export default function ProtectedRoute() {
  const { loading, session, profile } = useAuth();
  const location = useLocation();
  if (loading) return <BrandedLoader />;
  if (!session || !profile || profile.role !== "student") {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}
