Path Genius Notes - FINAL browser download fix V6

Why the previous versions could leave .crdownload:
The secure ticket was being marked as used BEFORE the download response.
Chromium-based browsers may retry a download, probe it with HEAD, or request
a byte range. The retry then received HTTP 410 because the one-time ticket had
already been consumed. This can leave a complete, valid PDF stuck as
.crdownload.

V6 fixes this by:
1. Keeping the high-entropy ticket usable only until its existing short
   2-minute expiry, instead of invalidating it on the first request.
2. Recording used_at for audit without blocking browser retries.
3. Supporting HEAD requests.
4. Supporting HTTP Range requests with proper 206 / Content-Range headers.
5. Returning the binary as application/octet-stream with a .pdf attachment
   filename, which is robust for Edge Function downloads.
6. Keeping the public download URL HTTPS.
7. Keeping all watermarking, student access checks, and private storage logic.

Security:
- Ticket is still random/high entropy and expires after about 2 minutes.
- PDF remains personalized with student name/mobile/login ID.
- Original clean PDF remains private.
- No SQL change is required.

Deploy:
Replace ONLY:
supabase/functions/notes-api/index.ts

Then redeploy notes-api and keep:
Verify JWT with legacy secret = OFF

Frontend:
Keep the current V3 ClassNotes.tsx.

Commit / label:
Fix Chromium PDF retry and range downloads
