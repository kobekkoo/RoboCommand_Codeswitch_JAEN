import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { seedDemoAudioData } from "@/lib/data/demo-audio";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Demo data seeding is disabled in production." }, { status: 403 });
  }
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (getEnv().hasSupabase) {
    return NextResponse.json(
      { error: "This demo seeder is for local in-memory mode only. Disable Supabase env vars to use it." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ summary: await seedDemoAudioData() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not seed demo data." },
      { status: 500 },
    );
  }
}
