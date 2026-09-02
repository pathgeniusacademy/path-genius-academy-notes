import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

function BrandedLoader() {
  return <div className="center-screen branded-loader"><div className="loader-logo">PG</div><div className="spinner" /><strong>Path Genius Notes</strong><span>Opening secure admin controls…</span></div>;
}

export default function AdminRoute() {
  const { loading, session, profile } = useAuth();
  if (loading) return <BrandedLoader />;
  if (!session || profile?.role !== "admin") return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
