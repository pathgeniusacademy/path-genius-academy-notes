import { createClient } from "@supabase/supabase-js";
import { NOTES_SUPABASE_KEY, NOTES_SUPABASE_URL } from "@/lib/config";

export const notesSupabase = createClient(NOTES_SUPABASE_URL, NOTES_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
