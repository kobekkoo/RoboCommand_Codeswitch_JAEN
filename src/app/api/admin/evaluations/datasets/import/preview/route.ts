import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { inferColumnRole, parseDatasetImport } from "@/lib/evals/dataset-import";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { content?: string; fileName?: string } | null;
  if (!body?.content || !body.fileName) return NextResponse.json({ error: "content and fileName are required." }, { status: 400 });
  try {
    const parsed = parseDatasetImport(body.content, body.fileName);
    return NextResponse.json({
      parsed,
      inferredRoles: Object.fromEntries(parsed.headers.map((header) => [header, inferColumnRole(header)])),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not parse import." }, { status: 400 });
  }
}
