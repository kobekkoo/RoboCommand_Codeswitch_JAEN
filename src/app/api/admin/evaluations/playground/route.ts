import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { adminDataErrorMessage } from "@/lib/data/errors";
import { promotePlaygroundSession, runPlaygroundPreview } from "@/lib/evals/playground";
import { playgroundPromoteSchema, playgroundRunSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as ({ action?: string } & Record<string, unknown>) | null;

  if (body?.action === "promote") {
    const parsed = playgroundPromoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid playground promotion." }, { status: 400 });
    }
    try {
      return NextResponse.json({ run: await promotePlaygroundSession(parsed.data) });
    } catch (error) {
      return NextResponse.json({ error: adminDataErrorMessage(error, "Could not promote playground.") }, { status: 400 });
    }
  }

  const parsed = playgroundRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid playground request." }, { status: 400 });
  }
  try {
    return NextResponse.json({ session: await runPlaygroundPreview(parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: adminDataErrorMessage(error, "Could not run playground preview.") }, { status: 400 });
  }
}
