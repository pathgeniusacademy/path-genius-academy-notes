import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";

export default function AdminLogin() {
  const { adminLogin, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const error = await adminLogin(email.trim(), password);
    if (error) return toast.error(error);
    navigate("/admin", { replace: true });
  }
  return <div className="login-page"><div className="login-card"><div className="login-logo">PG</div><p className="eyebrow">NOTES ADMIN</p><h1>Admin Login</h1><p className="muted">Use the same admin email and password as the main Path Genius Academy admin panel.</p><form className="form-stack" onSubmit={submit}><label>Admin Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="primary-btn" disabled={loading}>{loading ? "Signing in…" : "Admin Login"}</button></form></div></div>;
}
