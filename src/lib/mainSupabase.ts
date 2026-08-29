import { createClient } from "@supabase/supabase-js";
import { MAIN_SUPABASE_KEY, MAIN_SUPABASE_URL } from "@/lib/config";

export const mainSupabase = createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "path-genius-notes-main-auth",
  },
});
