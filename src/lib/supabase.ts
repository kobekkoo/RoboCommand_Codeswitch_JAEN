import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

export function getSupabaseAdminClient() {
  const env = getEnv();
  if (!env.hasSupabase || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return undefined;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseBrowserConfig() {
  const env = getEnv();
  if (!env.hasSupabase || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return undefined;
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
