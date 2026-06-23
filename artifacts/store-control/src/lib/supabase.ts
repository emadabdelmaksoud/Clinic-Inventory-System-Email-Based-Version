import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured =
  !!supabaseUrl && supabaseUrl.startsWith("https://") && !!supabaseAnonKey;

// Single eagerly-created instance shared by auth and data layers.
// The Supabase JS client automatically attaches the signed-in user's JWT
// to every request, so data queries automatically respect RLS policies.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

/** @deprecated Use the `supabase` named export directly */
export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables."
    );
  }
  return supabase;
}
