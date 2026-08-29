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

function bearer(req: Request) {
  const value = req.headers.get("Authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

type MainProfile = {
  id: string;
  role: "admin" | "student";
  full_name: string;
  login_id: string;
  mobile: string | null;
  is_active: boolean;
};

async function requireMainUser(req: Request): Promise<{ profile: MainProfile; token: string }> {
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
    .select("id,role,full_name,login_id,mobile,is_active")
    .eq("id", userData.user.id)
    .single();

  if (error || !data) throw new Error("UNAUTHORIZED: Student profile not found.");
  const profile = data as MainProfile;
  if (!profile.is_active) throw new Error("UNAUTHORIZED: This account is not active.");
  return { profile, token };
}

function requireAdmin(profile: MainProfile) {
  if (profile.role !== "admin") throw new Error("FORBIDDEN: Admin access required.");
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
  const pdf = await PDFDocument.load(input);
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
    page.drawText(footer, {
      x: 18,
      y: 12,
      size: footerSize,
      font: regular,
      color: rgb(0.12, 0.16, 0.24),
      opacity: 0.34,
    });
  }
  return await pdf.save();
}

async function handleDownload(req: Request, ticketId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return json({ error: "Invalid download ticket." }, 400);
  const now = new Date().toISOString();

  // Do not consume the ticket before the browser finishes the download.
  // Chromium download managers can retry or make range/HEAD requests. If the
  // ticket becomes invalid after the first request, the browser can leave a
  // perfectly valid PDF stuck as ".crdownload".
  //
  // The ticket remains usable only until its short expiry (2 minutes), and the
  // PDF itself is personalized with the student's identity.
  const { data: ticket, error: ticketError } = await notesAdmin
    .from("note_download_tickets")
    .select("id,student_id,note_id,student_name,student_mobile,login_id,used_at,expires_at")
    .eq("id", ticketId)
    .gt("expires_at", now)
    .maybeSingle();

  if (ticketError || !ticket) return json({ error: "This download link is expired." }, 410);

  const { data: note, error: noteError } = await notesAdmin
    .from("notes")
    .select("id,note_title,class_title,storage_path,is_active")
    .eq("id", ticket.note_id)
    .eq("is_active", true)
    .maybeSingle();

  if (noteError || !note) return json({ error: "Notes file is no longer available." }, 404);

  const { data: fileBlob, error: fileError } = await notesAdmin.storage.from("class-notes").download(note.storage_path);
  if (fileError || !fileBlob) return json({ error: "Could not read the original PDF." }, 500);

  try {
    const original = new Uint8Array(await fileBlob.arrayBuffer());
    const watermarked = await watermarkPdf(original, ticket);

    await notesAdmin.from("note_download_logs").insert({
      student_id: ticket.student_id,
      note_id: ticket.note_id,
      student_name: ticket.student_name,
      student_mobile: ticket.student_mobile,
      downloaded_at: now,
    });

    const filename = cleanFileName(`${note.class_title}-${note.note_title}.pdf`);
    const totalLength = watermarked.byteLength;

    // Mark the ticket as used for audit purposes, but do NOT invalidate it
    // during its short expiry window. This allows browser retry/range requests.
    if (!ticket.used_at) {
      await notesAdmin
        .from("note_download_tickets")
        .update({ used_at: now })
        .eq("id", ticket.id)
        .is("used_at", null);
    }

    const baseHeaders: Record<string, string> = {
      ...corsHeaders,
      // application/octet-stream is intentionally used for the download
      // response. It is more reliable for binary Edge Function downloads and
      // still saves with the .pdf filename from Content-Disposition.
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Accept-Ranges": "bytes",
      "Access-Control-Expose-Headers":
        "Content-Disposition, Content-Length, Content-Range, Accept-Ranges",
    };

    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
      if (match) {
        let start = match[1] ? Number(match[1]) : 0;
        let end = match[2] ? Number(match[2]) : totalLength - 1;

        if (!Number.isFinite(start) || start < 0) start = 0;
        if (!Number.isFinite(end) || end >= totalLength) end = totalLength - 1;

        if (start <= end && start < totalLength) {
          const chunk = watermarked.slice(start, end + 1);
          return new Response(req.method === "HEAD" ? null : chunk, {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Range": `bytes ${start}-${end}/${totalLength}`,
              "Content-Length": String(chunk.byteLength),
            },
          });
        }
      }

      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${totalLength}`,
        },
      });
    }

    return new Response(req.method === "HEAD" ? null : watermarked, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": String(totalLength),
      },
    });
  } catch (error) {
    console.error("PDF watermark error", error);
    return json({ error: "Could not personalize this PDF. Please contact support." }, 500);
  }
}

async function handleAction(req: Request) {
  const { profile } = await requireMainUser(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (action === "myNotes") {
    if (profile.role !== "student") return json({ notes: [] });
    const { data: access, error } = await notesAdmin.from("student_note_access").select("note_id").eq("student_id", profile.id).eq("is_granted", true);
    if (error) throw error;
    const ids = (access || []).map((x: any) => x.note_id);
    if (!ids.length) return json({ notes: [] });
    const { data: notes, error: notesError } = await notesAdmin.from("notes").select("id,main_class_id,main_folder_id,subject_name,class_title,note_title,is_active,created_at").in("id", ids).eq("is_active", true).order("created_at", { ascending: false });
    if (notesError) throw notesError;
    return json({ notes: (notes || []).map((n: any) => ({ ...n, unlocked: true })) });
  }

  if (action === "listClassNotes") {
    const classId = String(body?.classId || "");
    if (!classId) return json({ error: "Class ID is required." }, 400);
    const { data: notes, error } = await notesAdmin.from("notes").select("id,main_class_id,main_folder_id,subject_name,class_title,note_title,is_active,created_at").eq("main_class_id", classId).eq("is_active", true).order("created_at", { ascending: false });
    if (error) throw error;
    let unlocked = new Set<string>();
    if (profile.role === "student" && (notes || []).length) {
      const ids = (notes || []).map((n: any) => n.id);
      const { data: access } = await notesAdmin.from("student_note_access").select("note_id").eq("student_id", profile.id).eq("is_granted", true).in("note_id", ids);
      unlocked = new Set((access || []).map((x: any) => x.note_id));
    }
    return json({ notes: (notes || []).map((n: any) => ({ ...n, unlocked: profile.role === "admin" || unlocked.has(n.id) })) });
  }

  if (action === "createDownloadTicket") {
    if (profile.role !== "student") return json({ error: "Student access required." }, 403);
    const noteId = String(body?.noteId || "");
    if (!noteId) return json({ error: "Note ID is required." }, 400);

    const { data: access } = await notesAdmin.from("student_note_access").select("id").eq("student_id", profile.id).eq("note_id", noteId).eq("is_granted", true).maybeSingle();
    if (!access) return json({ error: "Notes access is not enabled for this account." }, 403);

    const { data: note } = await notesAdmin.from("notes").select("id,note_title,class_title,is_active").eq("id", noteId).eq("is_active", true).maybeSingle();
    if (!note) return json({ error: "Notes are not available." }, 404);

    const { data: ticket, error } = await notesAdmin.from("note_download_tickets").insert({
      student_id: profile.id,
      note_id: noteId,
      student_name: profile.full_name || profile.login_id,
      student_mobile: profile.mobile,
      login_id: profile.login_id,
      expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    }).select("id").single();
    if (error) throw error;

    // Always build the public HTTPS endpoint from SUPABASE_URL.
    // Using req.url/origin can resolve to an internal/proxied HTTP origin in some
    // hosted Edge Function environments, which Chromium then blocks as an
    // insecure download from an HTTPS website.
    const publicNotesOrigin = NOTES_URL.replace(/\/$/, "");
    const downloadUrl = `${publicNotesOrigin}/functions/v1/notes-api?ticket=${encodeURIComponent(ticket.id)}`;
    return json({ downloadUrl, fileName: cleanFileName(`${note.class_title}-${note.note_title}.pdf`) });
  }

  requireAdmin(profile);

  if (action === "adminListNotes") {
    const { data: notes, error } = await notesAdmin.from("notes").select("id,main_class_id,main_folder_id,subject_name,class_title,note_title,is_active,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    const { data: access } = await notesAdmin.from("student_note_access").select("note_id").eq("is_granted", true);
    const counts = new Map<string, number>();
    for (const row of access || []) counts.set((row as any).note_id, (counts.get((row as any).note_id) || 0) + 1);
    return json({ notes: (notes || []).map((n: any) => ({ ...n, granted_count: counts.get(n.id) || 0 })) });
  }

  if (action === "adminListAccess") {
    const noteId = String(body?.noteId || "");
    const { data, error } = await notesAdmin.from("student_note_access").select("student_id").eq("note_id", noteId).eq("is_granted", true);
    if (error) throw error;
    return json({ studentIds: (data || []).map((x: any) => x.student_id) });
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
    if (!classId || !classTitle || !storagePath || !storagePath.startsWith(`${classId}/`)) return json({ error: "Invalid notes metadata." }, 400);
    const { data, error } = await notesAdmin.from("notes").insert({
      main_class_id: classId,
      main_folder_id: folderId,
      subject_name: subjectName,
      class_title: classTitle,
      note_title: noteTitle,
      storage_path: storagePath,
      is_active: true,
    }).select("id").single();
    if (error) throw error;
    return json({ ok: true, id: data.id });
  }

  if (action === "adminSetAccess") {
    const noteId = String(body?.noteId || "");
    const studentId = String(body?.studentId || "");
    const grant = Boolean(body?.grant);
    if (!noteId || !studentId) return json({ error: "Note and student are required." }, 400);
    const payload = {
      student_id: studentId,
      note_id: noteId,
      is_granted: grant,
      granted_at: grant ? new Date().toISOString() : new Date().toISOString(),
      revoked_at: grant ? null : new Date().toISOString(),
    };
    const { error } = await notesAdmin.from("student_note_access").upsert(payload, { onConflict: "student_id,note_id" });
    if (error) throw error;
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
    if ((req.method === "GET" || req.method === "HEAD") && ticket) {
      return await handleDownload(req, ticket);
    }
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    return await handleAction(req);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    if (message.startsWith("UNAUTHORIZED:")) return json({ error: message.replace("UNAUTHORIZED:", "").trim() }, 401);
    if (message.startsWith("FORBIDDEN:")) return json({ error: message.replace("FORBIDDEN:", "").trim() }, 403);
    if (message.startsWith("SERVER_CONFIG:")) return json({ error: "Server configuration is incomplete." }, 500);
    return json({ error: "Server error. Please try again." }, 500);
  }
});
