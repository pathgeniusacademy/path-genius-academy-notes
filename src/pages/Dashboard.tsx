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

  if (loading) return <div className="panel"><div className="spinner" /></div>;

  return (
    <>
      <section className="panel notes-home-hero">
        <div>
          <span className="eyebrow">YOUR NOTES LIBRARY</span>
          <h2>Unlocked folders</h2>
          <p className="muted">Your notes are organized folder-wise. One folder access covers all PDFs inside that folder.</p>
        </div>
        <a href={`${MAIN_SITE_URL}/free-classes`} className="primary-small">▶ Open Classes</a>
      </section>

      <section className="panel">
        <div className="section-head">
          <div><span className="eyebrow">FOLDER ACCESS</span><h2>My Notes Folders</h2></div>
          <span className="count-chip">{groups.length} folder{groups.length === 1 ? "" : "s"}</span>
        </div>
        {groups.length === 0 ? (
          <div className="empty"><div>📚</div><h3>No notes folder unlocked yet</h3><p>Open a class from the main app and use Class Notes. If the folder is locked, contact support from that page.</p></div>
        ) : (
          <div className="folder-grid">
            {groups.map((group) => {
              const first = group.notes[0];
              const href = first.main_folder_id ? `/folder/${first.main_folder_id}` : `/class/${first.main_class_id}`;
              const classCount = new Set(group.notes.filter((n) => !n.main_class_id.startsWith("folder-")).map((n) => n.main_class_id)).size;
              return (
                <Link to={href} className="folder-card" key={group.id}>
                  <div className="folder-icon">📚</div>
                  <div className="folder-card-body">
                    <span>UNLOCKED FOLDER</span>
                    <h3>{group.name}</h3>
                    <p>{group.notes.length} PDF{group.notes.length === 1 ? "" : "s"}{classCount > 0 ? ` • ${classCount} class${classCount === 1 ? "" : "es"}` : " • notes-only folder"}</p>
                  </div>
                  <div className="arrow">›</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
