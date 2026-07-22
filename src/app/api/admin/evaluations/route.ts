import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { adminDataErrorMessage } from "@/lib/data/errors";
import { createEvaluationRun, deleteEvaluationRun, publicSnapshot, renameEvaluationRun } from "@/lib/data/repository";
import { evaluationCreateSchema, evaluationRenameSchema } from "@/lib/validators";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json((await publicSnapshot()).evaluationRuns);
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = evaluationCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid evaluation run." }, { status: 400 });
  }
  try {
    return NextResponse.json({ run: await createEvaluationRun(parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: adminDataErrorMessage(error, "Could not create run.") }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { runId?: string } | null;
  if (!body?.runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });
  try {
    return NextResponse.json({ run: await deleteEvaluationRun(body.runId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete run." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = evaluationRenameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid evaluation run name." }, { status: 400 });
  }
  try {
    return NextResponse.json({ run: await renameEvaluationRun(parsed.data.runId, parsed.data.name) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not rename run." }, { status: 400 });
  }
}
