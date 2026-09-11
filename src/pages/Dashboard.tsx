import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { callNotesApi, type NoteItem } from "@/lib/notesApi";
import { startPersonalizedNoteDownload } from "@/lib/downloadNote";
import { getRecentNotes } from "@/lib/recentNotes";
import { isNewNote, noteAccessLabel, noteAccessMessage } from "@/lib/notePresentation";
import { MAIN_SITE_URL } from "@/lib/config";

type FolderGroup = { id: string; name: string; notes: NoteItem[] };

export default function Dashboard() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    callNotesApi<{ notes: NoteItem[] }>("myNotes")
      .then((r) => setNotes(r.notes || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => [note.note_title, note.subject_name, note.class_title, note.description]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [notes, query]);

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

  const recent = useMemo(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    return getRecentNotes().map((item) => byId.get(item.id)).filter((item): item is NoteItem => Boolean(item));
  }, [notes]);

  const unlockedCount = notes.filter((note) => note.unlocked).length;
  const freeCount = notes.filter((note) => note.access_type === "free").length;
  const newCount = notes.filter((note) => isNewNote(note)).length;

  async function download(note: NoteItem) {
    if (!note.unlocked) return;
    setDownloading(note.id);
    try {
      await startPersonalizedNoteDownload(note);
      toast.success("Personalized PDF ready. Download starting…");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  if (loading) return <div className="panel premium-panel loading-panel"><div className="spinner" /><p>Opening your secure notes vault…</p></div>;

  return (
    <>
      <section className="vault-hero">
        <div className="vault-copy">
          <div className="hero-badge"><span>✦</span> PATH GENIUS NOTES</div>
          <h2>Your complete revision library,<br/><em>organized for faster study.</em></h2>
          <p>Search your notes, see access clearly and continue reading without changing the secure personalized-download system.</p>
          <div className="hero-actions premium-actions">
            <a href={`${MAIN_SITE_URL}/free-classes`} className="hero-link">▶ Continue Classes</a>
            <a href={`${MAIN_SITE_URL}/dashboard`} className="hero-link secondary">Open Main Dashboard</a>
          </div>
        </div>
        <div className="vault-art" aria-hidden="true">
          <div className="book-stack"><i /><i /><i /></div>
          <div className="shield-card"><span>PG</span><small>SECURE</small></div>
          <div className="math-chip chip-one">∫ f(x)dx</div><div className="math-chip chip-two">A⁻¹</div><div className="math-chip chip-three">Σ</div>
        </div>
      </section>

      <section className="vault-stats">
        <div className="stat-card"><span className="stat-icon blue">▦</span><div><strong>{groups.length}</strong><small>Notes folders</small></div></div>
        <div className="stat-card"><span className="stat-icon orange">PDF</span><div><strong>{notes.length}</strong><small>Published PDFs</small></div></div>
        <div className="stat-card"><span className="stat-icon teal">✓</span><div><strong>{unlockedCount}</strong><small>Available now</small></div></div>
        <div className="stat-card"><span className="stat-icon purple">NEW</span><div><strong>{newCount || freeCount}</strong><small>{newCount ? "New this week" : "Free notes"}</small></div></div>
      </section>

      <section className="panel premium-panel notes-discovery-panel">
        <div className="section-head premium-section-head">
          <div><span className="eyebrow">FIND NOTES</span><h2>Search your study library</h2><p>Search by note title, chapter, topic or folder.</p></div>
          <span className="count-chip">{filteredNotes.length} note{filteredNotes.length === 1 ? "" : "s"}</span>
        </div>
        <div className="notes-search-wrap"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes, chapter or topic..." aria-label="Search notes" /></div>

        {recent.length > 0 && !query && <div className="recent-notes-block">
          <div className="subsection-title"><div><span className="eyebrow">CONTINUE STUDYING</span><h3>Recently Opened</h3></div><small>Saved only on this device</small></div>
          <div className="recent-notes-row">
            {recent.slice(0, 5).map((note) => <button key={note.id} disabled={!note.unlocked || downloading === note.id} onClick={() => void download(note)} className="recent-note-chip"><span>PDF</span><div><strong>{note.note_title}</strong><small>{note.subject_name || note.class_title}</small></div><b>›</b></button>)}
          </div>
        </div>}

        {filteredNotes.length === 0 ? <div className="empty premium-empty"><div className="empty-icon">🔎</div><h3>No matching notes</h3><p>Try a chapter name, topic or folder title.</p></div> : <div className="notes-grid premium-notes-grid notes-library-grid">
          {filteredNotes.map((note, index) => {
            const badge = noteAccessLabel(note);
            return <article className={`note-card static premium-note-card ${note.unlocked ? "unlocked" : "locked"}`} key={note.id}>
              <div className={`pdf-icon premium-pdf-icon ${note.unlocked ? "" : "locked-pdf"}`}><b>PDF</b><small>{String(index + 1).padStart(2, "0")}</small></div>
              <div className="note-card-body">
                <div className="student-note-badges"><span className={`note-access-badge ${note.access_type}`}>{badge}</span>{isNewNote(note) && <span className="new-note-badge">NEW</span>}</div>
                <span>{note.subject_name || note.class_title || "Path Genius Notes"}</span>
                <h3>{note.note_title}</h3>
                {note.description && <p className="note-description">{note.description}</p>}
                <p>{note.unlocked ? "✓" : "🔒"} {noteAccessMessage(note)}</p>
              </div>
              {note.unlocked ? <button className="primary-small download-btn" onClick={() => void download(note)} disabled={downloading === note.id}>{downloading === note.id ? "Preparing…" : "Open Notes ↓"}</button> : note.access_type === "test_series" ? <a className="support-small premium-support" href={`${MAIN_SITE_URL}/dashboard`}>Get Test Series Access</a> : <span className="locked-label">🔒 Locked</span>}
            </article>;
          })}
        </div>}
      </section>

      <section className="panel premium-panel library-panel">
        <div className="section-head premium-section-head"><div><span className="eyebrow">BROWSE BY FOLDER</span><h2>Notes Folders</h2><p>Open a folder to see all its current notes and individual access status.</p></div><span className="count-chip">{groups.length} folder{groups.length === 1 ? "" : "s"}</span></div>
        <div className="folder-grid premium-folder-grid">
          {groups.map((group, index) => {
            const first = group.notes[0];
            const href = first.main_folder_id ? `/folder/${first.main_folder_id}` : `/class/${first.main_class_id}`;
            const accessible = group.notes.filter((n) => n.unlocked).length;
            const tone = ["tone-blue", "tone-orange", "tone-teal", "tone-purple"][index % 4];
            return <Link to={href} className={`folder-card premium-folder-card ${tone}`} key={group.id}>
              <div className="folder-topline"><span>{accessible}/{group.notes.length} AVAILABLE</span><b>{accessible ? "✓" : "🔒"}</b></div>
              <div className="folder-icon premium-folder-icon">📚</div><div className="folder-card-body"><h3>{group.name}</h3><p>{group.notes.length} PDF{group.notes.length === 1 ? "" : "s"}</p></div><div className="folder-footer"><span>View folder</span><div className="arrow">›</div></div>
            </Link>;
          })}
        </div>
      </section>

      <section className="protection-banner"><div className="protection-icon">⌁</div><div><strong>Personalized protection on every download</strong><p>Your name, registered mobile and Login ID are added to downloaded PDFs automatically.</p></div><span>Private • Secure • Account-linked</span></section>
    </>
  );
}
