import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ClassNotes from "@/pages/ClassNotes";
import AdminLogin from "@/pages/AdminLogin";
import AdminNotes from "@/pages/AdminNotes";

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/class/:classId" element={<ClassNotes />} />
      </Route>
    </Route>
    <Route element={<AdminRoute />}><Route path="/admin" element={<AdminNotes />} /></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
