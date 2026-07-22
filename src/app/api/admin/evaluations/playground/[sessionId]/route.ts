import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { publicSnapshot, updatePlaygroundSession } from "@/lib/data/repository";
import type { PlaygroundResult } from "@/lib/domain";
import { playgroundSessionUpdateSchema } from "@/lib/validators";

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

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { sessionId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = playgroundSessionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid playground session update." }, { status: 400 });
  }
  try {
    const session = await updatePlaygroundSession({
      playgroundSessionId: sessionId,
      resultsJson: parsed.data.resultsJson as PlaygroundResult[],
      sampleRecordingIds: parsed.data.sampleRecordingIds,
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update playground session." }, { status: 400 });
  }
}
