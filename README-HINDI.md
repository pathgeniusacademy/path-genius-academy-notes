# Path Genius Notes — Secure PDF System

Ye separate Notes website hai. Main Path Genius Academy website/app ka login, tests, results, daily targets etc. untouched rahenge.

## Architecture

- Main Supabase (`okbrppimozvokpkzboto`) = existing student/admin authentication and student profile.
- Notes Supabase (`ysttmofxsgyqytkxlrbj`) = private PDFs, access control, download logs and one-time download tickets.
- Notes website = same existing Student Login ID/password se login.
- Original PDF public nahi hoti.
- Student download ke time server-side personalized copy banti hai.
- Har page par repeated watermark + footer: Path Genius Academy + student name + mobile + Login ID.
- Generated personalized copy permanent Storage me save nahi hoti.

## Already completed

- `class-notes` private Storage bucket
- Base tables from `SETUP-PATH-GENIUS-NOTES.sql`

## Ab ek additional SQL run karna hai

Supabase Notes project -> SQL Editor -> New query -> `APPLY-NOTES-SECURE-V2.sql` paste -> Run.

Ye `note_download_tickets` table banata hai. Ticket 2 minute valid aur one-time use hota hai.

## Edge Function

Notes Supabase -> Edge Functions -> Create/Deploy function:

Name: `notes-api`

Code:
`supabase/functions/notes-api/index.ts`

IMPORTANT: JWT verification OFF / verify_jwt=false rakho. Function khud MAIN Supabase ka access token securely verify karti hai. Notes project ka service-role browser me kabhi expose nahi hota.

Supabase CLI use karoge to `supabase/config.toml` already included hai.

## Notes website deploy

GitHub me new repo recommended:
`path-genius-academy-notes`

Is project ki files push karo, then Netlify me repo import karo.

Recommended Netlify site name:
`pathgenius-notes`

Expected URL:
`https://pathgenius-notes.netlify.app`

Build settings:
- Build command: `npm run build`
- Publish directory: `dist`

Public publishable keys source me fallback ke roop me included hain. Ye browser-safe keys hain. Secret/service_role key source me nahi hai.

Optional Netlify env vars:
- `VITE_MAIN_SUPABASE_URL=https://okbrppimozvokpkzboto.supabase.co`
- `VITE_MAIN_SUPABASE_PUBLISHABLE_KEY=<main publishable key>`
- `VITE_NOTES_SUPABASE_URL=https://ysttmofxsgyqytkxlrbj.supabase.co`
- `VITE_NOTES_SUPABASE_PUBLISHABLE_KEY=<notes publishable key>`
- `VITE_MAIN_SITE_URL=https://pathgenius.netlify.app`

## Admin workflow

Open:
`https://pathgenius-notes.netlify.app/admin/login`

Same main Path Genius Admin email/password se login.

Admin can:
1. Choose existing class from main Supabase.
2. Upload PDF (max 25 MB).
3. Search student by name / Login ID / mobile.
4. Grant or revoke PDF access.
5. Delete notes.

## Student workflow

Main website ke har class card me `Class Notes` button add hoga.

Notes site par student same existing Login ID/password se login karega.

- Access nahi: `Contact Support`
- Access granted: `Download`
- Download click -> one-time server ticket -> private original fetch -> watermark -> direct PDF response.

## Security points

- Original `class-notes` bucket private rahega.
- Students ko Storage select/download policy mat dena.
- Notes tables par public/authenticated policies mat banana.
- `service_role` key frontend/Netlify/GitHub me kabhi mat dalna.
- Edge Function manually MAIN Supabase token verify karti hai.
- Download ticket random UUID, 2 minutes expiry, one-time use.
- Download logs Notes DB me store hote hain.

## Main website integration

Separate patch file `PGA-NOTES-MAIN-WEBSITE-PATCH.zip` use karo.

Main website me required code file:
- `src/pages/FreeClasses.tsx`

Optional env:
- `VITE_NOTES_SITE_URL=https://pathgenius-notes.netlify.app`

Android app ke liye Notes domain ko internal WebView navigation me allow karna next step me kiya jayega after final Netlify URL confirm ho jaye.
