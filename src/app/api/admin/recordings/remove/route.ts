import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { removeRecording } from "@/lib/data/repository";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { recordingId?: string } | null;
  if (!body?.recordingId) return NextResponse.json({ error: "recordingId is required." }, { status: 400 });
  try {
    return NextResponse.json({ recording: await removeRecording(body.recordingId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove recording." }, { status: 400 });
  }
}
