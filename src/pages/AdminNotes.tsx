import { useEffect, useMemo, useState, useRef } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { mainSupabase } from "@/lib/mainSupabase";
import { notesSupabase } from "@/lib/notesSupabase";
import { callNotesApi, type NoteItem } from "@/lib/notesApi";
import { MAIN_SITE_URL } from "@/lib/config";

type Folder = { id: string; name: string; parent_id: string | null };
type Video = { id: string; folder_id: string; title: string; is_active: boolean };
type Student = { id: string; full_name: string; login_id: string; mobile: string | null; optional_email?: string | null; is_active: boolean; test_access_enabled?: boolean };
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
  const [description, setDescription] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [accessType, setAccessType] = useState<"free" | "test_series" | "selected_users">("selected_users");
  const [published, setPublished] = useState(true);
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

  // Per-note access/editor. Existing student_note_access is reused.
  const noteAccessRequest = useRef(0);
  const [noteAccessReady, setNoteAccessReady] = useState(false);
  const [savingNoteId, setSavingNoteId] = useState("");
  const [savingAccess, setSavingAccess] = useState(false);
  const [selectedAccessNote, setSelectedAccessNote] = useState<string>("");
  const [noteGrantedIds, setNoteGrantedIds] = useState<Set<string>>(new Set());
  const [noteStudentQuery, setNoteStudentQuery] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [noteAccessFilter, setNoteAccessFilter] = useState<"all" | "free" | "test_series" | "selected_users">("all");
  const [notePublishedFilter, setNotePublishedFilter] = useState<"all" | "published" | "unpublished">("all");
  const [editingNoteId, setEditingNoteId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOrder, setEditOrder] = useState(0);

  async function loadMain() {
    const [f, v, s] = await Promise.all([
      mainSupabase.from("class_folders").select("id,name,parent_id").eq("is_active", true).order("name"),
      mainSupabase.from("class_videos").select("id,folder_id,title,is_active").eq("is_active", true).order("title"),
      mainSupabase.from("profiles").select("id,full_name,login_id,mobile,optional_email,is_active,test_access_enabled").eq("role", "student").order("full_name"),
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
    return students.filter((s) => `${s.full_name} ${s.login_id} ${s.mobile || ""} ${s.optional_email || ""}`.toLowerCase().includes(q)).slice(0, 80);
  }, [students, studentQuery]);

  const filteredListStudents = useMemo(() => {
    const q = listStudentQuery.trim().toLowerCase();
    if (!q) return students.slice(0, 50);
    return students.filter((s) => `${s.full_name} ${s.login_id} ${s.mobile || ""} ${s.optional_email || ""}`.toLowerCase().includes(q)).slice(0, 100);
  }, [students, listStudentQuery]);

  const filteredNoteStudents = useMemo(() => {
    const q = noteStudentQuery.trim().toLowerCase();
    const rows = q
      ? students.filter((s) => `${s.full_name} ${s.login_id} ${s.mobile || ""} ${s.optional_email || ""}`.toLowerCase().includes(q))
      : students;
    return rows.slice(0, 100);
  }, [students, noteStudentQuery]);

  const allowedNoteStudents = useMemo(
    () => students.filter((student) => noteGrantedIds.has(student.id)).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [students, noteGrantedIds]
  );

  const filteredNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    return notes.filter((note) => {
      const matchesSearch = !q || `${note.note_title} ${note.subject_name || ""} ${note.class_title || ""}`.toLowerCase().includes(q);
      const matchesAccess = noteAccessFilter === "all" || note.access_type === noteAccessFilter;
      const matchesPublished = notePublishedFilter === "all" || (notePublishedFilter === "published" ? note.is_active : !note.is_active);
      return matchesSearch && matchesAccess && matchesPublished;
    });
  }, [notes, noteSearch, noteAccessFilter, notePublishedFilter]);

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
        description: description.trim(),
        displayOrder,
        accessType,
        isActive: published,
        storagePath: signed.path,
      });

      toast.success(isFolderOnly ? "Folder notes uploaded securely" : "Class notes uploaded securely");
      setFile(null);
      setTitle("Class Notes");
      setDescription("");
      setDisplayOrder(0);
      setAccessType("selected_users");
      setPublished(true);
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

  async function updateNote(note: NoteItem, patch: Partial<Pick<NoteItem, "note_title" | "description" | "display_order" | "is_active" | "access_type">>) {
    if (savingNoteId) return false;
    setSavingNoteId(note.id);
    try {
      const payload: Record<string,unknown> = {noteId:note.id};
      if(patch.note_title !== undefined) payload.noteTitle=patch.note_title;
      if(patch.description !== undefined) payload.description=patch.description;
      if(patch.display_order !== undefined) payload.displayOrder=patch.display_order;
      if(patch.is_active !== undefined) payload.isActive=patch.is_active;
      if(patch.access_type !== undefined) payload.accessType=patch.access_type;
      await callNotesApi("adminUpdateNote",payload);
      setNotes(current=>current.map(item=>item.id===note.id?{...item,...patch}:item));
      toast.success("Note settings updated");return true;
    } catch(e) {toast.error((e as Error).message);return false;}
    finally {setSavingNoteId("");}
  }

  function openNoteEditor(note: NoteItem) {
    if (editingNoteId === note.id) { setEditingNoteId(""); return; }
    setEditingNoteId(note.id);
    setEditTitle(note.note_title);
    setEditDescription(note.description || "");
    setEditOrder(note.display_order || 0);
  }

  async function saveNoteEditor(note: NoteItem) {
    const nextTitle = editTitle.trim() || "Class Notes";
    if (await updateNote(note, { note_title: nextTitle, description: editDescription.trim(), display_order: editOrder })) setEditingNoteId("");
  }

  async function openSelectedUsers(noteId: string) {
    const request=++noteAccessRequest.current;
    setNoteAccessReady(false);
    setNoteGrantedIds(new Set());
    if (selectedAccessNote === noteId) {
      setSelectedAccessNote("");
      setNoteGrantedIds(new Set());
      return;
    }
    setSelectedAccessNote(noteId);
    setNoteStudentQuery("");
    try {
      const result = await callNotesApi<{ studentIds: string[] }>("adminListAccess", { noteId });
      if(request !== noteAccessRequest.current) return;
      setNoteGrantedIds(new Set(result.studentIds));
      setNoteAccessReady(true);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function setNoteStudentAccess(noteId: string, studentId: string, grant: boolean) {
    if(savingAccess || !noteAccessReady) return;
    const request=noteAccessRequest.current;
    setSavingAccess(true);
    try {
      await callNotesApi("adminSetAccess", { noteId, studentId, grant });
      if(request !== noteAccessRequest.current) return;
      setNoteGrantedIds((prev) => {
        const next = new Set(prev);
        if (grant) next.add(studentId); else next.delete(studentId);
        return next;
      });
      setNotes((current) => current.map((note) => note.id === noteId ? { ...note, granted_count: Math.max(0, (note.granted_count || 0) + (grant ? 1 : -1)) } : note));
      toast.success(grant ? "Student added to this note" : "Student removed from this note");
    } catch (e) { toast.error((e as Error).message); }
    finally {setSavingAccess(false);}
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
              <label>Description (optional)<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short topic / chapter description" /></label>
              <div className="admin-inline-fields">
                <label>Order<input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)} /></label>
                <label>Status<select value={published ? "published" : "unpublished"} onChange={(e) => setPublished(e.target.value === "published")}><option value="published">Published</option><option value="unpublished">Unpublished</option></select></label>
              </div>
              <label>Access type
                <select value={accessType} onChange={(e) => setAccessType(e.target.value as "free" | "test_series" | "selected_users")}><option value="free">FREE FOR ALL</option><option value="test_series">TEST SERIES ACCESS</option><option value="selected_users">SELECTED USERS</option></select>
              </label>
              <div className="folder-access-info"><strong>{accessType === "free" ? "FREE" : accessType === "test_series" ? "TEST SERIES" : "SELECTED USERS"}</strong><small>{accessType === "free" ? "Any logged-in active student can open this note." : accessType === "test_series" ? "Uses the main website's existing Test Series entitlement." : "Only students explicitly allowed for this note (plus existing compatible folder/list grants) can open it."}</small></div>
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
          <div className="section-head"><div><span className="eyebrow">LIBRARY</span><h2>Uploaded notes</h2><p>Search, filter and control each PDF without changing the existing storage path.</p></div><span className="count-chip">{filteredNotes.length}/{notes.length}</span></div>
          <div className="note-admin-filters">
            <input value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} placeholder="Search title, class or folder" />
            <select value={noteAccessFilter} onChange={(e) => setNoteAccessFilter(e.target.value as typeof noteAccessFilter)}><option value="all">All Notes</option><option value="free">Free for All</option><option value="test_series">Test Series</option><option value="selected_users">Selected Users</option></select>
            <select value={notePublishedFilter} onChange={(e) => setNotePublishedFilter(e.target.value as typeof notePublishedFilter)}><option value="all">All status</option><option value="published">Published</option><option value="unpublished">Unpublished</option></select>
          </div>
          {filteredNotes.length === 0 ? <div className="empty"><p>No notes match these filters.</p></div> : <div className="admin-note-list">{filteredNotes.map((n) => {
            const accessLabel = n.access_type === "free" ? "FREE" : n.access_type === "test_series" ? "TEST SERIES" : "SELECTED USERS";
            return <div className="admin-note-block" key={n.id}>
              <div className="admin-note-row">
                <div className="pdf-icon">PDF</div>
                <div className="grow"><span>{n.main_folder_id ? folderPath(n.main_folder_id) : n.subject_name || "Notes"}</span><strong>{n.main_class_id.startsWith("folder-") ? "Folder Notes" : n.class_title}</strong><p>{n.note_title}</p>{n.description && <small>{n.description}</small>}<div className="note-badges"><b className={`note-access-badge ${n.access_type}`}>{accessLabel}</b><b className={n.is_active ? "note-status-live" : "note-status-off"}>{n.is_active ? "PUBLISHED" : "UNPUBLISHED"}</b><span>Order {n.display_order || 0}</span>{n.access_type === "selected_users" && <span>{n.granted_count || 0} direct users</span>}</div></div>
                <div className="admin-note-actions">
                  <select disabled={!!savingNoteId} value={n.access_type} onChange={(e) => void updateNote(n, { access_type: e.target.value as NoteItem["access_type"] })}><option value="free">FREE FOR ALL</option><option value="test_series">TEST SERIES ACCESS</option><option value="selected_users">SELECTED USERS</option></select>
                  <button className="ghost-small" disabled={!!savingNoteId} onClick={() => void updateNote(n, { is_active: !n.is_active })}>{n.is_active ? "Unpublish" : "Publish"}</button>
                  <button className="ghost-small" onClick={() => openNoteEditor(n)}>{editingNoteId === n.id ? "Close Edit" : "Edit"}</button>
                  {n.access_type === "selected_users" && <button className="primary-small" onClick={() => void openSelectedUsers(n.id)}>{selectedAccessNote === n.id ? "Close Users" : "Manage Users"}</button>}
                  <button className="danger-small" onClick={() => void deleteNote(n)}>Delete</button>
                </div>
              </div>
              {editingNoteId === n.id && <div className="note-user-access-box note-edit-box"><div className="section-head"><div><strong>Edit Note Details</strong><p>PDF and storage path stay unchanged.</p></div></div><div className="note-edit-grid"><label>Title<input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></label><label>Order<input type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value) || 0)} /></label><label className="wide">Description<input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Optional description" /></label></div><button className="primary-small" disabled={!!savingNoteId} onClick={() => void saveNoteEditor(n)}>Save Details</button></div>}
              {selectedAccessNote === n.id && <div className="note-user-access-box"><div className="section-head"><div><strong>Selected Users Access</strong><p>Search by registered email, Login ID, name or mobile.</p></div><span className="count-chip">{noteGrantedIds.size}</span></div>{allowedNoteStudents.length > 0 && <div className="allowed-students-box"><strong>Currently allowed</strong><div>{allowedNoteStudents.map((student) => <span key={student.id}>{student.optional_email || student.login_id}<button title={`Remove ${student.full_name}`} disabled={savingAccess || !noteAccessReady} onClick={() => void setNoteStudentAccess(n.id, student.id, false)}>×</button></span>)}</div></div>}{!noteAccessReady && <p>Loading access list…</p>}<input disabled={!noteAccessReady} value={noteStudentQuery} onChange={(e) => setNoteStudentQuery(e.target.value)} placeholder="Student email / registered user" /><div className="student-list">{filteredNoteStudents.map((student) => { const granted = noteGrantedIds.has(student.id); return <div className="student-row" key={student.id}><div><strong>{student.full_name}</strong><span>{student.optional_email || student.login_id} • {student.login_id}</span></div><button className={granted ? "danger-small" : "primary-small"} disabled={savingAccess || !noteAccessReady} onClick={() => void setNoteStudentAccess(n.id, student.id, !granted)}>{granted ? "Remove" : "+ Add"}</button></div>; })}</div></div>}
            </div>;
          })}</div>}
        </section>
      </main>
    </div>
  );
}
