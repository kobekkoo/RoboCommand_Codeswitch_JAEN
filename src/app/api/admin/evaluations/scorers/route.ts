import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { adminDataErrorMessage } from "@/lib/data/errors";
import { createScorerConfig, getScorerConfigs, updateScorerConfig } from "@/lib/data/repository";
import { scorerCreateSchema, scorerUpdateSchema } from "@/lib/validators";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await getScorerConfigs());
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = scorerCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid scorer config." }, { status: 400 });
  }
  try {
    return NextResponse.json({ scorer: await createScorerConfig(parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: adminDataErrorMessage(error, "Could not create scorer config.") }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = scorerUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid scorer update." }, { status: 400 });
  }
  try {
    return NextResponse.json({ scorer: await updateScorerConfig(parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: adminDataErrorMessage(error, "Could not update scorer config.") }, { status: 400 });
  }
}
