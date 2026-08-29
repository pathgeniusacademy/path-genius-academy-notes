import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { mainSupabase } from "@/lib/mainSupabase";
import { notesSupabase } from "@/lib/notesSupabase";
import { callNotesApi, type NoteItem } from "@/lib/notesApi";
import { MAIN_SITE_URL } from "@/lib/config";

type Folder = { id: string; name: string; parent_id: string | null };
type Video = { id: string; folder_id: string; title: string; is_active: boolean };
type Student = { id: string; full_name: string; login_id: string; mobile: string | null; is_active: boolean };

export default function AdminNotes() {
  const { signOut } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [selectedClass, setSelectedClass] = useState("");
  const [title, setTitle] = useState("Class Notes");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());

  async function loadMain() {
    const [f, v, s] = await Promise.all([
      mainSupabase.from("class_folders").select("id,name,parent_id").eq("is_active", true).order("name"),
      mainSupabase.from("class_videos").select("id,folder_id,title,is_active").eq("is_active", true).order("title"),
      mainSupabase.from("profiles").select("id,full_name,login_id,mobile,is_active").eq("role", "student").order("full_name"),
    ]);
    if (f.error) toast.error(f.error.message); else setFolders((f.data as Folder[]) || []);
    if (v.error) toast.error(v.error.message); else setVideos((v.data as Video[]) || []);
    if (s.error) toast.error(s.error.message); else setStudents((s.data as Student[]) || []);
  }

  async function loadNotes() {
    try {
      const result = await callNotesApi<{ notes: NoteItem[] }>("adminListNotes");
      setNotes(result.notes);
    } catch (e) { toast.error((e as Error).message); }
  }

  useEffect(() => { void loadMain(); void loadNotes(); }, []);

  useEffect(() => {
    if (!selectedFolder) { setGrantedIds(new Set()); return; }
    callNotesApi<{ studentIds: string[] }>("adminListFolderAccess", { folderId: selectedFolder })
      .then((r) => setGrantedIds(new Set(r.studentIds)))
      .catch((e) => toast.error(e.message));
  }, [selectedFolder]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  function folderPath(folderId: string) {
    const parts: string[] = [];
    const seen = new Set<string>();
    let current = folderById.get(folderId);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.name);
      current = current.parent_id ? folderById.get(current.parent_id) : undefined;
    }
    return parts.join(" › ") || "Folder";
  }

  const descendants = useMemo(() => {
    const children = new Map<string, string[]>();
    folders.forEach((f) => {
      if (!f.parent_id) return;
      const list = children.get(f.parent_id) || [];
      list.push(f.id);
      children.set(f.parent_id, list);
    });
    return (folderId: string) => {
      const result = new Set<string>([folderId]);
      const queue = [folderId];
      while (queue.length) {
        const id = queue.shift()!;
        for (const child of children.get(id) || []) {
          if (!result.has(child)) { result.add(child); queue.push(child); }
        }
      }
      return result;
    };
  }, [folders]);

  const classRows = useMemo(() => videos.map((v) => ({ ...v, label: `${folderPath(v.folder_id)} — ${v.title}` })), [videos, folders]);

  const folderRows = useMemo(() => folders.map((folder) => {
    const scope = descendants(folder.id);
    const pdfCount = notes.filter((n) => n.main_folder_id && scope.has(n.main_folder_id)).length;
    const childCount = scope.size - 1;
    return { ...folder, label: folderPath(folder.id), pdfCount, childCount };
  }).sort((a, b) => a.label.localeCompare(b.label)), [folders, notes, descendants]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students.slice(0, 40);
    return students.filter((s) => `${s.full_name} ${s.login_id} ${s.mobile || ""}`.toLowerCase().includes(q)).slice(0, 80);
  }, [students, studentQuery]);

  const selectedFolderMeta = folderRows.find((f) => f.id === selectedFolder);

  async function uploadNote() {
    if (!selectedClass) return toast.error("Select a class");
    if (!file) return toast.error("Select a PDF");
    if (file.type !== "application/pdf") return toast.error("Only PDF files are allowed");
    if (file.size > 25 * 1024 * 1024) return toast.error("PDF must be 25 MB or smaller");
    const video = videos.find((v) => v.id === selectedClass);
    if (!video) return toast.error("Class not found");
    setUploading(true);
    try {
      const signed = await callNotesApi<{ path: string; token: string }>("adminCreateUpload", {
        classId: video.id,
        originalName: file.name,
      });
      const { error: uploadError } = await notesSupabase.storage.from("class-notes").uploadToSignedUrl(signed.path, signed.token, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      await callNotesApi("adminCreateNote", {
        classId: video.id,
        folderId: video.folder_id,
        subjectName: folderPath(video.folder_id),
        classTitle: video.title,
        noteTitle: title.trim() || "Class Notes",
        storagePath: signed.path,
      });
      toast.success("Notes uploaded securely");
      setFile(null); setTitle("Class Notes");
      await loadNotes();
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  }

  async function setFolderAccess(studentId: string, grant: boolean) {
    if (!selectedFolder) return;
    try {
      await callNotesApi("adminSetFolderAccess", { folderId: selectedFolder, studentId, grant });
      setGrantedIds((prev) => {
        const next = new Set(prev);
        if (grant) next.add(studentId); else next.delete(studentId);
        return next;
      });
      toast.success(grant ? "Complete folder access granted" : "Folder access revoked");
      void loadNotes();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function deleteNote(note: NoteItem) {
    if (!confirm(`Delete “${note.note_title}” from ${note.class_title}?`)) return;
    try {
      await callNotesApi("adminDeleteNote", { noteId: note.id });
      toast.success("Note deleted");
      await loadNotes();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="admin-bg">
      <header className="admin-top">
        <div><div className="brand"><div className="brand-mark">PG</div><div><strong>Path Genius Notes</strong><span>Secure Admin</span></div></div></div>
        <div className="top-actions"><a href={MAIN_SITE_URL + "/admin/dashboard"} className="ghost-btn">Main Admin</a><button className="ghost-btn" onClick={() => void signOut()}>Logout</button></div>
      </header>

      <main className="admin-wrap">
        <div className="admin-heading">
          <div><span className="eyebrow">PDF CONTROL CENTER</span><h1>Class Notes Manager</h1><p>Upload PDFs class-wise, but unlock access folder-wise for students.</p></div>
          <span className="secure-pill">🔐 Private Storage</span>
        </div>

        <div className="admin-grid">
          <section className="panel">
            <div className="section-head"><div><span className="eyebrow">UPLOAD</span><h2>Add class notes</h2></div></div>
            <div className="form-stack">
              <label>Class<select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}><option value="">Select class</option>{classRows.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
              <label>Notes title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <label>PDF file<input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
              {file && <div className="file-chip">📄 {file.name} • {(file.size / 1024 / 1024).toFixed(2)} MB</div>}
              <button className="primary-btn" disabled={uploading} onClick={() => void uploadNote()}>{uploading ? "Uploading…" : "Upload Secure PDF"}</button>
            </div>
          </section>

          <section className="panel">
            <div className="section-head"><div><span className="eyebrow">FOLDER ACCESS</span><h2>Grant / revoke complete folder</h2></div></div>
            <div className="form-stack">
              <label>Notes folder<select value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)}><option value="">Select folder</option>{folderRows.map((f) => <option key={f.id} value={f.id}>{f.label} — {f.pdfCount} PDF{f.pdfCount === 1 ? "" : "s"}</option>)}</select></label>
              {selectedFolderMeta && <div className="folder-access-info"><strong>Complete access</strong><span>{selectedFolderMeta.pdfCount} current PDFs{selectedFolderMeta.childCount ? ` • ${selectedFolderMeta.childCount} subfolder${selectedFolderMeta.childCount === 1 ? "" : "s"} included` : ""}</span><small>Any PDF added later in this folder or its subfolders will unlock automatically.</small></div>}
              <label>Search student<input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Name, Login ID or mobile" /></label>
            </div>
            <div className="student-list">
              {selectedFolder ? filteredStudents.map((s) => {
                const granted = grantedIds.has(s.id);
                return <div className="student-row" key={s.id}><div><strong>{s.full_name}</strong><span>{s.login_id} • {s.mobile || "No mobile"}</span></div><button className={granted ? "danger-small" : "primary-small"} onClick={() => void setFolderAccess(s.id, !granted)}>{granted ? "Revoke Folder" : "Grant Folder"}</button></div>;
              }) : <div className="empty mini"><p>Select a folder first.</p></div>}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="section-head"><div><span className="eyebrow">LIBRARY</span><h2>Uploaded notes</h2></div><span className="count-chip">{notes.length}</span></div>
          {notes.length === 0 ? <div className="empty"><p>No PDFs uploaded yet.</p></div> : <div className="admin-note-list">{notes.map((n) => <div className="admin-note-row" key={n.id}><div className="pdf-icon">PDF</div><div className="grow"><span>{n.main_folder_id ? folderPath(n.main_folder_id) : n.subject_name || "Notes"}</span><strong>{n.class_title}</strong><p>{n.note_title}</p></div><button className="danger-small" onClick={() => void deleteNote(n)}>Delete</button></div>)}</div>}
        </section>
      </main>
    </div>
  );
}
