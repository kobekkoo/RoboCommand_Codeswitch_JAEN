import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { adminDataErrorMessage } from "@/lib/data/errors";
import { getEvalDatasetAudioObject, uploadEvalDatasetAudio } from "@/lib/data/repository";
import { validateAudioUpload } from "@/lib/validators";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const formData = await request.formData().catch(() => undefined);
  const file = formData?.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }
  const validation = validateAudioUpload(file, file.type);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const upload = await uploadEvalDatasetAudio({ bytes, mimeType: file.type, fileName: file.name });
    const audioUrl = `/api/admin/evaluations/datasets/audio?path=${encodeURIComponent(upload.storagePath)}`;
    return NextResponse.json({ ...upload, audioUrl });
  } catch (error) {
    return NextResponse.json({ error: adminDataErrorMessage(error, "Could not upload dataset audio.") }, { status: 400 });
  }
}

export async function GET(request: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const path = new URL(request.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Audio path is required." }, { status: 400 });
  try {
    const audio = await getEvalDatasetAudioObject(path);
    if (!audio) return NextResponse.json({ error: "Audio was not found." }, { status: 404 });
    const body = new ArrayBuffer(audio.bytes.byteLength);
    new Uint8Array(body).set(audio.bytes);
    return new Response(body, {
      headers: {
        "Content-Type": audio.mimeType,
        "Content-Length": String(audio.bytes.byteLength),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: adminDataErrorMessage(error, "Could not load dataset audio.") }, { status: 400 });
  }
}
