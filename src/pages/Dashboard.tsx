import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { callNotesApi, type NoteItem } from "@/lib/notesApi";
import { MAIN_SITE_URL } from "@/lib/config";

type FolderGroup = {
  id: string;
  name: string;
  notes: NoteItem[];
};

export default function Dashboard() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callNotesApi<{ notes: NoteItem[] }>("myNotes")
      .then((r) => setNotes(r.notes))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, FolderGroup>();
    for (const note of notes) {
      const id = note.main_folder_id || `class-${note.main_class_id}`;
      const existing = map.get(id);
      if (existing) existing.notes.push(note);
      else map.set(id, { id, name: note.subject_name || "Class Notes", notes: [note] });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [notes]);

  const classes = useMemo(() => new Set(notes.filter((n) => !n.main_class_id.startsWith("folder-")).map((n) => n.main_class_id)).size, [notes]);

  if (loading) return <div className="panel premium-panel loading-panel"><div className="spinner" /><p>Opening your secure notes vault…</p></div>;

  return (
    <>
      <section className="vault-hero">
        <div className="vault-copy">
          <div className="hero-badge"><span>✦</span> PATH GENIUS NOTES</div>
          <h2>Your complete revision library,<br/><em>organized for faster study.</em></h2>
          <p>Every unlocked PDF is personalized for your account and protected with your student details.</p>
          <div className="hero-actions premium-actions">
            <a href={`${MAIN_SITE_URL}/free-classes`} className="hero-link">▶ Continue Classes</a>
            <Link to="/graph" className="hero-link secondary">📈 Open 2D Graph Lab</Link>
            <a href={`${MAIN_SITE_URL}/dashboard`} className="hero-link secondary">Open Main Dashboard</a>
          </div>
        </div>
        <div className="vault-art" aria-hidden="true">
          <div className="book-stack"><i /><i /><i /></div>
          <div className="shield-card"><span>PG</span><small>SECURE</small></div>
          <div className="math-chip chip-one">∫ f(x)dx</div>
          <div className="math-chip chip-two">A⁻¹</div>
          <div className="math-chip chip-three">Σ</div>
        </div>
      </section>

      <section className="vault-stats">
        <div className="stat-card"><span className="stat-icon blue">▦</span><div><strong>{groups.length}</strong><small>Unlocked folders</small></div></div>
        <div className="stat-card"><span className="stat-icon orange">PDF</span><div><strong>{notes.length}</strong><small>Study PDFs</small></div></div>
        <div className="stat-card"><span className="stat-icon teal">✓</span><div><strong>{classes}</strong><small>Linked classes</small></div></div>
        <div className="stat-card"><span className="stat-icon purple">◆</span><div><strong>100%</strong><small>Personalized</small></div></div>
      </section>

      <section className="panel premium-panel library-panel">
        <div className="section-head premium-section-head">
          <div><span className="eyebrow">MY LIBRARY</span><h2>Unlocked Notes Folders</h2><p>Everything you have access to, arranged subject-wise.</p></div>
          <span className="count-chip">{groups.length} folder{groups.length === 1 ? "" : "s"}</span>
        </div>
        {groups.length === 0 ? (
          <div className="empty premium-empty"><div className="empty-icon">📚</div><h3>Your notes vault is ready</h3><p>No folder has been unlocked yet. Open a class from the academy app and contact support when you want access to its notes folder.</p><a className="primary-small" href={`${MAIN_SITE_URL}/free-classes`}>Browse Classes</a></div>
        ) : (
          <div className="folder-grid premium-folder-grid">
            {groups.map((group, index) => {
              const first = group.notes[0];
              const href = first.main_folder_id ? `/folder/${first.main_folder_id}` : `/class/${first.main_class_id}`;
              const classCount = new Set(group.notes.filter((n) => !n.main_class_id.startsWith("folder-")).map((n) => n.main_class_id)).size;
              const tone = ["tone-blue", "tone-orange", "tone-teal", "tone-purple"][index % 4];
              return (
                <Link to={href} className={`folder-card premium-folder-card ${tone}`} key={group.id}>
                  <div className="folder-topline"><span>UNLOCKED</span><b>✓</b></div>
                  <div className="folder-icon premium-folder-icon">📚</div>
                  <div className="folder-card-body">
                    <h3>{group.name}</h3>
                    <p>{group.notes.length} PDF{group.notes.length === 1 ? "" : "s"}{classCount > 0 ? ` • ${classCount} linked class${classCount === 1 ? "" : "es"}` : " • notes-only folder"}</p>
                  </div>
                  <div className="folder-footer"><span>Open folder</span><div className="arrow">›</div></div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="protection-banner">
        <div className="protection-icon">⌁</div>
        <div><strong>Personalized protection on every download</strong><p>Your name, registered mobile and Login ID are added to downloaded PDFs automatically.</p></div>
        <span>Private • Secure • Account-linked</span>
      </section>
    </>
  );
}
