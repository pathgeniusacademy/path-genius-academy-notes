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
type AccessList = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  member_count: number;
  folder_count: number;
};

const FOLDER_ONLY = "__folder_only__";

export default function AdminNotes() {
  const { signOut } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);

  // Upload: folder first, class second.
  const [uploadFolder, setUploadFolder] = useState("");
  const [selectedClass, setSelectedClass] = useState(FOLDER_ONLY);
  const [title, setTitle] = useState("Class Notes");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Direct folder access.
  const [selectedFolder, setSelectedFolder] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());

  // Paid student lists.
  const [accessLists, setAccessLists] = useState<AccessList[]>([]);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [selectedList, setSelectedList] = useState("");
  const [listMemberIds, setListMemberIds] = useState<Set<string>>(new Set());
  const [folderListIds, setFolderListIds] = useState<Set<string>>(new Set());
  const [listStudentQuery, setListStudentQuery] = useState("");
  const [savingList, setSavingList] = useState(false);

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

  async function loadAccessLists() {
    try {
      const result = await callNotesApi<{ lists: AccessList[] }>("adminListAccessLists");
      setAccessLists(result.lists);
      if (selectedList && !result.lists.some((x) => x.id === selectedList)) setSelectedList("");
    } catch (e) { toast.error((e as Error).message); }
  }

  useEffect(() => { void loadMain(); void loadNotes(); void loadAccessLists(); }, []);

  useEffect(() => {
    if (!selectedFolder) {
      setGrantedIds(new Set());
      setFolderListIds(new Set());
      return;
    }
    Promise.all([
      callNotesApi<{ studentIds: string[] }>("adminListFolderAccess", { folderId: selectedFolder }),
      callNotesApi<{ listIds: string[] }>("adminListFolderListAccess", { folderId: selectedFolder }),
    ]).then(([studentsResult, listsResult]) => {
      setGrantedIds(new Set(studentsResult.studentIds));
      setFolderListIds(new Set(listsResult.listIds));
    }).catch((e) => toast.error(e.message));
  }, [selectedFolder]);

  useEffect(() => {
    if (!selectedList) { setListMemberIds(new Set()); return; }
    callNotesApi<{ studentIds: string[] }>("adminListAccessListMembers", { listId: selectedList })
      .then((r) => setListMemberIds(new Set(r.studentIds)))
      .catch((e) => toast.error(e.message));
  }, [selectedList]);

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

  const folderRows = useMemo(() => folders.map((folder) => {
    const scope = descendants(folder.id);
    const pdfCount = notes.filter((n) => n.main_folder_id && scope.has(n.main_folder_id)).length;
    const childCount = scope.size - 1;
    const classCount = videos.filter((v) => v.folder_id === folder.id).length;
    return { ...folder, label: folderPath(folder.id), pdfCount, childCount, classCount };
  }).sort((a, b) => a.label.localeCompare(b.label)), [folders, notes, videos, descendants]);

  const uploadClasses = useMemo(
    () => videos.filter((v) => v.folder_id === uploadFolder),
    [videos, uploadFolder]
  );

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students.slice(0, 40);
    return students.filter((s) => `${s.full_name} ${s.login_id} ${s.mobile || ""}`.toLowerCase().includes(q)).slice(0, 80);
  }, [students, studentQuery]);

  const filteredListStudents = useMemo(() => {
    const q = listStudentQuery.trim().toLowerCase();
    if (!q) return students.slice(0, 50);
    return students.filter((s) => `${s.full_name} ${s.login_id} ${s.mobile || ""}`.toLowerCase().includes(q)).slice(0, 100);
  }, [students, listStudentQuery]);

  const selectedFolderMeta = folderRows.find((f) => f.id === selectedFolder);
  const selectedListMeta = accessLists.find((l) => l.id === selectedList);

  async function uploadNote() {
    if (!uploadFolder) return toast.error("Select a folder first");
    if (!selectedClass) return toast.error("Select class or Folder Notes");
    if (!file) return toast.error("Select a PDF");
    if (file.type !== "application/pdf") return toast.error("Only PDF files are allowed");
    if (file.size > 25 * 1024 * 1024) return toast.error("PDF must be 25 MB or smaller");

    const folder = folders.find((f) => f.id === uploadFolder);
    if (!folder) return toast.error("Folder not found");

    const isFolderOnly = selectedClass === FOLDER_ONLY;
    const video = isFolderOnly ? null : videos.find((v) => v.id === selectedClass && v.folder_id === uploadFolder);
    if (!isFolderOnly && !video) return toast.error("Selected class is not inside this folder");

    const classKey = isFolderOnly ? `folder-${uploadFolder}` : video!.id;
    const classTitle = isFolderOnly ? "Folder Notes" : video!.title;

    setUploading(true);
    try {
      const signed = await callNotesApi<{ path: string; token: string }>("adminCreateUpload", {
        classId: classKey,
        originalName: file.name,
      });
      const { error: uploadError } = await notesSupabase.storage
        .from("class-notes")
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      await callNotesApi("adminCreateNote", {
        classId: classKey,
        folderId: uploadFolder,
        subjectName: folderPath(uploadFolder),
        classTitle,
        noteTitle: title.trim() || "Class Notes",
        storagePath: signed.path,
      });

      toast.success(isFolderOnly ? "Folder notes uploaded securely" : "Class notes uploaded securely");
      setFile(null);
      setTitle("Class Notes");
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
      toast.success(grant ? "Complete folder access granted" : "Direct folder access revoked");
      void loadNotes();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function createAccessList() {
    const name = newListName.trim();
    if (!name) return toast.error("Enter a list name");
    setSavingList(true);
    try {
      const result = await callNotesApi<{ list: AccessList }>("adminCreateAccessList", {
        name,
        description: newListDescription.trim(),
      });
      setNewListName("");
      setNewListDescription("");
      await loadAccessLists();
      setSelectedList(result.list.id);
      toast.success("Paid student list created");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingList(false); }
  }

  async function deleteAccessList() {
    if (!selectedList || !selectedListMeta) return;
    if (!confirm(`Delete list “${selectedListMeta.name}”? Students will lose access that comes only from this list.`)) return;
    try {
      await callNotesApi("adminDeleteAccessList", { listId: selectedList });
      setSelectedList("");
      setListMemberIds(new Set());
      await loadAccessLists();
      if (selectedFolder) {
        const r = await callNotesApi<{ listIds: string[] }>("adminListFolderListAccess", { folderId: selectedFolder });
        setFolderListIds(new Set(r.listIds));
      }
      toast.success("List deleted");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function setListMember(studentId: string, add: boolean) {
    if (!selectedList) return;
    try {
      await callNotesApi(add ? "adminAddAccessListMember" : "adminRemoveAccessListMember", { listId: selectedList, studentId });
      setListMemberIds((prev) => {
        const next = new Set(prev);
        if (add) next.add(studentId); else next.delete(studentId);
        return next;
      });
      await loadAccessLists();
      toast.success(add ? "Student added to list" : "Student removed from list");
    } catch (e) { toast.error((e as Error).message); }
  }

  async function setListFolderAccess(grant: boolean) {
    if (!selectedFolder) return toast.error("Select a folder in Folder Access first");
    if (!selectedList) return toast.error("Select a paid student list");
    try {
      await callNotesApi("adminSetListFolderAccess", { folderId: selectedFolder, listId: selectedList, grant });
      setFolderListIds((prev) => {
        const next = new Set(prev);
        if (grant) next.add(selectedList); else next.delete(selectedList);
        return next;
      });
      await loadAccessLists();
      toast.success(grant ? `Folder unlocked for ${selectedListMeta?.name || "list"}` : "List folder access revoked");
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
    <div className="admin-bg premium-admin-bg">
      <header className="admin-top premium-admin-top">
        <div><div className="brand premium-brand"><div className="brand-mark premium-brand-mark"><span>PG</span></div><div className="brand-copy"><strong>Path Genius Notes</strong><span>Admin Control Center</span></div></div></div>
        <div className="top-actions"><a href={MAIN_SITE_URL + "/admin/dashboard"} className="ghost-btn">Main Admin</a><button className="ghost-btn" onClick={() => void signOut()}>Logout</button></div>
      </header>

      <main className="admin-wrap premium-admin-wrap">
        <div className="admin-heading premium-admin-heading">
          <div><span className="eyebrow">PDF CONTROL CENTER</span><h1>Notes Command Center</h1><p>Upload, organize and unlock protected notes with folder-wise access.</p></div>
          <span className="secure-pill premium-admin-secure"><span className="pulse-dot" />Private Storage</span>
        </div>

        <section className="admin-stats">
          <div><span className="admin-stat-icon blue">PDF</span><p><strong>{notes.length}</strong><small>Uploaded PDFs</small></p></div>
          <div><span className="admin-stat-icon orange">▦</span><p><strong>{folders.length}</strong><small>Notes folders</small></p></div>
          <div><span className="admin-stat-icon teal">◎</span><p><strong>{students.length}</strong><small>Students</small></p></div>
          <div><span className="admin-stat-icon purple">◆</span><p><strong>{accessLists.length}</strong><small>Paid lists</small></p></div>
        </section>

        <div className="admin-grid">
          <section className="panel premium-panel">
            <div className="section-head"><div><span className="eyebrow">UPLOAD</span><h2>Add notes PDF</h2></div></div>
            <div className="form-stack">
              <label>1. Folder
                <select value={uploadFolder} onChange={(e) => { setUploadFolder(e.target.value); setSelectedClass(FOLDER_ONLY); }}>
                  <option value="">Select folder first</option>
                  {folderRows.map((f) => <option key={f.id} value={f.id}>{f.label} — {f.classCount} class{f.classCount === 1 ? "" : "es"}</option>)}
                </select>
              </label>
              <label>2. Class / Notes-only
                <select value={selectedClass} disabled={!uploadFolder} onChange={(e) => setSelectedClass(e.target.value)}>
                  <option value={FOLDER_ONLY}>📄 Folder Notes — no lecture required</option>
                  {uploadClasses.map((v) => <option key={v.id} value={v.id}>🎥 {v.title}</option>)}
                </select>
              </label>
              {uploadFolder && uploadClasses.length === 0 && <div className="folder-access-info"><strong>Notes-only folder ready</strong><small>This folder has no lecture yet. You can still upload as many PDFs as you want here.</small></div>}
              <label>Notes title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Complete Chapter Notes" /></label>
              <label>PDF file<input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
              {file && <div className="file-chip">📄 {file.name} • {(file.size / 1024 / 1024).toFixed(2)} MB</div>}
              <button className="primary-btn" disabled={uploading || !uploadFolder} onClick={() => void uploadNote()}>{uploading ? "Uploading…" : "Upload Secure PDF"}</button>
            </div>
          </section>

          <section className="panel premium-panel">
            <div className="section-head"><div><span className="eyebrow">FOLDER ACCESS</span><h2>Direct student access</h2></div></div>
            <div className="form-stack">
              <label>Notes folder<select value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)}><option value="">Select folder</option>{folderRows.map((f) => <option key={f.id} value={f.id}>{f.label} — {f.pdfCount} PDF{f.pdfCount === 1 ? "" : "s"}</option>)}</select></label>
              {selectedFolderMeta && <div className="folder-access-info"><strong>Complete folder access</strong><span>{selectedFolderMeta.pdfCount} current PDFs{selectedFolderMeta.childCount ? ` • ${selectedFolderMeta.childCount} subfolder${selectedFolderMeta.childCount === 1 ? "" : "s"} included` : ""}</span><small>Future PDFs in this folder/subfolders unlock automatically.</small></div>}
              <label>Search student<input value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Name, Login ID or mobile" /></label>
            </div>
            <div className="student-list">
              {selectedFolder ? filteredStudents.map((s) => {
                const granted = grantedIds.has(s.id);
                return <div className="student-row" key={s.id}><div><strong>{s.full_name}</strong><span>{s.login_id} • {s.mobile || "No mobile"}</span></div><button className={granted ? "danger-small" : "primary-small"} onClick={() => void setFolderAccess(s.id, !granted)}>{granted ? "Revoke Direct" : "Grant Direct"}</button></div>;
              }) : <div className="empty mini"><p>Select a folder first.</p></div>}
            </div>
          </section>
        </div>

        <section className="panel premium-panel">
          <div className="section-head"><div><span className="eyebrow">PAID STUDENT LISTS</span><h2>List 1, List 2… manage once, unlock folders in one click</h2></div><span className="count-chip">{accessLists.length} list{accessLists.length === 1 ? "" : "s"}</span></div>
          <div className="list-admin-grid">
            <div className="list-create-box">
              <h3>Create new list</h3>
              <div className="form-stack compact">
                <label>List name<input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="e.g. Real Analysis Paid Batch" /></label>
                <label>Description (optional)<input value={newListDescription} onChange={(e) => setNewListDescription(e.target.value)} placeholder="e.g. August 2026 paid students" /></label>
                <button className="primary-btn" disabled={savingList} onClick={() => void createAccessList()}>{savingList ? "Creating…" : "+ Create Student List"}</button>
              </div>
            </div>

            <div className="list-manage-box">
              <div className="form-stack compact">
                <label>Select paid list
                  <select value={selectedList} onChange={(e) => setSelectedList(e.target.value)}>
                    <option value="">Select list</option>
                    {accessLists.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.member_count} student{l.member_count === 1 ? "" : "s"}</option>)}
                  </select>
                </label>
              </div>
              {selectedListMeta && <div className="selected-list-summary"><div><strong>{selectedListMeta.name}</strong><span>{selectedListMeta.member_count} members • {selectedListMeta.folder_count} folder grants</span>{selectedListMeta.description && <small>{selectedListMeta.description}</small>}</div><button className="danger-small" onClick={() => void deleteAccessList()}>Delete List</button></div>}

              {selectedList && <>
                <div className="list-folder-grant">
                  <div><strong>Apply this list to folder</strong><span>{selectedFolderMeta ? selectedFolderMeta.label : "Select a folder in Folder Access above"}</span></div>
                  {selectedFolder ? (
                    folderListIds.has(selectedList)
                      ? <button className="danger-small" onClick={() => void setListFolderAccess(false)}>Revoke List From Folder</button>
                      : <button className="primary-small" onClick={() => void setListFolderAccess(true)}>✓ Grant Whole List</button>
                  ) : <button className="primary-small" disabled>Select Folder First</button>}
                </div>

                <label className="list-search-label">Add / remove students<input value={listStudentQuery} onChange={(e) => setListStudentQuery(e.target.value)} placeholder="Search name, Login ID or mobile" /></label>
                <div className="student-list list-members">
                  {filteredListStudents.map((s) => {
                    const member = listMemberIds.has(s.id);
                    return <div className="student-row" key={s.id}><div><strong>{s.full_name}</strong><span>{s.login_id} • {s.mobile || "No mobile"}</span></div><button className={member ? "danger-small" : "primary-small"} onClick={() => void setListMember(s.id, !member)}>{member ? "Remove" : "+ Add"}</button></div>;
                  })}
                </div>
              </>}
            </div>
          </div>
          <div className="privacy-note"><strong>Automatic list access:</strong> if you grant a folder to a list, every current member gets it. Add a student later and the same folder access applies automatically. Remove a student and list-based access is removed automatically (unless that student also has direct access or access through another list).</div>
        </section>

        <section className="panel premium-panel">
          <div className="section-head"><div><span className="eyebrow">LIBRARY</span><h2>Uploaded notes</h2></div><span className="count-chip">{notes.length}</span></div>
          {notes.length === 0 ? <div className="empty"><p>No PDFs uploaded yet.</p></div> : <div className="admin-note-list">{notes.map((n) => <div className="admin-note-row" key={n.id}><div className="pdf-icon">PDF</div><div className="grow"><span>{n.main_folder_id ? folderPath(n.main_folder_id) : n.subject_name || "Notes"}</span><strong>{n.main_class_id.startsWith("folder-") ? "Folder Notes" : n.class_title}</strong><p>{n.note_title}</p></div><button className="danger-small" onClick={() => void deleteNote(n)}>Delete</button></div>)}</div>}
        </section>
      </main>
    </div>
  );
}
