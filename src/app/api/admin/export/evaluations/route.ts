import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { publicSnapshot } from "@/lib/data/repository";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const snapshot = await publicSnapshot();
  const rows = snapshot.sttResults.map((result) => ({
    ...result,
    metric: snapshot.metrics.find((metric) => metric.sttResultId === result.id),
  }));
  return new Response(rows.map((row) => JSON.stringify(row)).join("\n"), {
    headers: {
      "content-type": "application/x-ndjson",
      "content-disposition": "attachment; filename=commandloop-evaluations.jsonl",
    },
  });
}
