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
    <div>
      <section className="hero-card">
        <div>
          <span className="eyebrow orange">UNLOCKED NOTES FOLDER</span>
          <h2>{folder?.name || "Notes Folder"}</h2>
          <p>{folder?.description || "All available PDFs in this folder are unlocked for your account."}</p>
          <div className="hero-actions"><a href={`${MAIN_SITE_URL}/free-classes/${folderId}`} className="hero-link">▶ Open Classes</a></div>
        </div>
        <div className="hero-lock">📚</div>
      </section>

      <section className="panel">
        <div className="section-head"><div><span className="eyebrow">ALL PDFs</span><h2>Complete folder notes</h2></div><span className="secure-pill">✓ Folder Access Active</span></div>
        {loading ? <div className="spinner" /> : notes.length === 0 ? (
          <div className="empty"><div>📝</div><h3>No PDFs added yet</h3><p>New notes uploaded to this folder will automatically become available to you.</p></div>
        ) : (
          <div className="notes-grid">
            {notes.map((note) => (
              <div className="note-card static unlocked" key={note.id}>
                <div className="pdf-icon">PDF</div>
                <div className="note-card-body"><span>{note.class_title}</span><h3>{note.note_title}</h3><p>Personalized watermark on download</p></div>
                <div className="folder-note-actions">
                  {!note.main_class_id.startsWith("folder-") && <Link className="ghost-small" to={`/class/${note.main_class_id}`}>Class</Link>}
                  <button className="primary-small" onClick={() => void download(note)} disabled={downloading === note.id}>{downloading === note.id ? "Preparing…" : "Download"}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="privacy-note"><strong>Automatic future access:</strong> any new PDF uploaded later inside this unlocked folder will also be available without granting access again.</div>
      </section>
    </div>
  );
}
