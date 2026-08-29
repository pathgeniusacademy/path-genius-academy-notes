import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { MAIN_SITE_URL } from "@/lib/config";

export default function AppShell() {
  const { profile, signOut } = useAuth();
  const loc = useLocation();
  return (
    <div className="app-bg">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <div className="brand-mark">PG</div>
            <div><strong>Path Genius Academy</strong><span>Class Notes</span></div>
          </Link>
          <div className="top-actions">
            <a href={`${MAIN_SITE_URL}/free-classes`} className="ghost-btn">← Classes</a>
            <button className="ghost-btn" onClick={() => void signOut()}>Logout</button>
          </div>
        </div>
      </header>
      <main className="page-wrap">
        <div className="welcome-strip">
          <div><span className="eyebrow">STUDENT NOTES</span><h1>{profile?.full_name || profile?.login_id}</h1></div>
          <span className="secure-pill">🔐 Personalized PDF</span>
        </div>
        <nav className="mini-nav">
          <Link className={loc.pathname === "/" ? "active" : ""} to="/">My Notes</Link>
          <a href={`${MAIN_SITE_URL}/free-classes`}>Classes</a>
          <a href={`${MAIN_SITE_URL}/dashboard`}>Main Dashboard</a>
        </nav>
        <Outlet />
      </main>
    </div>
  );
}
