import { NextResponse } from "next/server";
import { getSessionView } from "@/lib/data/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const view = await getSessionView(sessionId);
  if (!view) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json(view);
}
