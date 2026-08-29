import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { MAIN_SITE_URL } from "@/lib/config";

export default function Login() {
  const { studentLogin, loading } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") || "/";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const error = await studentLogin(loginId.trim(), password);
    if (error) return toast.error(error);
    navigate(next, { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">PG</div>
        <p className="eyebrow">PATH GENIUS ACADEMY</p>
        <h1>Class Notes</h1>
        <p className="muted">Use the same Student Login ID and password that you use in the main Path Genius Academy app.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Student Login ID<input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="PGA1001" autoCapitalize="characters" /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" /></label>
          <button className="primary-btn" disabled={loading}>{loading ? "Signing in…" : "Login to Notes"}</button>
        </form>
        <div className="login-footer"><a href={MAIN_SITE_URL}>← Back to Main App</a><Link to="/admin/login">Admin</Link></div>
      </div>
    </div>
  );
}
