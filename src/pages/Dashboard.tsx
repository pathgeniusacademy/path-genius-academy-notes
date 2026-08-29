import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { callNotesApi, type NoteItem } from "@/lib/notesApi";

export default function Dashboard() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    callNotesApi<{ notes: NoteItem[] }>("myNotes")
      .then((r) => setNotes(r.notes))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="panel"><div className="spinner" /></div>;
  return (
    <section className="panel">
      <div className="section-head"><div><span className="eyebrow">YOUR LIBRARY</span><h2>Unlocked Class Notes</h2></div><span className="count-chip">{notes.length} PDF{notes.length === 1 ? "" : "s"}</span></div>
      {notes.length === 0 ? (
        <div className="empty"><div>📚</div><h3>No notes unlocked yet</h3><p>Open a class from the main app and use the Class Notes button. If access is locked, contact support from that page.</p></div>
      ) : (
        <div className="notes-grid">
          {notes.map((note) => (
            <Link to={`/class/${note.main_class_id}`} className="note-card" key={note.id}>
              <div className="pdf-icon">PDF</div>
              <div className="note-card-body"><span>{note.subject_name || "Class Notes"}</span><h3>{note.class_title}</h3><p>{note.note_title}</p></div>
              <div className="arrow">›</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
