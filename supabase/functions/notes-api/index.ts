import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, degrees, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition, Content-Type",
};

const MAIN_URL = Deno.env.get("MAIN_SUPABASE_URL") || "https://okbrppimozvokpkzboto.supabase.co";
const MAIN_KEY = Deno.env.get("MAIN_SUPABASE_PUBLISHABLE_KEY") || "sb_publishable_pkCgThwo3kwMnZpNrekegA_clF7ex5w";
const NOTES_URL = Deno.env.get("SUPABASE_URL")!;
const NOTES_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "class-notes";

const notesAdmin = createClient(NOTES_URL, NOTES_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type MainProfile = {
  id: string;
  role: "admin" | "student";
  full_name: string;
  login_id: string;
  mobile: string | null;
  is_active: boolean;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeAscii(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/\s+/g, " ").trim();
}

function safeFileName(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100) || "class-notes.pdf";
}

async function verifyMainUser(req: Request): Promise<{ profile: MainProfile; token: string; main: ReturnType<typeof createClient> }> {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Response(JSON.stringify({ error: "Login required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const main = createClient(MAIN_URL, MAIN_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await main.auth.getUser(token);
  if (userError || !userData.user) {
    throw new Response(JSON.stringify({ error: "Invalid or expired login" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { data: profile, error: profileError } = await main
    .from("profiles")
    .select("id,role,full_name,login_id,mobile,is_active")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile) {
    throw new Response(JSON.stringify({ error: "Student profile not found" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const p = profile as MainProfile;
  if (p.role === "student" && !p.is_active) {
    throw new Response(JSON.stringify({ error: "This student account is not active" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return { profile: p, token, main };
}

function requireAdmin(profile: MainProfile) {
  if (profile.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

async function createWatermarkedPdf(original: Uint8Array, name: string, mobile: string | null, loginId: string) {
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const who = safeAscii(`${name} • ${mobile || "No mobile"} • ${loginId}`);
  const brand = "Path Genius Academy";
  const watermark = safeAscii(`${brand} • ${who}`);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const fontSize = Math.max(8, Math.min(12, width / 55));
    const textWidth = font.widthOfTextAtSize(watermark, fontSize);
    const opacity = 0.13;
    const ys = [height * 0.22, height * 0.5, height * 0.78];
    ys.forEach((y, row) => {
      const x = row % 2 === 0 ? -textWidth * 0.05 : width * 0.22;
      page.drawText(watermark, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.30, 0.36, 0.45),
        rotate: degrees(-28),
        opacity,
      });
    });

    const footer = safeAscii(`${brand} • ${who}`);
    const footerSize = Math.max(6.5, Math.min(8.5, width / 75));
    const footerWidth = bold.widthOfTextAtSize(footer, footerSize);
    page.drawText(footer, {
      x: Math.max(18, (width - footerWidth) / 2),
      y: 12,
      size: footerSize,
      font: bold,
      color: rgb(0.25, 0.31, 0.40),
      opacity: 0.55,
    });
  }
  return new Uint8Array(await pdf.save());
}

async function handleTicketDownload(ticketId: string) {
  const { data: ticket, error: ticketError } = await notesAdmin
    .from("note_download_tickets")
    .select("id,student_id,note_id,student_name,student_mobile,login_id,expires_at,used_at")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError || !ticket) return new Response("Invalid download link", { status: 404, headers: corsHeaders });
  if (ticket.used_at) return new Response("This download link has already been used", { status: 410, headers: corsHeaders });
  if (new Date(ticket.expires_at).getTime() < Date.now()) return new Response("This download link has expired", { status: 410, headers: corsHeaders });

  const { data: note, error: noteError } = await notesAdmin
    .from("notes")
    .select("id,note_title,class_title,storage_path,is_active")
    .eq("id", ticket.note_id)
    .maybeSingle();
  if (noteError || !note || !note.is_active) return new Response("Notes are not available", { status: 404, headers: corsHeaders });

  // Consume the ticket before streaming so a copied URL cannot be reused.
  const { data: consumed, error: consumeError } = await notesAdmin
    .from("note_download_tickets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", ticket.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (consumeError || !consumed) return new Response("This download link has already been used", { status: 410, headers: corsHeaders });

  const { data: blob, error: storageError } = await notesAdmin.storage.from(BUCKET).download(note.storage_path);
  if (storageError || !blob) return new Response("PDF file is unavailable", { status: 404, headers: corsHeaders });

  try {
    const original = new Uint8Array(await blob.arrayBuffer());
    const output = await createWatermarkedPdf(original, ticket.student_name, ticket.student_mobile, ticket.login_id);
    await notesAdmin.from("note_download_logs").insert({
      student_id: ticket.student_id,
      note_id: ticket.note_id,
      student_name: ticket.student_name,
      student_mobile: ticket.student_mobile,
    });
    const fileName = safeFileName(`${note.class_title}-${note.note_title}-${ticket.login_id}.pdf`);
    return new Response(output, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PDF watermark error", error);
    return new Response("This PDF could not be personalized. Please contact support.", { status: 500, headers: corsHeaders });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const ticketId = url.searchParams.get("ticket");
  if (req.method === "GET" && ticketId) return handleTicketDownload(ticketId);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { profile } = await verifyMainUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "listClassNotes") {
      const classId = String(body.classId || "");
      const { data: notes, error } = await notesAdmin
        .from("notes")
        .select("id,main_class_id,main_folder_id,subject_name,class_title,note_title,is_active,created_at")
        .eq("main_class_id", classId)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      const ids = (notes || []).map((n) => n.id);
      let granted = new Set<string>();
      if (ids.length && profile.role === "student") {
        const { data: access } = await notesAdmin
          .from("student_note_access")
          .select("note_id")
          .eq("student_id", profile.id)
          .eq("is_granted", true)
          .in("note_id", ids);
        granted = new Set((access || []).map((r) => r.note_id));
      }
      return json({ notes: (notes || []).map((n) => ({ ...n, unlocked: profile.role === "admin" || granted.has(n.id) })) });
    }

    if (action === "myNotes") {
      if (profile.role === "admin") return json({ notes: [] });
      const { data: access, error } = await notesAdmin
        .from("student_note_access")
        .select("note_id")
        .eq("student_id", profile.id)
        .eq("is_granted", true);
      if (error) throw error;
      const ids = (access || []).map((a) => a.note_id);
      if (!ids.length) return json({ notes: [] });
      const { data: notes, error: notesError } = await notesAdmin
        .from("notes")
        .select("id,main_class_id,main_folder_id,subject_name,class_title,note_title,is_active,created_at")
        .in("id", ids)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (notesError) throw notesError;
      return json({ notes: (notes || []).map((n) => ({ ...n, unlocked: true })) });
    }

    if (action === "createDownloadTicket") {
      const noteId = String(body.noteId || "");
      const { data: note, error: noteError } = await notesAdmin.from("notes").select("id,note_title,class_title,is_active").eq("id", noteId).maybeSingle();
      if (noteError || !note || !note.is_active) return json({ error: "Notes are not available" }, 404);
      if (profile.role !== "admin") {
        const { data: access } = await notesAdmin
          .from("student_note_access")
          .select("id")
          .eq("student_id", profile.id)
          .eq("note_id", noteId)
          .eq("is_granted", true)
          .maybeSingle();
        if (!access) return json({ error: "Notes access is locked. Please contact support." }, 403);
      }
      // Keep the tiny ticket table tidy without a scheduled job.
      await notesAdmin.from("note_download_tickets").delete().lt("expires_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const { data: ticket, error: ticketError } = await notesAdmin.from("note_download_tickets").insert({
        student_id: profile.id,
        note_id: noteId,
        student_name: profile.full_name,
        student_mobile: profile.mobile,
        login_id: profile.login_id,
        expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      }).select("id").single();
      if (ticketError || !ticket) throw ticketError || new Error("Could not create download link");
      return json({
        downloadUrl: `${NOTES_URL}/functions/v1/notes-api?ticket=${ticket.id}`,
        fileName: safeFileName(`${note.class_title}-${note.note_title}-${profile.login_id}.pdf`),
      });
    }

    requireAdmin(profile);

    if (action === "adminCreateUpload") {
      const classId = String(body.classId || "");
      const originalName = safeFileName(String(body.originalName || "notes.pdf"));
      if (!classId) return json({ error: "Class is required" }, 400);
      const path = `${classId}/${crypto.randomUUID()}-${originalName.toLowerCase().endsWith(".pdf") ? originalName : `${originalName}.pdf`}`;
      const { data, error } = await notesAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error || new Error("Could not create upload link");
      return json({ path, token: data.token });
    }

    if (action === "adminCreateNote") {
      const payload = {
        main_class_id: String(body.classId || ""),
        main_folder_id: body.folderId ? String(body.folderId) : null,
        subject_name: body.subjectName ? String(body.subjectName) : null,
        class_title: String(body.classTitle || "Class Notes"),
        note_title: String(body.noteTitle || "Class Notes"),
        storage_path: String(body.storagePath || ""),
        is_active: true,
      };
      if (!payload.main_class_id || !payload.storage_path) return json({ error: "Missing note details" }, 400);
      const { data, error } = await notesAdmin.from("notes").insert(payload).select("*").single();
      if (error) throw error;
      return json({ note: data });
    }

    if (action === "adminListNotes") {
      const { data: notes, error } = await notesAdmin
        .from("notes")
        .select("id,main_class_id,main_folder_id,subject_name,class_title,note_title,is_active,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const noteIds = (notes || []).map((n) => n.id);
      const counts = new Map<string, number>();
      if (noteIds.length) {
        const { data: rows } = await notesAdmin.from("student_note_access").select("note_id").eq("is_granted", true).in("note_id", noteIds);
        for (const row of rows || []) counts.set(row.note_id, (counts.get(row.note_id) || 0) + 1);
      }
      return json({ notes: (notes || []).map((n) => ({ ...n, granted_count: counts.get(n.id) || 0 })) });
    }

    if (action === "adminListAccess") {
      const noteId = String(body.noteId || "");
      const { data, error } = await notesAdmin.from("student_note_access").select("student_id").eq("note_id", noteId).eq("is_granted", true);
      if (error) throw error;
      return json({ studentIds: (data || []).map((r) => r.student_id) });
    }

    if (action === "adminSetAccess") {
      const noteId = String(body.noteId || "");
      const studentId = String(body.studentId || "");
      const grant = Boolean(body.grant);
      if (!noteId || !studentId) return json({ error: "Student and notes are required" }, 400);
      const { error } = await notesAdmin.from("student_note_access").upsert({
        student_id: studentId,
        note_id: noteId,
        is_granted: grant,
        granted_at: grant ? new Date().toISOString() : new Date().toISOString(),
        revoked_at: grant ? null : new Date().toISOString(),
      }, { onConflict: "student_id,note_id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "adminDeleteNote") {
      const noteId = String(body.noteId || "");
      const { data: note, error: findError } = await notesAdmin.from("notes").select("storage_path").eq("id", noteId).maybeSingle();
      if (findError || !note) return json({ error: "Note not found" }, 404);
      const { error: storageError } = await notesAdmin.storage.from(BUCKET).remove([note.storage_path]);
      if (storageError) console.error("Storage delete warning", storageError);
      const { error: deleteError } = await notesAdmin.from("notes").delete().eq("id", noteId);
      if (deleteError) throw deleteError;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
