import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openAiMocks = vi.hoisted(() => ({
  transcribe: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    audio = {
      transcriptions: {
        create: openAiMocks.transcribe,
      },
    };
  },
}));

vi.mock("openai/uploads", () => ({
  toFile: vi.fn(async (buffer: Buffer, name: string, options: { type: string }) => new File([new Uint8Array(buffer)], name, { type: options.type })),
}));

import {
  DeepgramSttProvider,
  ElevenLabsSttProvider,
  GeminiSttProvider,
  OpenAiSttProvider,
} from "@/lib/stt/providers";

const envKeys = ["OPENAI_API_KEY", "GEMINI_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY"] as const;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("hosted STT providers", () => {
  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    openAiMocks.transcribe.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
    vi.unstubAllGlobals();
  });

  it("calls OpenAI transcriptions and returns text", async () => {
    process.env.OPENAI_API_KEY = "openai-test";
    openAiMocks.transcribe.mockResolvedValue({ text: "Clean the table." });

    const result = await new OpenAiSttProvider().transcribe({
      audio: Buffer.from([1, 2, 3]),
      mimeType: "audio/webm;codecs=opus",
      model: "gpt-4o-transcribe",
      languageHint: "en",
    });

    expect(openAiMocks.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-transcribe", language: "en" }),
    );
    expect(result.text).toBe("Clean the table.");
  });

  it("calls Gemini generateContent with inline audio and returns candidate text", async () => {
    process.env.GEMINI_API_KEY = "gemini-test";
    const fetchMock = vi.fn<FetchLike>(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "テーブルを綺麗にして。" }] } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GeminiSttProvider().transcribe({
      audio: Buffer.from([1, 2, 3]),
      mimeType: "audio/webm;codecs=opus",
      model: "gemini-3.5-flash",
      languageHint: "ja",
    });
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      contents: Array<{ parts: Array<{ inline_data?: { mime_type: string; data: string } }> }>;
    };

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("gemini-3.5-flash");
    expect(request.contents[0]?.parts[1]?.inline_data?.mime_type).toBe("audio/webm");
    expect(result.text).toBe("テーブルを綺麗にして。");
  });

  it("calls ElevenLabs Scribe with multipart audio and returns language metadata", async () => {
    process.env.ELEVENLABS_API_KEY = "eleven-test";
    const fetchMock = vi.fn<FetchLike>(async () =>
      new Response(JSON.stringify({ text: "青いボトルを持ってきて", language_code: "ja", words: [{ text: "青い" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ElevenLabsSttProvider().transcribe({
      audio: Buffer.from([1, 2, 3]),
      mimeType: "audio/webm",
      model: "scribe_v2",
      languageHint: "ja",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeInstanceOf(FormData);
    expect(result.detectedLanguage).toBe("ja");
    expect(result.text).toBe("青いボトルを持ってきて");
  });

  it("calls Deepgram Nova with multilingual fallback for code-switched audio", async () => {
    process.env.DEEPGRAM_API_KEY = "deepgram-test";
    const fetchMock = vi.fn<FetchLike>(async () =>
      new Response(
        JSON.stringify({
          metadata: { request_id: "dg-1", duration: 2.1 },
          results: { channels: [{ alternatives: [{ transcript: "put the bottle on the table", confidence: 0.9, languages: ["en"] }] }] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new DeepgramSttProvider().transcribe({
      audio: Buffer.from([1, 2, 3]),
      mimeType: "audio/webm;codecs=opus",
      model: "nova-3",
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("language=multi");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "Token deepgram-test" });
    expect(result.text).toBe("put the bottle on the table");
  });

  it("surfaces missing API keys before provider calls", async () => {
    await expect(new OpenAiSttProvider().transcribe({ audio: Buffer.from([]), mimeType: "audio/webm", model: "whisper-1" })).rejects.toThrow(
      "OPENAI_API_KEY",
    );
    await expect(new GeminiSttProvider().transcribe({ audio: Buffer.from([]), mimeType: "audio/webm", model: "gemini-3.5-flash" })).rejects.toThrow(
      "GEMINI_API_KEY",
    );
    await expect(new ElevenLabsSttProvider().transcribe({ audio: Buffer.from([]), mimeType: "audio/webm", model: "scribe_v2" })).rejects.toThrow(
      "ELEVENLABS_API_KEY",
    );
    await expect(new DeepgramSttProvider().transcribe({ audio: Buffer.from([]), mimeType: "audio/webm", model: "nova-3" })).rejects.toThrow(
      "DEEPGRAM_API_KEY",
    );
  });

  it("surfaces provider error responses", async () => {
    process.env.DEEPGRAM_API_KEY = "deepgram-test";
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchLike>(async () =>
        new Response(JSON.stringify({ error: { message: "invalid token" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      new DeepgramSttProvider().transcribe({ audio: Buffer.from([1]), mimeType: "audio/webm", model: "nova-3" }),
    ).rejects.toThrow("Deepgram: 401 invalid token");
  });
});
