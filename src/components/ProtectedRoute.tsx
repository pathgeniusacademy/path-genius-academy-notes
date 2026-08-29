import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute() {
  const { loading, session, profile } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (!session || !profile || profile.role !== "student") {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}
