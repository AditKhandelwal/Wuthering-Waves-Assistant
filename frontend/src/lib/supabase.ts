import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set -- accounts and saved builds are disabled. Copy frontend/.env.example to frontend/.env and fill in your Supabase project's values to enable them.",
  );
}

// Character browsing/building must work with zero backend configured (see
// .claude/rules/architecture.md), so this can't throw when unconfigured --
// that would crash the whole app at import time, since AuthProvider (which
// imports this) wraps the entire tree in main.tsx. Falls back to a
// syntactically-valid but inert placeholder so createClient() doesn't throw;
// this client is never actually called unless isSupabaseConfigured is true
// (see the gates in lib/auth.tsx).
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? supabaseAnonKey : "placeholder-anon-key",
);
