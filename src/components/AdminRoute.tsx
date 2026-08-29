import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function AdminRoute() {
  const { loading, session, profile } = useAuth();
  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (!session || profile?.role !== "admin") return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
