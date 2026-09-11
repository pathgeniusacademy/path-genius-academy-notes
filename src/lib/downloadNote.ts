import { createDownloadTicket, type NoteItem } from "@/lib/notesApi";
import { rememberRecentNote } from "@/lib/recentNotes";

export async function startPersonalizedNoteDownload(note: NoteItem) {
  const isPathGeniusApp = /PathGeniusAcademyApp/i.test(navigator.userAgent);
  let downloadWindow: Window | null = null;

  if (!isPathGeniusApp) {
    downloadWindow = window.open("", "_blank");
    if (downloadWindow) {
      try {
        downloadWindow.document.title = "Preparing Path Genius Notes";
        downloadWindow.document.body.innerHTML =
          '<div style="font-family:system-ui;padding:32px;color:#0f274f">' +
          '<h2 style="margin:0 0 10px">Path Genius Academy</h2>' +
          '<p>Preparing your personalized PDF…</p></div>';
      } catch {
        // Cosmetic only; the tab can still be navigated to the signed URL.
      }
    }
  }

  try {
    const { downloadUrl } = await createDownloadTicket(note.id);
    rememberRecentNote(note);

    if (isPathGeniusApp) {
      window.location.href = downloadUrl;
      return;
    }

    if (downloadWindow && !downloadWindow.closed) {
      downloadWindow.location.href = downloadUrl;
      return;
    }

    window.location.href = downloadUrl;
  } catch (error) {
    if (downloadWindow && !downloadWindow.closed) downloadWindow.close();
    throw error;
  }
}
