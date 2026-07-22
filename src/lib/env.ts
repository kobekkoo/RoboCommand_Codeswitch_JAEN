import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().or(z.literal("")),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().or(z.literal("")),
  ADMIN_PASSWORD: z.string().optional().or(z.literal("")),
  ADMIN_SESSION_SECRET: z.string().optional().or(z.literal("")),
  OPENAI_API_KEY: z.string().optional().or(z.literal("")),
  GEMINI_API_KEY: z.string().optional().or(z.literal("")),
  ELEVENLABS_API_KEY: z.string().optional().or(z.literal("")),
  DEEPGRAM_API_KEY: z.string().optional().or(z.literal("")),
});

export function getEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  const data = parsed.data;
  const isProduction = process.env.NODE_ENV === "production";
  const publicSupabaseKey = data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || data.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (
    isProduction &&
    ((data.ADMIN_PASSWORD?.length ?? 0) < 8 || (data.ADMIN_SESSION_SECRET?.length ?? 0) < 16)
  ) {
    throw new Error("ADMIN_PASSWORD with 8+ characters and ADMIN_SESSION_SECRET with 16+ characters are required in production.");
  }

  const hasSupabase =
    Boolean(data.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(publicSupabaseKey) &&
    Boolean(data.SUPABASE_SERVICE_ROLE_KEY);

  return {
    ...data,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicSupabaseKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: data.NEXT_PUBLIC_SUPABASE_ANON_KEY || publicSupabaseKey,
    ADMIN_PASSWORD: data.ADMIN_PASSWORD || "commandloop-admin",
    ADMIN_SESSION_SECRET: data.ADMIN_SESSION_SECRET || "dev-commandloop-session-secret-change-me",
    OPENAI_API_KEY: data.OPENAI_API_KEY || undefined,
    GEMINI_API_KEY: data.GEMINI_API_KEY || undefined,
    ELEVENLABS_API_KEY: data.ELEVENLABS_API_KEY || undefined,
    DEEPGRAM_API_KEY: data.DEEPGRAM_API_KEY || undefined,
    hasSupabase,
  };
}
