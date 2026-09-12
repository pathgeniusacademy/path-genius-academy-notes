import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { MAIN_SITE_URL } from "@/lib/config";

function Icon({ name }: { name: "home" | "classes" | "dashboard" | "profile" }) {
  const paths = {
    home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z",
    classes: "M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16h-11A2.5 2.5 0 0 1 4 13.5v-8ZM9.5 7.3v4.4l4-2.2-4-2.2ZM8 20h8",
    dashboard: "M4 4h6v7H4V4Zm10 0h6v4h-6V4ZM4 15h6v5H4v-5Zm10-3h6v8h-6v-8Z",
    profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  } as const;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function AppShell() {
  const { profile, signOut } = useAuth();
  const loc = useLocation();

  return (
    <div className="app-bg premium-app-bg">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar premium-topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand premium-brand" aria-label="Path Genius Notes home">
            <div className="brand-mark premium-brand-mark"><span>PG</span></div>
            <div className="brand-copy"><strong>Path Genius Academy</strong><span>Secure Notes Vault</span></div>
          </Link>
          <div className="top-actions">
            <a href={`${MAIN_SITE_URL}/free-classes`} className="ghost-btn desktop-action">Classes</a>
            <a href={`${MAIN_SITE_URL}/dashboard`} className="ghost-btn desktop-action">Dashboard</a>
            <div className="profile-chip desktop-action"><span>{(profile?.full_name || profile?.login_id || "S").slice(0,1).toUpperCase()}</span><small>{profile?.login_id}</small></div>
            <button className="ghost-btn" onClick={() => void signOut()}>Logout</button>
          </div>
        </div>
      </header>

      <main className="page-wrap premium-page-wrap">
        <section className="welcome-strip premium-welcome">
          <div>
            <span className="eyebrow light-eyebrow">PERSONAL NOTES VAULT</span>
            <h1>Welcome, {profile?.full_name || profile?.login_id}</h1>
            <p>Private, personalized and protected study material.</p>
          </div>
          <div className="secure-pill premium-secure-pill"><span className="pulse-dot" />Protected PDF Access</div>
        </section>

        <nav className="mini-nav premium-mini-nav">
          <Link className={loc.pathname === "/" ? "active" : ""} to="/"><Icon name="home" />My Notes</Link>
          <a href={`${MAIN_SITE_URL}/free-classes`}><Icon name="classes" />Classes</a>
          <a href={`${MAIN_SITE_URL}/dashboard`}><Icon name="dashboard" />Main Dashboard</a>
        </nav>

        <Outlet />
      </main>

      <nav className="mobile-bottom-nav" aria-label="Student navigation">
        <a href={`${MAIN_SITE_URL}/dashboard`}><Icon name="home" /><span>Home</span></a>
        <a href={`${MAIN_SITE_URL}/free-classes`}><Icon name="classes" /><span>Classes</span></a>
        <a href={`${MAIN_SITE_URL}/tests`}><Icon name="dashboard" /><span>Tests</span></a>
        <a href={`${MAIN_SITE_URL}/saved-questions`}><Icon name="profile" /><span>Revision</span></a>
        <Link className="active" to="/"><Icon name="home" /><span>Notes</span></Link>
      </nav>
    </div>
  );
}
