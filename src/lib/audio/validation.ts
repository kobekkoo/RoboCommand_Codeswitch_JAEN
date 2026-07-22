import { validateAudioUpload } from "@/lib/validators";

export function baseAudioMimeType(mimeType: string) {
  return mimeType.toLowerCase().split(";")[0]?.trim() || mimeType;
}

export function audioExtensionForMime(mimeType: string) {
  const normalized = baseAudioMimeType(mimeType);
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  return "bin";
}

export function validateAudioFileForMvp(file: File | Blob, mimeType: string) {
  return validateAudioUpload(file, mimeType);
}
