import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getEvaluationReport } from "@/lib/stt/evaluation";

export async function GET(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const url = new URL(request.url);
  const runIds = url.searchParams.getAll("runId").filter(Boolean);
  if (runIds.length < 1) return NextResponse.json({ error: "At least one runId is required." }, { status: 400 });

  const reports = await Promise.all(runIds.map((runId) => getEvaluationReport(runId)));
  return NextResponse.json({ reports: reports.filter(Boolean) });
}
