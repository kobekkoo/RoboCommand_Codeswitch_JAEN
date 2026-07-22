import { NextResponse } from "next/server";
import { submitRecording } from "@/lib/data/repository";
import { recordingSubmitSchema, validateAudioUpload } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }

  const raw = Object.fromEntries(
    [...formData.entries()].filter(([key]) => key !== "audio").map(([key, value]) => [key, String(value)]),
  );
  const parsed = recordingSubmitSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Recording metadata is invalid." }, { status: 400 });
  }

  const validation = validateAudioUpload(audio, parsed.data.mimeType);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const recording = await submitRecording({ ...parsed.data, bytes });
    return NextResponse.json({ recording });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit recording." }, { status: 400 });
  }
}
