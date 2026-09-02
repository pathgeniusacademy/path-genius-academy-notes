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
    <div className="login-page premium-login-page">
      <div className="login-orb orb-a" /><div className="login-orb orb-b" />
      <div className="login-shell">
        <section className="login-showcase">
          <div className="showcase-brand"><div className="brand-mark premium-brand-mark"><span>PG</span></div><div><strong>Path Genius Academy</strong><small>Secure Notes Vault</small></div></div>
          <div className="showcase-copy"><span className="hero-badge">PREMIUM STUDY MATERIAL</span><h1>Study smarter.<br/>Revise faster.<br/><em>Keep everything organized.</em></h1><p>Your class-wise notes, folder-wise access and personalized PDF protection — all in one place.</p></div>
          <div className="feature-list"><div><span>✓</span><b>Folder-wise Notes</b><small>Complete chapter material together</small></div><div><span>✓</span><b>Personalized PDFs</b><small>Name, mobile & Login ID watermark</small></div><div><span>✓</span><b>Same Student Login</b><small>No separate account to remember</small></div></div>
          <div className="showcase-math">∑ &nbsp; ∫ &nbsp; π &nbsp; A⁻¹ &nbsp; lim</div>
        </section>
        <section className="login-card premium-login-card">
          <div className="mobile-login-brand"><div className="login-logo">PG</div><strong>Path Genius Notes</strong></div>
          <p className="eyebrow">STUDENT ACCESS</p>
          <h2>Welcome back</h2>
          <p className="muted">Use the same Student Login ID and password as your main Path Genius Academy account.</p>
          <form onSubmit={submit} className="form-stack premium-form">
            <label><span>Student Login ID</span><div className="input-wrap"><i>◎</i><input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="PGA1001" autoCapitalize="characters" /></div></label>
            <label><span>Password</span><div className="input-wrap"><i>◆</i><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" /></div></label>
            <button className="primary-btn premium-primary" disabled={loading}>{loading ? "Signing in…" : "Open My Notes →"}</button>
          </form>
          <div className="login-assurance"><span>🔐</span><p><strong>Secure student access</strong><small>Your PDF downloads are personalized to your account.</small></p></div>
          <div className="login-footer"><a href={`${MAIN_SITE_URL}/free-classes`}>← Back to Classes</a><Link to="/admin/login">Admin</Link></div>
        </section>
      </div>
    </div>
  );
}
