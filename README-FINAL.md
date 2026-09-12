# Path Genius — one login + Admin Delete Student

Yeh pichhle Final Project ka updated version hai. Is package ke `projects` folders use karein. Purane release guides historical hain; is update ke liye yahi guide follow karein.

## Ab kya badla hai

- Notes ab Main website ke **https://pathgenius.netlify.app/notes/** par khulta hai.
- Main, Classes ke Notes links, Notes aur Notes Admin same origin/session use karte hain. Password/token kisi URL ya native JavaScript bridge mein transfer nahi hota.
- Old `pathgenius-notes.netlify.app` links automatically Main ke matching Notes page par jaate hain.
- Valid session app reopen/page reload par restore hota hai. Expired access token refresh hota hai; temporary profile/network failure par Retry dikhta hai, saved login delete nahi hota.
- Notes ki bottom navigation bhi Home, Classes, Tests, Revision, Notes hai.
- Main Admin → Students → student open → **Delete Student**. Exact Login ID type karne ke baad **Delete permanently** active hoga.
- Archive/Deactivate ka old option bhi available hai.

## Deploy karne ka exact order

### 1. Notes Edge Function update

Existing **Notes Supabase** project `ysttmofxsgyqytkxlrbj` open karein. Edge Functions → `notes-api` mein is file ka complete code deploy karein:

`projects/path-genius-academy-notes-main/supabase/functions/notes-api/index.ts`

Existing `verify_jwt = false` setting retain karein. Main-project login token function ke andar verify hota hai. Existing Main Supabase URL/publishable key aur Notes server secret values retain karein.

CLI alternative, Notes project folder se:

```sh
supabase functions deploy notes-api --project-ref ysttmofxsgyqytkxlrbj --no-verify-jwt
```

### 2. Main mein naya Delete function

Existing **Main Supabase** project `okbrppimozvokpkzboto` → Edge Functions → naya function **`delete-student`** banayein.

Dashboard editor ke liye root ki **`SUPABASE-DELETE-STUDENT-PASTE.ts`** ka poora code paste karein. Yeh standalone file hai. JWT verification toggle off rakhein; function caller token + active admin profile server par verify karta hai.

Main Supabase → Edge Function Secrets mein add karein:

```text
NOTES_SUPABASE_URL=https://ysttmofxsgyqytkxlrbj.supabase.co
```

URL value hi chahiye; Notes service-role key Main frontend mein nahi dalni hai. Main ke normal Supabase function secrets auto available hone chahiye, jaise existing create-student/reset-password functions mein hain.

CLI alternative, Main project folder se:

```sh
supabase secrets set NOTES_SUPABASE_URL=https://ysttmofxsgyqytkxlrbj.supabase.co --project-ref okbrppimozvokpkzboto
supabase functions deploy delete-student --project-ref okbrppimozvokpkzboto --no-verify-jwt
```

### 3. Dono websites publish

Matching project files apne **existing** Main aur Notes GitHub repositories mein replace/update karein. `netlify.toml`, Notes `vite.config.ts`, new source files aur updated auth files zaroor include karein.

Notes Netlify mein:

```text
VITE_MAIN_SITE_URL=https://pathgenius.netlify.app
```

Notes ka `VITE_MAIN_SUPABASE_URL` aur Main ka `VITE_SUPABASE_URL` same Main project hone chahiye. Existing public keys/Notes project values retain karein.

Main `netlify.toml` mein `/notes/*` reverse proxy SPA fallback se pehle configured hai. Upstream `https://pathgenius-notes.netlify.app` wahi existing Notes site hai. **Notes site delete/disconnect mat karein**; woh frontend serve karti rahegi.

Both builds: `npm ci` then `npm run build`; Netlify publish directory `dist`. Dono deployments complete hone ke baad test karein. Sirf ek website deploy karne par naya route fully ready nahi hoga. Source ZIP ke `projects/...` contents repository root par rakhein; extra nested folder mat banayein.

Agar custom Main domain use karte hain to Notes ka canonical URL aur Android Main URL us exact domain ke saath match karein. Is supplied build mein existing `pathgenius.netlify.app` canonical hai. Old `VITE_NOTES_SITE_URL` Main navigation ke liye ab use nahi hota; Notes route fixed `/notes` hai.

### 4. App update

Android project **3.3.2, versionCode 16** hai. Existing signed APK/AAB workflow aur same signing key use karein. App uninstall/clear storage ki zaroorat nahi—signed update install karein. APK/AAB is source bundle mein compiled nahi hai.

Main aur Notes session fix web deployments se bhi available hota hai. Updated Android source old Notes links aur internal new-window links ko current WebView mein open karta hai; Study Vault code retained hai.

## SQL aur data

Is increment ke liye **koi naya SQL migration nahi hai**. Previous Notes access/security migrations already applied hone chahiye. Previous `APPLY-NOTES-FINAL-FIX.sql` aur current access upgrade project mein retained hain; database reset/recreate ya test/PDF reupload nahi karna hai.

Permanent deletion is only for the student you explicitly select and confirm. It removes Main Auth/login and profile; existing cascade constraints remove that student's attempts/results, saved questions, daily targets and access rows. Notes cleanup removes that student's direct/folder grants, list memberships, tickets and download logs. Shared tests, PDFs, folders, lists and other students are retained. An admin audit entry remains. Already-downloaded files on a student's phone cannot be remotely erased.

The two databases cannot share one transaction: the student is first deactivated; Notes cleanup runs; then Main Auth is deleted. If a connection/deployment/database error occurs, the dialog says deletion is incomplete. Some student records may already be removed. Fix the stated issue and retry the same Delete action; don't assume Archive means permanent deletion. Extra custom foreign-key restrictions/storage ownership in your live database may require resolution if Auth deletion is blocked.

## Login expectation

Existing valid Main login should be reused. A device which only had an old standalone Notes login may need **one login after the move** because browsers don't share storage between domains. After that, Main/Notes use the same saved session. Explicit logout, admin deletion, revoked/expired Supabase refresh sessions, clearing app data or reinstalling still require login. No insecure permanent login or saved plaintext password has been introduced.

## Checks already completed

- Both production builds passed.
- Browser: old Notes deep link → Main login → same Notes folder; three Main/Notes round trips; reload; stored session restored in fresh browser context; expired access token refresh; profile failure + Retry; shared logout; typed Delete confirmation, server failure display and successful retry.
- Nine delete-function scenarios passed with mocked services, including rejecting anonymous/students/admin targets and handling partial failure.
- 23 Notes API scenarios passed using mocked databases and real PDF watermark generation, including scoped student cleanup and retained shared notes.
- Seven Android Java files passed syntax parsing; Android XML and proxy configuration checks passed. Android compilation/signing/device behavior still need the supplied workflow/device check.

No live account was deleted and no deployment was performed here. After deploying, test account deletion using a disposable student account, and on your phone sign in once → Notes → Dashboard → close/reopen app.
