import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { callNotesApi, createDownloadTicket, type NoteItem } from "@/lib/notesApi";
import { mainSupabase } from "@/lib/mainSupabase";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useAuth } from "@/context/AuthContext";

type ClassVideo = { id: string; folder_id: string; title: string; description: string | null };
type Settings = { support_whatsapp: string | null; purchase_whatsapp: string | null };

export default function ClassNotes() {
  const { classId = "" } = useParams();
  const { profile } = useAuth();
  const [classInfo, setClassInfo] = useState<ClassVideo | null>(null);
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
      try {
        const result = await callNotesApi<{ notes: NoteItem[] }>("listClassNotes", { classId });
        if (!alive) return;
        setNotes(result.notes);
      } catch (e) {
        if (alive) toast.error((e as Error).message);
      }
      if (!alive) return;
      setClassInfo((classRes.data as ClassVideo | null) || null);
      setSettings((settingsRes.data as Settings | null) || null);
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [classId]);

  const supportUrl = useMemo(() => {
    const number = settings?.support_whatsapp || settings?.purchase_whatsapp;
    const message = `Hi, I need help unlocking Class Notes.\n\nClass: ${classInfo?.title || classId}\nLogin ID: ${profile?.login_id || ""}\nRegistered Mobile: ${profile?.mobile || ""}`;
    return buildWhatsAppUrl(number, message);
  }, [settings, classInfo, classId, profile]);

  async function download(note: NoteItem) {
    setDownloading(note.id);
    try {
      const { downloadUrl } = await createDownloadTicket(note.id);
      // A one-time server-side URL streams the personalized PDF. This is friendlier to Android WebView than blob URLs.
      window.location.href = downloadUrl;
    } catch (e) {
      toast.error((e as Error).message);
      setDownloading(null);
    }
  }

  return (
    <div className="class-page">
      <section className="hero-card">
        <div><span className="eyebrow orange">CLASS NOTES</span><h2>{classInfo?.title || "Class Notes"}</h2><p>{classInfo?.description || "Personalized notes prepared for Path Genius Academy students."}</p></div>
        <div className="hero-lock">📄</div>
      </section>

      <section className="panel">
        <div className="section-head"><div><span className="eyebrow">AVAILABLE FILES</span><h2>Notes for this class</h2></div><span className="secure-pill">Watermarked for you</span></div>
        {loading ? <div className="spinner" /> : notes.length === 0 ? (
          <div className="empty"><div>📝</div><h3>Notes not added yet</h3><p>When notes for this class are published, they will appear here automatically.</p></div>
        ) : (
          <div className="notes-grid">
            {notes.map((note) => (
              <div className={`note-card static ${note.unlocked ? "unlocked" : "locked"}`} key={note.id}>
                <div className="pdf-icon">PDF</div>
                <div className="note-card-body"><span>{note.subject_name || "Path Genius Notes"}</span><h3>{note.note_title}</h3><p>{note.unlocked ? "Access enabled • Personalized on download" : "Access required"}</p></div>
                {note.unlocked ? (
                  <button className="primary-small" onClick={() => void download(note)} disabled={downloading === note.id}>{downloading === note.id ? "Preparing…" : "Download"}</button>
                ) : supportUrl ? (
                  <a className="support-small" href={supportUrl}>🔒 Contact Support</a>
                ) : <span className="locked-label">🔒 Locked</span>}
              </div>
            ))}
          </div>
        )}
        <div className="privacy-note"><strong>Personalized protection:</strong> every downloaded page contains the logged-in student's name, mobile number and Login ID as repeated watermarks.</div>
      </section>
    </div>
  );
}
