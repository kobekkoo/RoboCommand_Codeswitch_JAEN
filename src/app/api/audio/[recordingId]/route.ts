import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getAudioObject, getRecordingDetail } from "@/lib/data/repository";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ recordingId: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }
  const { recordingId } = await params;
  const audio = await getAudioObject(recordingId);
  const detail = await getRecordingDetail(recordingId);
  if (!audio || !detail) {
    return NextResponse.json({ error: "Audio not found." }, { status: 404 });
  }

  return new Response(audio.bytes as unknown as BodyInit, {
    headers: {
      "content-type": audio.mimeType,
      "content-disposition": `inline; filename="${audio.fileName}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
