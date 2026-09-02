import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { callNotesApi, type NoteItem } from "@/lib/notesApi";
import { startPersonalizedNoteDownload } from "@/lib/downloadNote";
import { mainSupabase } from "@/lib/mainSupabase";
import { MAIN_SITE_URL } from "@/lib/config";

type FolderInfo = { id: string; name: string; description: string | null };

export default function FolderNotes() {
  const { folderId = "" } = useParams();
  const [folder, setFolder] = useState<FolderInfo | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const folderRes = await mainSupabase.from("class_folders").select("id,name,description").eq("id", folderId).maybeSingle();
      try {
        const result = await callNotesApi<{ notes: NoteItem[] }>("listFolderNotes", { folderId });
        if (!alive) return;
        setNotes(result.notes);
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

  async function download(note: NoteItem) {
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

  return (
    <div className="content-stack">
      <section className="hero-card premium-content-hero folder-hero">
        <div>
          <div className="hero-badge light"><span>✓</span> UNLOCKED NOTES FOLDER</div>
          <h2>{folder?.name || "Notes Folder"}</h2>
          <p>{folder?.description || "All current and future PDFs inside this folder are available to your account."}</p>
          <div className="hero-actions premium-actions"><a href={`${MAIN_SITE_URL}/free-classes/${folderId}`} className="hero-link">▶ Open Classes</a><Link to="/" className="hero-link secondary">← My Library</Link></div>
        </div>
        <div className="content-hero-art" aria-hidden="true"><div className="hero-folder">📚</div><span>PDF</span><span>✓</span></div>
      </section>

      <section className="panel premium-panel">
        <div className="section-head premium-section-head"><div><span className="eyebrow">COMPLETE FOLDER</span><h2>Study Material</h2><p>Download any file below. Every copy is personalized automatically.</p></div><span className="secure-pill access-active">✓ Folder Access Active</span></div>
        {loading ? <div className="loading-panel"><div className="spinner" /><p>Loading secure notes…</p></div> : notes.length === 0 ? (
          <div className="empty premium-empty"><div className="empty-icon">📝</div><h3>No PDFs added yet</h3><p>New notes uploaded to this folder will automatically become available to you.</p></div>
        ) : (
          <div className="notes-grid premium-notes-grid">
            {notes.map((note, index) => (
              <article className="note-card static unlocked premium-note-card" key={note.id}>
                <div className="pdf-icon premium-pdf-icon"><b>PDF</b><small>{String(index + 1).padStart(2, "0")}</small></div>
                <div className="note-card-body"><span>{note.class_title}</span><h3>{note.note_title}</h3><p><i className="mini-lock">◆</i> Personalized watermark • Secure download</p></div>
                <div className="folder-note-actions">
                  {!note.main_class_id.startsWith("folder-") && <Link className="ghost-small" to={`/class/${note.main_class_id}`}>View Class</Link>}
                  <button className="primary-small download-btn" onClick={() => void download(note)} disabled={downloading === note.id}>{downloading === note.id ? "Preparing…" : "Download PDF ↓"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="privacy-note premium-privacy"><strong>Automatic future access</strong><span>Any new PDF uploaded later inside this unlocked folder or its subfolders becomes available without granting access again.</span></div>
      </section>
    </div>
  );
}
