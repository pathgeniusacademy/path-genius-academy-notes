import { mainSupabase } from "@/lib/mainSupabase";
import { NOTES_SUPABASE_KEY, NOTES_SUPABASE_URL } from "@/lib/config";

export type NoteItem = {
  id: string;
  main_class_id: string;
  main_folder_id: string | null;
  subject_name: string | null;
  class_title: string;
  note_title: string;
  is_active: boolean;
  created_at: string;
  unlocked?: boolean;
  granted_count?: number;
};

async function authHeaders() {
  const { data } = await mainSupabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please login again.");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    apikey: NOTES_SUPABASE_KEY,
  };
}

export async function callNotesApi<T>(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(`${NOTES_SUPABASE_URL}/functions/v1/notes-api`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export async function createDownloadTicket(noteId: string) {
  return callNotesApi<{ downloadUrl: string; fileName: string }>("createDownloadTicket", { noteId });
}
