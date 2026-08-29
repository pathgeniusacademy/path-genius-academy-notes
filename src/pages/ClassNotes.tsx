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
    <div className="class-page">
      <section className="hero-card">
        <div>
          <span className="eyebrow orange">CLASS NOTES</span>
          <h2>{classInfo?.title || "Class Notes"}</h2>
          <p>{folderInfo?.name ? `${folderInfo.name} • ` : ""}Personalized notes for Path Genius Academy students.</p>
          <div className="hero-actions">
            <a href={mainClassUrl} className="hero-link">▶ Open Class</a>
            {classInfo?.folder_id && <Link to={`/folder/${classInfo.folder_id}`} className="hero-link secondary">📚 Folder Notes</Link>}
          </div>
        </div>
        <div className="hero-lock">📄</div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div><span className="eyebrow">AVAILABLE FILES</span><h2>Notes for this class</h2></div>
          <span className="secure-pill">{folderUnlocked ? "✓ Folder Access Active" : "Watermarked for you"}</span>
        </div>
        {loading ? <div className="spinner" /> : notes.length === 0 ? (
          <div className="empty"><div>📝</div><h3>Notes not added yet</h3><p>When notes for this class are published, they will appear here automatically.</p></div>
        ) : (
          <div className="notes-grid">
            {notes.map((note) => (
              <div className={`note-card static ${note.unlocked ? "unlocked" : "locked"}`} key={note.id}>
                <div className="pdf-icon">PDF</div>
                <div className="note-card-body">
                  <span>{note.subject_name || "Path Genius Notes"}</span>
                  <h3>{note.note_title}</h3>
                  <p>{note.unlocked ? "Folder unlocked • Personalized on download" : "Complete folder access required"}</p>
                </div>
                {note.unlocked ? (
                  <button className="primary-small" onClick={() => void download(note)} disabled={downloading === note.id}>{downloading === note.id ? "Preparing…" : "Download"}</button>
                ) : supportUrl ? (
                  <a className="support-small" href={supportUrl}>🔒 Contact Support</a>
                ) : <span className="locked-label">🔒 Locked</span>}
              </div>
            ))}
          </div>
        )}
        <div className="privacy-note"><strong>Folder-wise access:</strong> once this folder is unlocked, every PDF added inside the folder (including its subfolders) becomes available to that student. Every download is personalized with the student's name, mobile number and Login ID.</div>
      </section>
    </div>
  );
}
