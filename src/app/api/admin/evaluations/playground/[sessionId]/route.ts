import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { publicSnapshot } from "@/lib/data/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { sessionId } = await params;
  const snapshot = await publicSnapshot();
  const session = snapshot.playgroundSessions.find((candidate) => candidate.id === sessionId);
  if (!session) return NextResponse.json({ error: "Playground session not found." }, { status: 404 });
  return NextResponse.json({ session });
}

export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { sessionId } = await params;
  return NextResponse.json({
    sessionId,
    status: "cancel_requested",
    message: "This preview runner completes short batches in one request. Stop is recorded in the UI for now.",
  });
}
