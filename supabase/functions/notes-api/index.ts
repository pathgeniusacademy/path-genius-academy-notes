import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, degrees } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function getNotesSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    const parsed = JSON.parse(raw);
    const key = parsed?.default || Object.values(parsed || {})[0];
    if (typeof key === "string" && key) return key;
  }
  throw new Error("Notes secret key is not available in Edge Function environment.");
}

const NOTES_URL = Deno.env.get("SUPABASE_URL")!;
const notesAdmin = createClient(NOTES_URL, getNotesSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAIN_URL = Deno.env.get("MAIN_SUPABASE_URL") || "";
const MAIN_KEY = Deno.env.get("MAIN_SUPABASE_PUBLISHABLE_KEY") || "";

type AccessType = "free" | "test_series" | "selected_users";

type MainProfile = {
  id: string;
  role: "admin" | "student";
  full_name: string;
  login_id: string;
  mobile: string | null;
  optional_email?: string | null;
  is_active: boolean;
  test_access_enabled?: boolean;
  access_expiry?: string | null;
};

type NoteRow = {
  id: string;
  main_class_id: string;
  main_folder_id: string | null;
  subject_name: string | null;
  class_title: string;
  note_title: string;
  storage_path?: string;
  is_active: boolean;
  access_type?: string | null;
  description?: string | null;
  display_order?: number | null;
  created_at?: string;
  updated_at?: string;
};

function bearer(req: Request) {
  const value = req.headers.get("Authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function requireMainUser(req: Request): Promise<{ profile: MainProfile; token: string; main: any }> {
  const token = bearer(req);
  if (!token) throw new Error("UNAUTHORIZED: Please login again.");
  if (!MAIN_URL || !MAIN_KEY) throw new Error("SERVER_CONFIG: Main Supabase settings are missing.");

  const main = createClient(MAIN_URL, MAIN_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await main.auth.getUser(token);
  if (userError || !userData.user) throw new Error("UNAUTHORIZED: Session is invalid or expired.");

  const { data, error } = await main
    .from("profiles")
    .select("id,role,full_name,login_id,mobile,optional_email,is_active,test_access_enabled,access_expiry")
    .eq("id", userData.user.id)
    .single();

  if (error || !data) throw new Error("UNAUTHORIZED: Student profile not found.");
  const profile = data as MainProfile;
  if (!profile.is_active) throw new Error("UNAUTHORIZED: This account is not active.");
  return { profile, token, main };
}

function requireAdmin(profile: MainProfile) {
  if (profile.role !== "admin") throw new Error("FORBIDDEN: Admin access required.");
}

function normalizeAccessType(value: unknown): AccessType {
  return value === "free" || value === "test_series" || value === "selected_users"
    ? value
    : "selected_users";
}

function hasCurrentTestSeriesAccess(profile: MainProfile) {
  if (profile.role !== "student" || profile.test_access_enabled !== true) return false;
  if (!profile.access_expiry) return true;
  // Same inclusive DATE boundary as the Main SQL payment gate; malformed dates deny access.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.access_expiry)) return false;
  const expiry = new Date(`${profile.access_expiry}T00:00:00Z`);
  return !Number.isNaN(expiry.getTime()) && expiry.toISOString().slice(0,10) === profile.access_expiry && profile.access_expiry >= new Date().toISOString().slice(0,10);
}

async function readRows(query: any) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function folderAncestors(folderId: string | null, tree: Array<{id:string;parent_id:string|null}>) {
  const byId = new Map(tree.map(row=>[row.id,row]));
  const result: string[] = [];
  let current=folderId;
  while(current && !result.includes(current)) { result.push(current); current=byId.get(current)?.parent_id || null; }
  return result;
}

async function loadSelectedAccess(profile: MainProfile, main: any) {
  // One batch per catalog request, instead of repeating up to five queries per PDF.
  const [direct, folderGrants, memberships, activeLists, tree] = await Promise.all([
    readRows(notesAdmin.from("student_note_access").select("note_id").eq("student_id",profile.id).eq("is_granted",true)),
    readRows(notesAdmin.from("note_folder_access").select("folder_id").eq("student_id",profile.id).eq("is_granted",true)),
    readRows(notesAdmin.from("note_access_list_members").select("list_id").eq("student_id",profile.id)),
    readRows(notesAdmin.from("note_access_lists").select("id").eq("is_active",true)),
    readRows(main.from("class_folders").select("id,parent_id")),
  ]);
  const listIds=memberships.map((row:any)=>row.list_id).filter((id:string)=>activeLists.some((row:any)=>row.id===id));
  const listGrants=listIds.length ? await readRows(notesAdmin.from("note_folder_list_access").select("folder_id").eq("is_granted",true).in("list_id",listIds)) : [];
  return {direct:new Set(direct.map((row:any)=>row.note_id)),folders:new Set([...folderGrants,...listGrants].map((row:any)=>row.folder_id)),tree};
}
type SelectedAccess = Awaited<ReturnType<typeof loadSelectedAccess>>;

async function canAccessNote(profile: MainProfile, note: NoteRow, main: any, selected?: SelectedAccess) {
  if (!note.is_active) return false;
  if (profile.role === "admin") return true;
  const accessType = normalizeAccessType(note.access_type);
  if (accessType === "free") return true;
  if (accessType === "test_series") return hasCurrentTestSeriesAccess(profile);
  const access=selected || await loadSelectedAccess(profile,main);
  return access.direct.has(note.id) || folderAncestors(note.main_folder_id,access.tree).some(id=>access.folders.has(id));
}

async function decorateNotes(profile: MainProfile, notes: NoteRow[], main: any) {
  const selected=profile.role === "student" && notes.some(note=>normalizeAccessType(note.access_type)==="selected_users") ? await loadSelectedAccess(profile,main) : undefined;
  return await Promise.all(notes.map(async note=>({...note,access_type:normalizeAccessType(note.access_type),unlocked:await canAccessNote(profile,note,main,selected)})));
}

function validateAccessType(value: unknown): AccessType {
  if(value!=="free" && value!=="test_series" && value!=="selected_users") throw new Error("BAD_REQUEST: Invalid access type.");
  return value;
}
function validateOrder(value: unknown) {
  const number=Number(value);
  if(!Number.isSafeInteger(number)) throw new Error("BAD_REQUEST: Order must be a whole number.");
  return number;
}

function cleanFileName(name: string) {
  const base = (name || "class-notes.pdf")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "class-notes.pdf";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function asciiSafe(value: string | null | undefined) {
  return (value || "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/\s+/g, " ").trim();
}

async function watermarkPdf(input: Uint8Array, profile: { student_name: string; student_mobile: string | null; login_id: string }) {
  const pdf = await PDFDocument.load(input, { updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const name = asciiSafe(profile.student_name) || "Student";
  const mobile = asciiSafe(profile.student_mobile) || "Registered Student";
  const loginId = asciiSafe(profile.login_id) || "PGA";
  const identity = `${name} | ${mobile} | ${loginId}`;
  const brand = "Path Genius Academy";

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const diagonalSize = Math.max(12, Math.min(22, width / 28));
    const line = `${brand} | ${identity}`;
    const yPoints = [0.20, 0.43, 0.66, 0.86];
    for (let i = 0; i < yPoints.length; i++) {
      page.drawText(line, {
        x: i % 2 === 0 ? width * 0.04 : width * 0.16,
        y: height * yPoints[i],
        size: diagonalSize,
        font: bold,
        color: rgb(0.15, 0.20, 0.32),
        opacity: 0.085,
        rotate: degrees(-28),
      });
    }
    const footer = `${brand}  |  ${identity}`;
    let footerSize = Math.max(7, Math.min(10, width / 60));
    while (regular.widthOfTextAtSize(footer, footerSize) > width - 36 && footerSize > 6) footerSize -= 0.5;
    page.drawText(footer, { x: 18, y: 12, size: footerSize, font: regular, color: rgb(0.12, 0.16, 0.24), opacity: 0.34 });
  }
  return await pdf.save();
}

async function handleDownload(req: Request, ticketId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return json({ error: "Invalid download ticket." }, 400);
  const now = new Date().toISOString();
  const { data: ticket, error: ticketError } = await notesAdmin
    .from("note_download_tickets")
    .select("id,student_id,note_id,student_name,student_mobile,login_id,used_at,expires_at,created_at")
    .eq("id", ticketId)
    .gt("expires_at", now)
    .maybeSingle();
  if (ticketError || !ticket) return json({ error: "This download link is expired." }, 410);

  const { data: note, error: noteError } = await notesAdmin
    .from("notes")
    .select("id,note_title,class_title,storage_path,is_active,updated_at")
    .eq("id", ticket.note_id)
    .eq("is_active", true)
    .maybeSingle();
  if (noteError || !note) return json({ error: "Notes file is no longer available." }, 404);

  if (note.updated_at && new Date(note.updated_at).getTime() > new Date(ticket.created_at).getTime()) return json({error:"Note changed. Please open it again."},410);

  const { data: fileBlob, error: fileError } = await notesAdmin.storage.from("class-notes").download(note.storage_path);
  if (fileError || !fileBlob) return json({ error: "Could not read the original PDF." }, 500);

  try {
    const original = new Uint8Array(await fileBlob.arrayBuffer());
    const watermarked = await watermarkPdf(original, ticket);
    await notesAdmin.from("note_download_logs").insert({ student_id: ticket.student_id, note_id: ticket.note_id, student_name: ticket.student_name, student_mobile: ticket.student_mobile, downloaded_at: now });
    const filename = cleanFileName(`${note.class_title}-${note.note_title}.pdf`);
    const totalLength = watermarked.byteLength;
    if (!ticket.used_at) await notesAdmin.from("note_download_tickets").update({ used_at: now }).eq("id", ticket.id).is("used_at", null);

    const baseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Accept-Ranges": "bytes",
      "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Range, Accept-Ranges",
    };

    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
      if (match) {
        const suffix = !match[1] && !!match[2];
        let start = suffix ? Math.max(0,totalLength-Number(match[2])) : Number(match[1] || 0);
        let end = suffix ? totalLength-1 : match[2] ? Number(match[2]) : totalLength-1;
        if ((!match[1] && !match[2]) || (suffix && Number(match[2])<=0)) start=totalLength;
        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= totalLength) end = totalLength - 1;
        if (start <= end && start < totalLength) {
          const chunk = watermarked.slice(start, end + 1);
          return new Response(req.method === "HEAD" ? null : chunk, { status: 206, headers: { ...baseHeaders, "Content-Range": `bytes ${start}-${end}/${totalLength}`, "Content-Length": String(chunk.byteLength) } });
        }
      }
      return new Response(null, { status: 416, headers: { ...baseHeaders, "Content-Range": `bytes */${totalLength}` } });
    }

    return new Response(req.method === "HEAD" ? null : watermarked, { status: 200, headers: { ...baseHeaders, "Content-Length": String(totalLength) } });
  } catch (error) {
    console.error("PDF watermark error", error);
    return json({ error: "Could not personalize this PDF. Please contact support." }, 500);
  }
}

async function expireOutstandingTickets() {
  const now=new Date().toISOString();
  const {error}=await notesAdmin.from("note_download_tickets").update({expires_at:now}).gt("expires_at",now);
  if(error) throw error;
}

const noteSelect = "id,main_class_id,main_folder_id,subject_name,class_title,note_title,is_active,access_type,description,display_order,created_at";

async function handleAction(req: Request) {
  const { profile, main } = await requireMainUser(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (action === "myNotes") {
    if (profile.role !== "student") return json({ notes: [] });
    const { data: notes, error } = await notesAdmin.from("notes").select(noteSelect).eq("is_active", true).order("display_order").order("created_at", { ascending: false });
    if (error) throw error;
    return json({ notes: await decorateNotes(profile, (notes || []) as NoteRow[], main) });
  }

  if (action === "listClassNotes") {
    const classId = String(body?.classId || "");
    if (!classId) return json({ error: "Class ID is required." }, 400);
    const { data: notes, error } = await notesAdmin.from("notes").select(noteSelect).eq("main_class_id", classId).eq("is_active", true).order("display_order").order("created_at", { ascending: false });
    if (error) throw error;
    return json({ notes: await decorateNotes(profile, (notes || []) as NoteRow[], main) });
  }

  if (action === "listFolderNotes") {
    const folderId = String(body?.folderId || "");
    if (!folderId) return json({ error: "Folder ID is required." }, 400);
    const { data: notes, error } = await notesAdmin.from("notes").select(noteSelect).eq("main_folder_id", folderId).eq("is_active", true).order("display_order").order("created_at", { ascending: false });
    if (error) throw error;
    return json({ notes: await decorateNotes(profile, (notes || []) as NoteRow[], main) });
  }

  if (action === "createDownloadTicket") {
    if (profile.role !== "student") return json({ error: "Student access required." }, 403);
    const noteId = String(body?.noteId || "");
    if (!noteId) return json({ error: "Note ID is required." }, 400);
    const { data: note, error: noteError } = await notesAdmin.from("notes").select(`${noteSelect},storage_path`).eq("id", noteId).eq("is_active", true).maybeSingle();
    if (noteError) throw noteError;
    if (!note) return json({ error: "Notes are not available." }, 404);
    if (!(await canAccessNote(profile, note as NoteRow, main))) return json({ error: "You do not have access to this note." }, 403);

    const { data: ticket, error } = await notesAdmin.from("note_download_tickets").insert({
      student_id: profile.id,
      note_id: noteId,
      student_name: profile.full_name || profile.login_id,
      student_mobile: profile.mobile,
      login_id: profile.login_id,
      expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    }).select("id").single();
    if (error) throw error;
    // Recheck after insertion: a revoke committed between the first access check
    // and ticket creation must not leave a fresh usable ticket behind.
    const { data: currentNote, error: currentError } = await notesAdmin.from("notes").select(noteSelect).eq("id", noteId).eq("is_active", true).maybeSingle();
    if (currentError) throw currentError;
    if (!currentNote || !(await canAccessNote(profile, currentNote as NoteRow, main))) {
      const { error: expireError } = await notesAdmin.from("note_download_tickets").update({expires_at:new Date().toISOString()}).eq("id", ticket.id);
      if (expireError) throw expireError;
      return json({error:"Note access changed. Please refresh your notes."},403);
    }
    const downloadUrl = `${NOTES_URL.replace(/\/$/, "")}/functions/v1/notes-api?ticket=${encodeURIComponent(ticket.id)}`;
    return json({ downloadUrl, fileName: cleanFileName(`${note.class_title}-${note.note_title}.pdf`) });
  }

  requireAdmin(profile);

  if (action === "adminDeleteStudentData") {
    const studentId = String(body?.studentId || "");
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || studentId === profile.id) return json({error:"Invalid student."},400);
    const {data: target, error: targetError} = await main.from("profiles").select("id,role,is_active").eq("id",studentId).maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.role !== "student" || target.is_active) return json({error:"Deactivate the student in Main before deleting their Notes data."},409);
    for (const table of ["note_download_tickets","note_download_logs","student_note_access","note_folder_access","note_access_list_members"]) {
      const {error} = await notesAdmin.from(table).delete().eq("student_id",studentId);
      if (error) throw error;
    }
    // Shared PDFs, folders and paid lists are intentionally retained.
    return json({ok:true});
  }

  if (action === "adminListNotes") {
    const { data: notes, error } = await notesAdmin.from("notes").select(noteSelect).order("display_order").order("created_at", { ascending: false });
    if (error) throw error;
    const { data: access } = await notesAdmin.from("student_note_access").select("note_id").eq("is_granted", true);
    const counts = new Map<string, number>();
    for (const row of access || []) counts.set((row as any).note_id, (counts.get((row as any).note_id) || 0) + 1);
    return json({ notes: (notes || []).map((n: any) => ({ ...n, access_type: normalizeAccessType(n.access_type), granted_count: counts.get(n.id) || 0 })) });
  }

  if (action === "adminCreateUpload") {
    const classId = String(body?.classId || "");
    const originalName = cleanFileName(String(body?.originalName || "class-notes.pdf"));
    if (!classId) return json({ error: "Class ID is required." }, 400);
    const path = `${classId}/${crypto.randomUUID()}-${originalName}`;
    const { data, error } = await notesAdmin.storage.from("class-notes").createSignedUploadUrl(path);
    if (error || !data) throw error || new Error("Could not create secure upload URL.");
    return json({ path: data.path || path, token: data.token });
  }

  if (action === "adminCreateNote") {
    const classId = String(body?.classId || "");
    const folderId = body?.folderId ? String(body.folderId) : null;
    const subjectName = body?.subjectName ? String(body.subjectName) : null;
    const classTitle = String(body?.classTitle || "");
    const noteTitle = String(body?.noteTitle || "Class Notes");
    const storagePath = String(body?.storagePath || "");
    const accessType = validateAccessType(body?.accessType ?? "selected_users");
    const description = body?.description ? String(body.description) : null;
    const displayOrder = validateOrder(body?.displayOrder ?? 0);
    const isActive = body?.isActive !== false;
    if (!classId || !classTitle || !storagePath || !storagePath.startsWith(`${classId}/`)) return json({ error: "Invalid notes metadata." }, 400);
    const { data, error } = await notesAdmin.from("notes").insert({ main_class_id: classId, main_folder_id: folderId, subject_name: subjectName, class_title: classTitle, note_title: noteTitle, storage_path: storagePath, is_active: isActive, access_type: accessType, description, display_order: displayOrder }).select("id").single();
    if (error) throw error;
    return json({ ok: true, id: data.id });
  }

  if (action === "adminUpdateNote") {
    const noteId = String(body?.noteId || "");
    if (!noteId) return json({ error: "Note ID is required." }, 400);
    const patch: Record<string, unknown> = {};
    if (body?.noteTitle !== undefined) patch.note_title = String(body.noteTitle || "Class Notes").trim() || "Class Notes";
    if (body?.description !== undefined) patch.description = body.description ? String(body.description) : null;
    if (body?.displayOrder !== undefined) patch.display_order = validateOrder(body.displayOrder);
    if (body?.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    if (body?.accessType !== undefined) patch.access_type = validateAccessType(body.accessType);
    const { error } = await notesAdmin.from("notes").update(patch).eq("id", noteId);
    if (error) throw error;
    await expireOutstandingTickets();
    return json({ ok: true });
  }

  if (action === "adminListAccess") {
    const noteId = String(body?.noteId || "");
    const { data, error } = await notesAdmin.from("student_note_access").select("student_id").eq("note_id", noteId).eq("is_granted", true);
    if (error) throw error;
    return json({ studentIds: (data || []).map((x: any) => x.student_id) });
  }

  if (action === "adminSetAccess") {
    const noteId = String(body?.noteId || "");
    const studentId = String(body?.studentId || "");
    const grant = Boolean(body?.grant);
    if (!noteId || !studentId) return json({ error: "Note and student are required." }, 400);
    const payload = { student_id: studentId, note_id: noteId, is_granted: grant, granted_at: new Date().toISOString(), revoked_at: grant ? null : new Date().toISOString() };
    const { error } = await notesAdmin.from("student_note_access").upsert(payload, { onConflict: "student_id,note_id" });
    if (error) throw error;
    await expireOutstandingTickets();
    return json({ ok: true });
  }

  if (action === "adminListFolderAccess") {
    const folderId = String(body?.folderId || "");
    const { data, error } = await notesAdmin.from("note_folder_access").select("student_id").eq("folder_id", folderId).eq("is_granted", true);
    if (error) throw error;
    return json({ studentIds: (data || []).map((x: any) => x.student_id) });
  }

  if (action === "adminSetFolderAccess") {
    const folderId = String(body?.folderId || "");
    const studentId = String(body?.studentId || "");
    const grant = Boolean(body?.grant);
    if (!folderId || !studentId) return json({ error: "Folder and student are required." }, 400);
    const { error } = await notesAdmin.from("note_folder_access").upsert({ student_id: studentId, folder_id: folderId, is_granted: grant, granted_at: new Date().toISOString(), revoked_at: grant ? null : new Date().toISOString() }, { onConflict: "student_id,folder_id" });
    if (error) throw error;
    await expireOutstandingTickets();
    return json({ ok: true });
  }

  if (action === "adminListAccessLists") {
    const { data: lists, error } = await notesAdmin.from("note_access_lists").select("id,name,description,is_active,created_at").eq("is_active", true).order("created_at", { ascending: false });
    if (error) throw error;
    const { data: members } = await notesAdmin.from("note_access_list_members").select("list_id");
    const { data: folders } = await notesAdmin.from("note_folder_list_access").select("list_id").eq("is_granted", true);
    const memberCounts = new Map<string, number>(); const folderCounts = new Map<string, number>();
    for (const row of members || []) memberCounts.set((row as any).list_id, (memberCounts.get((row as any).list_id) || 0) + 1);
    for (const row of folders || []) folderCounts.set((row as any).list_id, (folderCounts.get((row as any).list_id) || 0) + 1);
    return json({ lists: (lists || []).map((row: any) => ({ ...row, member_count: memberCounts.get(row.id) || 0, folder_count: folderCounts.get(row.id) || 0 })) });
  }

  if (action === "adminCreateAccessList") {
    const name = String(body?.name || "").trim();
    if (!name) return json({ error: "List name is required." }, 400);
    const { data, error } = await notesAdmin.from("note_access_lists").insert({ name, description: String(body?.description || "").trim() || null }).select("id,name,description,is_active").single();
    if (error) throw error;
    return json({ list: { ...data, member_count: 0, folder_count: 0 } });
  }

  if (action === "adminDeleteAccessList") {
    const listId = String(body?.listId || "");
    const { error } = await notesAdmin.from("note_access_lists").delete().eq("id", listId);
    if (error) throw error;
    await expireOutstandingTickets();
    return json({ ok: true });
  }

  if (action === "adminListAccessListMembers") {
    const listId = String(body?.listId || "");
    const { data, error } = await notesAdmin.from("note_access_list_members").select("student_id").eq("list_id", listId);
    if (error) throw error;
    return json({ studentIds: (data || []).map((x: any) => x.student_id) });
  }

  if (action === "adminAddAccessListMember" || action === "adminRemoveAccessListMember") {
    const listId = String(body?.listId || "");
    const studentId = String(body?.studentId || "");
    if (!listId || !studentId) return json({ error: "List and student are required." }, 400);
    const query = action === "adminAddAccessListMember"
      ? notesAdmin.from("note_access_list_members").upsert({ list_id: listId, student_id: studentId }, { onConflict: "list_id,student_id" })
      : notesAdmin.from("note_access_list_members").delete().eq("list_id", listId).eq("student_id", studentId);
    const { error } = await query;
    if (error) throw error;
    await expireOutstandingTickets();
    return json({ ok: true });
  }

  if (action === "adminListFolderListAccess") {
    const folderId = String(body?.folderId || "");
    const { data, error } = await notesAdmin.from("note_folder_list_access").select("list_id").eq("folder_id", folderId).eq("is_granted", true);
    if (error) throw error;
    return json({ listIds: (data || []).map((x: any) => x.list_id) });
  }

  if (action === "adminSetListFolderAccess") {
    const folderId = String(body?.folderId || "");
    const listId = String(body?.listId || "");
    const grant = Boolean(body?.grant);
    if (!folderId || !listId) return json({ error: "Folder and list are required." }, 400);
    const { error } = await notesAdmin.from("note_folder_list_access").upsert({ folder_id: folderId, list_id: listId, is_granted: grant, granted_at: new Date().toISOString(), revoked_at: grant ? null : new Date().toISOString() }, { onConflict: "folder_id,list_id" });
    if (error) throw error;
    await expireOutstandingTickets();
    return json({ ok: true });
  }

  if (action === "adminDeleteNote") {
    const noteId = String(body?.noteId || "");
    const { data: note, error: noteError } = await notesAdmin.from("notes").select("id,storage_path").eq("id", noteId).maybeSingle();
    if (noteError) throw noteError;
    if (!note) return json({ ok: true });
    await notesAdmin.storage.from("class-notes").remove([note.storage_path]);
    const { error } = await notesAdmin.from("notes").delete().eq("id", noteId);
    if (error) throw error;
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const ticket = url.searchParams.get("ticket");
    if ((req.method === "GET" || req.method === "HEAD") && ticket) return await handleDownload(req, ticket);
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    return await handleAction(req);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    if (message.startsWith("BAD_REQUEST:")) return json({error:message.replace("BAD_REQUEST:","").trim()},400);
    if (message.startsWith("UNAUTHORIZED:")) return json({ error: message.replace("UNAUTHORIZED:", "").trim() }, 401);
    if (message.startsWith("FORBIDDEN:")) return json({ error: message.replace("FORBIDDEN:", "").trim() }, 403);
    if (message.startsWith("SERVER_CONFIG:")) return json({ error: "Server configuration is incomplete." }, 500);
    return json({ error: "Server error. Please try again." }, 500);
  }
});
