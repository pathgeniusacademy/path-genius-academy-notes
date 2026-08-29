Path Genius Notes - Browser Download Gesture Fix V3

Problem:
The Edge Function returns HTTP 200, but the browser may block a file download
started only after an awaited ticket request because the original click/user
gesture has expired.

Fix:
- Opens the download tab immediately inside the student's click.
- Creates the secure one-time ticket asynchronously.
- Navigates the already-authorized tab to the PDF endpoint.
- Keeps Android WebView on the direct HTTPS download path.
- Falls back to same-tab navigation if popups are blocked.
- Resets the Preparing state correctly.

Replace:
src/pages/ClassNotes.tsx

Commit:
Fix browser personalized PDF download gesture
