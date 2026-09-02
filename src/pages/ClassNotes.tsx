import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { callNotesApi, type NoteItem } from "@/lib/notesApi";
import { startPersonalizedNoteDownload } from "@/lib/downloadNote";
import { mainSupabase } from "@/lib/mainSupabase";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useAuth } from "@/context/AuthContext";
import { MAIN_SITE_URL } from "@/lib/config";

type ClassVideo = { id: string; folder_id: string; title: string; description: string | null };
type FolderInfo = { id: string; name: string };
type Settings = { support_whatsapp: string | null; purchase_whatsapp: string | null };

export default function ClassNotes() {
  const { classId = "" } = useParams();
  const { profile } = useAuth();
  const [classInfo, setClassInfo] = useState<ClassVideo | null>(null);
  const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const [classRes, settingsRes] = await Promise.all([
        mainSupabase.from("class_videos").select("id,folder_id,title,description").eq("id", classId).maybeSingle(),
        mainSupabase.from("academy_settings").select("support_whatsapp,purchase_whatsapp").eq("id", 1).maybeSingle(),
      ]);

      const video = (classRes.data as ClassVideo | null) || null;
      let folder: FolderInfo | null = null;
      if (video?.folder_id) {
        const folderRes = await mainSupabase.from("class_folders").select("id,name").eq("id", video.folder_id).maybeSingle();
        folder = (folderRes.data as FolderInfo | null) || null;
      }

      try {
        const result = await callNotesApi<{ notes: NoteItem[] }>("listClassNotes", { classId });
        if (!alive) return;
        setNotes(result.notes);
      } catch (e) {
        if (alive) toast.error((e as Error).message);
      }
      if (!alive) return;
      setClassInfo(video);
      setFolderInfo(folder);
      setSettings((settingsRes.data as Settings | null) || null);
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [classId]);

  const supportUrl = useMemo(() => {
    const number = settings?.support_whatsapp || settings?.purchase_whatsapp;
    const message = `Hi, I need help unlocking the complete Notes Folder.\n\nFolder: ${folderInfo?.name || "Class Notes"}\nClass: ${classInfo?.title || classId}\nLogin ID: ${profile?.login_id || ""}\nRegistered Mobile: ${profile?.mobile || ""}`;
    return buildWhatsAppUrl(number, message);
  }, [settings, classInfo, folderInfo, classId, profile]);

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

  const folderUnlocked = notes.some((note) => note.unlocked);
  const mainClassUrl = classInfo?.folder_id ? `${MAIN_SITE_URL}/free-classes/${classInfo.folder_id}` : `${MAIN_SITE_URL}/free-classes`;

  return (
    <div className="class-page content-stack">
      <section className={`hero-card premium-content-hero ${folderUnlocked ? "unlocked-hero" : "locked-hero"}`}>
        <div>
          <div className="hero-badge light"><span>{folderUnlocked ? "✓" : "◆"}</span> CLASS NOTES</div>
          <h2>{classInfo?.title || "Class Notes"}</h2>
          <p>{folderInfo?.name ? `${folderInfo.name} • ` : ""}High-quality personalized notes for Path Genius Academy students.</p>
          <div className="hero-actions premium-actions">
            <a href={mainClassUrl} className="hero-link">▶ Open Class</a>
            {classInfo?.folder_id && <Link to={`/folder/${classInfo.folder_id}`} className="hero-link secondary">📚 Folder Notes</Link>}
          </div>
        </div>
        <div className="content-hero-art" aria-hidden="true"><div className="hero-folder">📄</div><span>{folderUnlocked ? "✓" : "🔒"}</span><span>PG</span></div>
      </section>

      <section className="panel premium-panel">
        <div className="section-head premium-section-head">
          <div><span className="eyebrow">AVAILABLE MATERIAL</span><h2>Notes for this class</h2><p>Secure PDFs connected to this lecture.</p></div>
          <span className={`secure-pill ${folderUnlocked ? "access-active" : ""}`}>{folderUnlocked ? "✓ Folder Access Active" : "◆ Personalized for you"}</span>
        </div>
        {loading ? <div className="loading-panel"><div className="spinner" /><p>Checking notes access…</p></div> : notes.length === 0 ? (
          <div className="empty premium-empty"><div className="empty-icon">📝</div><h3>Notes not added yet</h3><p>When notes for this class are published, they will appear here automatically.</p></div>
        ) : (
          <div className="notes-grid premium-notes-grid">
            {notes.map((note, index) => (
              <article className={`note-card static premium-note-card ${note.unlocked ? "unlocked" : "locked"}`} key={note.id}>
                <div className={`pdf-icon premium-pdf-icon ${note.unlocked ? "" : "locked-pdf"}`}><b>PDF</b><small>{String(index + 1).padStart(2, "0")}</small></div>
                <div className="note-card-body">
                  <span>{note.subject_name || "Path Genius Notes"}</span>
                  <h3>{note.note_title}</h3>
                  <p>{note.unlocked ? "✓ Folder unlocked • Personalized on download" : "🔒 Complete folder access required"}</p>
                </div>
                {note.unlocked ? (
                  <button className="primary-small download-btn" onClick={() => void download(note)} disabled={downloading === note.id}>{downloading === note.id ? "Preparing…" : "Download PDF ↓"}</button>
                ) : supportUrl ? (
                  <a className="support-small premium-support" href={supportUrl}>🔒 Contact Support</a>
                ) : <span className="locked-label">🔒 Locked</span>}
              </article>
            ))}
          </div>
        )}
        <div className="privacy-note premium-privacy"><strong>Folder-wise access</strong><span>Once this folder is unlocked, every PDF added inside it (including subfolders) is available automatically. Every download includes the student's name, mobile number and Login ID.</span></div>
      </section>
    </div>
  );
}
