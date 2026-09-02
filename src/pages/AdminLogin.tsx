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
  return (
    <div className="login-page premium-login-page admin-login-page">
      <div className="login-orb orb-a" /><div className="login-orb orb-b" />
      <div className="admin-login-card">
        <div className="login-logo admin-login-logo">PG</div>
        <p className="eyebrow">SECURE CONTROL CENTER</p>
        <h1>Notes Admin</h1>
        <p className="muted">Manage PDFs, folders, paid student lists and access from one protected dashboard.</p>
        <form className="form-stack premium-form" onSubmit={submit}>
          <label><span>Admin Email</span><div className="input-wrap"><i>@</i><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" /></div></label>
          <label><span>Password</span><div className="input-wrap"><i>◆</i><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" /></div></label>
          <button className="primary-btn premium-primary" disabled={loading}>{loading ? "Signing in…" : "Enter Control Center →"}</button>
        </form>
        <div className="admin-login-note">Same credentials as the main Path Genius Academy admin panel.</div>
      </div>
    </div>
  );
}
