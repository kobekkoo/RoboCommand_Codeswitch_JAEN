import { describe, expect, it } from "vitest";
import { MAX_AUDIO_FILE_BYTES } from "@/lib/constants";
import { audioExtensionForMime, baseAudioMimeType, validateAudioFileForMvp } from "@/lib/audio/validation";

describe("audio file validation", () => {
  it("accepts supported browser audio types", () => {
    const file = new Blob(["audio"], { type: "audio/webm" });
    expect(validateAudioFileForMvp(file, "audio/webm;codecs=opus").ok).toBe(true);
  });

  it("normalizes codec-qualified browser MIME types for storage", () => {
    expect(baseAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(audioExtensionForMime("audio/webm;codecs=opus")).toBe("webm");
  });

  it("rejects unsupported MIME types", () => {
    const file = new Blob(["nope"], { type: "text/plain" });
    expect(validateAudioFileForMvp(file, "text/plain").ok).toBe(false);
  });

  it("rejects files over the MVP size limit", () => {
    const file = new Blob([new Uint8Array(MAX_AUDIO_FILE_BYTES + 1)], { type: "audio/webm" });
    expect(validateAudioFileForMvp(file, "audio/webm").ok).toBe(false);
  });
});
