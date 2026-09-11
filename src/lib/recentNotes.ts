import type { NoteItem } from "@/lib/notesApi";

const KEY = "pga_recent_notes_v1";
const LIMIT = 5;

export type RecentNote = {
  id: string;
  title: string;
  subject: string;
  openedAt: string;
};

export function getRecentNotes(): RecentNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentNote[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.id && item?.title).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function rememberRecentNote(note: NoteItem) {
  try {
    const next: RecentNote = {
      id: note.id,
      title: note.note_title,
      subject: note.subject_name || note.class_title || "Path Genius Notes",
      openedAt: new Date().toISOString(),
    };
    const existing = getRecentNotes().filter((item) => item.id !== note.id);
    localStorage.setItem(KEY, JSON.stringify([next, ...existing].slice(0, LIMIT)));
  } catch {
    // Recent history is a convenience feature only. PDF access must never depend on it.
  }
}
