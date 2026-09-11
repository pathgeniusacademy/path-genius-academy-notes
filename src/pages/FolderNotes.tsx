import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { callNotesApi, type NoteItem } from "@/lib/notesApi";
import { startPersonalizedNoteDownload } from "@/lib/downloadNote";
import { mainSupabase } from "@/lib/mainSupabase";
import { MAIN_SITE_URL } from "@/lib/config";
import { isNewNote, noteAccessLabel, noteAccessMessage } from "@/lib/notePresentation";

type FolderInfo = { id: string; name: string; description: string | null };

export default function FolderNotes() {
  const { folderId = "" } = useParams();
  const [folder, setFolder] = useState<FolderInfo | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const folderRes = await mainSupabase.from("class_folders").select("id,name,description").eq("id", folderId).maybeSingle();
      try {
        const result = await callNotesApi<{ notes: NoteItem[] }>("listFolderNotes", { folderId });
        if (!alive) return;
        setNotes(result.notes || []);
      } catch (e) {
        if (alive) toast.error((e as Error).message);
      }
      if (!alive) return;
      setFolder((folderRes.data as FolderInfo | null) || null);
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [folderId]);

  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) => [note.note_title, note.subject_name, note.class_title].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [notes, query]);

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

  const available = notes.filter((note) => note.unlocked).length;

  return (
    <div className="content-stack">
      <section className="hero-card premium-content-hero folder-hero">
        <div>
          <div className="hero-badge light"><span>◆</span> NOTES FOLDER</div>
          <h2>{folder?.name || "Notes Folder"}</h2>
          <p>{folder?.description || "Study material with clear Free, Test Series and Selected Student access."}</p>
          <div className="hero-actions premium-actions"><a href={`${MAIN_SITE_URL}/free-classes/${folderId}`} className="hero-link">▶ Open Classes</a><Link to="/" className="hero-link secondary">← My Library</Link></div>
        </div>
        <div className="content-hero-art" aria-hidden="true"><div className="hero-folder">📚</div><span>PDF</span><span>{available ? "✓" : "🔒"}</span></div>
      </section>

      <section className="panel premium-panel">
        <div className="section-head premium-section-head"><div><span className="eyebrow">STUDY MATERIAL</span><h2>Folder Notes</h2><p>{available} of {notes.length} currently available to your account.</p></div><span className={`secure-pill ${available ? "access-active" : ""}`}>{available ? `✓ ${available} Available` : "◆ Access shown per PDF"}</span></div>
        {notes.length > 5 && <div className="notes-search-wrap compact-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this folder..." /></div>}
        {loading ? <div className="loading-panel"><div className="spinner" /><p>Loading secure notes…</p></div> : visibleNotes.length === 0 ? (
          <div className="empty premium-empty"><div className="empty-icon">📝</div><h3>{query ? "No matching PDF" : "No PDFs added yet"}</h3><p>{query ? "Try another note or topic name." : "New published notes will appear here automatically."}</p></div>
        ) : (
          <div className="notes-grid premium-notes-grid">
            {visibleNotes.map((note, index) => (
              <article className={`note-card static premium-note-card ${note.unlocked ? "unlocked" : "locked"}`} key={note.id}>
                <div className={`pdf-icon premium-pdf-icon ${note.unlocked ? "" : "locked-pdf"}`}><b>PDF</b><small>{String(index + 1).padStart(2, "0")}</small></div>
                <div className="note-card-body">
                  <div className="student-note-badges"><span className={`note-access-badge ${note.access_type}`}>{noteAccessLabel(note)}</span>{isNewNote(note) && <span className="new-note-badge">NEW</span>}</div>
                  <span>{note.class_title}</span><h3>{note.note_title}</h3><p>{note.unlocked ? "✓" : "🔒"} {noteAccessMessage(note)}</p>
                </div>
                <div className="folder-note-actions">
                  {!note.main_class_id.startsWith("folder-") && <Link className="ghost-small" to={`/class/${note.main_class_id}`}>View Class</Link>}
                  {note.unlocked ? <button className="primary-small download-btn" onClick={() => void download(note)} disabled={downloading === note.id}>{downloading === note.id ? "Preparing…" : "Open Notes ↓"}</button> : note.access_type === "test_series" ? <a className="support-small premium-support" href={`${MAIN_SITE_URL}/dashboard`}>Get Test Series Access</a> : <span className="locked-label">🔒 Locked</span>}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="privacy-note premium-privacy"><strong>Secure access check</strong><span>Opening a protected PDF is verified on the server for your account. Changing a page URL cannot bypass note permissions.</span></div>
      </section>
    </div>
  );
}
