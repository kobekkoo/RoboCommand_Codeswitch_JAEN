import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { processAllEvaluationItems, processNextEvaluationItem, retryFailedEvaluationItems } from "@/lib/stt/evaluation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { runId?: string; mode?: "next" | "all" | "retry-failed" } | null;
  if (!body?.runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });
  try {
    if (body.mode === "retry-failed") return NextResponse.json(await retryFailedEvaluationItems(body.runId));
    if (body.mode === "all") return NextResponse.json(await processAllEvaluationItems(body.runId));
    return NextResponse.json(await processNextEvaluationItem(body.runId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Processing failed." }, { status: 400 });
  }
}
