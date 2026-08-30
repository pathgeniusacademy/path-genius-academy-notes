PATH GENIUS NOTES V9

Features
1. Upload workflow is Folder -> Class.
2. Every folder also has "Folder Notes - no lecture required" so PDFs can be uploaded even if no YouTube class exists.
3. Paid Student Lists: create List 1/List 2/etc., add/remove students, and grant/revoke any notes folder to the whole list in one click.
4. List access is dynamic: students added later inherit all active folder grants of that list; students removed lose list-only access automatically.
5. Existing direct per-student folder access continues to work.
6. Folder grants include subfolders through the existing folder inheritance system.

Deployment order (important)
A. Notes Supabase SQL Editor: run APPLY-NOTES-PAID-LISTS-V9.sql
B. Notes Supabase Edge Functions -> notes-api: deploy V9 index.ts, Verify JWT OFF
C. Notes website GitHub: replace the 4 frontend files and push once
D. Android GitHub: apply v2.5.0 patch so Notes stays inside the app and PDFs download through Android DownloadManager

Main website
No additional main-site deploy is required just to create a notes-only folder. In the existing Main Admin -> Free Classes Manager, create a normal folder/subfolder and simply do not add a YouTube class. V9 Notes Admin will still allow folder-only PDF uploads to it.
