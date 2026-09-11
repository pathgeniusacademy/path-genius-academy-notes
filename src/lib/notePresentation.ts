import type { NoteItem } from "@/lib/notesApi";

export function noteAccessLabel(note: Pick<NoteItem, "access_type">) {
  if (note.access_type === "free") return "FREE";
  if (note.access_type === "test_series") return "TEST SERIES";
  return "PRIVATE";
}

export function noteAccessMessage(note: Pick<NoteItem, "access_type" | "unlocked">) {
  if (note.unlocked) return "Ready to open • Personalized on download";
  if (note.access_type === "test_series") return "Available with Test Series";
  if (note.access_type === "selected_users") return "Available to Selected Students";
  return "Access unavailable";
}

export function isNewNote(note: Pick<NoteItem, "created_at">, days = 7) {
  const created = new Date(note.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}
