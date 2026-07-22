import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { getEnv } from "@/lib/env";
import type { SttProviderId } from "@/lib/domain";

export interface SttProvider {
  providerId: SttProviderId;
  transcribe(input: {
    audio: Buffer | File;
    mimeType: string;
    model: string;
    languageHint?: string;
    promptHint?: string;
    configuration?: Record<string, unknown>;
  }): Promise<{
    text: string;
    detectedLanguage?: string;
    latencyMs: number;
    rawResponse?: unknown;
  }>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim() || "application/octet-stream";
}

function bufferFromAudio(audio: Buffer | File) {
  if (audio instanceof File) return audio.arrayBuffer().then((value) => Buffer.from(value));
  return Promise.resolve(audio);
}

function arrayBufferFromBuffer(buffer: Buffer) {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes.buffer;
}

function audioBlob(buffer: Buffer, mimeType: string) {
  return new Blob([arrayBufferFromBuffer(buffer)], { type: baseMimeType(mimeType) });
}

function transcriptionInstruction(languageHint?: string) {
  const language =
    languageHint === "en"
      ? "English"
      : languageHint === "ja"
        ? "Japanese"
        : "the same language or languages spoken in the audio";
  return [
    `Transcribe the audio in ${language}.`,
    "Return only the spoken words as plain transcript text.",
    "Do not translate, summarize, add labels, add timestamps, or complete missing/truncated speech.",
    "For code-switched speech, preserve each language exactly as spoken.",
  ].join(" ");
}

function cleanProviderText(value: string) {
  return value
    .trim()
    .replace(/^```(?:json|text)?/i, "")
    .replace(/```$/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

async function responseMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return `${response.status} ${response.statusText}`.trim();
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string; message?: string; detail?: string };
    if (typeof body.error === "string") return `${response.status} ${body.error}`;
    return `${response.status} ${body.error?.message ?? body.message ?? body.detail ?? response.statusText}`;
  } catch {
    return `${response.status} ${text.slice(0, 240)}`;
  }
}

async function retryableFetch(input: RequestInfo | URL, init: RequestInit, providerName: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok) return response;
      const message = await responseMessage(response);
      const error = new Error(`${providerName}: ${message}`);
      lastError = error;
      if (response.status < 500 && response.status !== 429) throw error;
    } catch (error) {
      lastError = error;
      const status = error instanceof Error ? Number(error.message.match(/\b(\d{3})\b/)?.[1]) : undefined;
      if (status && status < 500 && status !== 429) throw error;
    }
    await sleep(250 * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(`${providerName} transcription failed.`);
}

export class MockSttProvider implements SttProvider {
  providerId: SttProviderId = "mock";

  async transcribe(input: { promptHint?: string; model: string }) {
    const started = Date.now();
    const source = input.promptHint?.trim() || "mock transcript";
    const words = source.split(/\s+/);
    const text = input.model.includes("noisy") && words.length > 2 ? words.slice(1).join(" ") : source;
    await sleep(20);
    return {
      text,
      detectedLanguage: "mock",
      latencyMs: Date.now() - started,
      rawResponse: { deterministic: true, model: input.model },
    };
  }
}

export class OpenAiSttProvider implements SttProvider {
  providerId: SttProviderId = "openai";

  async transcribe(input: {
    audio: Buffer | File;
    mimeType: string;
    model: string;
    languageHint?: string;
    promptHint?: string;
  }) {
    const apiKey = getEnv().OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const client = new OpenAI({ apiKey });
    const started = Date.now();
    const file =
      input.audio instanceof File
        ? input.audio
        : await toFile(input.audio, `commandloop-audio.${extensionForMime(input.mimeType)}`, {
            type: input.mimeType,
          });

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await client.audio.transcriptions.create({
          file,
          model: input.model,
          language: input.languageHint,
          prompt: input.promptHint,
        });
        return {
          text: response.text,
          detectedLanguage: undefined,
          latencyMs: Date.now() - started,
          rawResponse: { textLength: response.text.length, model: input.model },
        };
      } catch (error) {
        lastError = error;
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
        if (status && status < 500 && status !== 429) break;
        await sleep(250 * 2 ** attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("OpenAI transcription failed.");
  }
}

export class GeminiSttProvider implements SttProvider {
  providerId: SttProviderId = "gemini";

  async transcribe(input: { audio: Buffer | File; mimeType: string; model: string; languageHint?: string }) {
    const apiKey = getEnv().GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    const started = Date.now();
    const buffer = await bufferFromAudio(input.audio);
    const response = await retryableFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: transcriptionInstruction(input.languageHint) },
                {
                  inline_data: {
                    mime_type: baseMimeType(input.mimeType),
                    data: buffer.toString("base64"),
                  },
                },
              ],
            },
          ],
        }),
      },
      "Gemini",
    );
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: unknown;
    };
    const text = body.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text ?? "").join(" ").trim();
    if (!text) throw new Error("Gemini returned an empty transcription response.");
    return {
      text: cleanProviderText(text),
      latencyMs: Date.now() - started,
      rawResponse: {
        model: input.model,
        textLength: text.length,
        promptFeedback: body.promptFeedback,
      },
    };
  }
}

export class ElevenLabsSttProvider implements SttProvider {
  providerId: SttProviderId = "elevenlabs";

  async transcribe(input: { audio: Buffer | File; mimeType: string; model: string; languageHint?: string }) {
    const apiKey = getEnv().ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
    const started = Date.now();
    const buffer = await bufferFromAudio(input.audio);
    const form = new FormData();
    form.set("model_id", input.model);
    if (input.languageHint) form.set("language_code", input.languageHint);
    form.set("file", audioBlob(buffer, input.mimeType), `commandloop-audio.${extensionForMime(input.mimeType)}`);

    const response = await retryableFetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      },
      "ElevenLabs",
    );
    const body = (await response.json()) as {
      text?: string;
      language_code?: string;
      language_probability?: number;
      words?: unknown[];
    };
    if (!body.text?.trim()) throw new Error("ElevenLabs returned an empty transcription response.");
    return {
      text: body.text.trim(),
      detectedLanguage: body.language_code,
      latencyMs: Date.now() - started,
      rawResponse: {
        model: input.model,
        languageProbability: body.language_probability,
        wordCount: body.words?.length ?? 0,
      },
    };
  }
}

export class DeepgramSttProvider implements SttProvider {
  providerId: SttProviderId = "deepgram";

  async transcribe(input: { audio: Buffer | File; mimeType: string; model: string; languageHint?: string }) {
    const apiKey = getEnv().DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY is not configured.");
    const started = Date.now();
    const buffer = await bufferFromAudio(input.audio);
    const params = new URLSearchParams({
      model: input.model,
      smart_format: "true",
    });
    params.set("language", input.languageHint ?? "multi");
    const response = await retryableFetch(
      `https://api.deepgram.com/v1/listen?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "content-type": baseMimeType(input.mimeType),
        },
        body: arrayBufferFromBuffer(buffer),
      },
      "Deepgram",
    );
    const body = (await response.json()) as {
      metadata?: { request_id?: string; duration?: number; model_info?: unknown };
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            confidence?: number;
            languages?: string[];
            words?: Array<{ language?: string }>;
          }>;
        }>;
      };
    };
    const alternative = body.results?.channels?.[0]?.alternatives?.[0];
    if (!alternative?.transcript?.trim()) throw new Error("Deepgram returned an empty transcription response.");
    return {
      text: alternative.transcript.trim(),
      detectedLanguage: alternative.languages?.join(","),
      latencyMs: Date.now() - started,
      rawResponse: {
        model: input.model,
        requestId: body.metadata?.request_id,
        duration: body.metadata?.duration,
        confidence: alternative.confidence,
        languages: alternative.languages,
        modelInfo: body.metadata?.model_info,
        wordCount: alternative.words?.length ?? 0,
      },
    };
  }
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "bin";
}

export function providerFor(providerId: string): SttProvider {
  if (providerId === "openai") return new OpenAiSttProvider();
  if (providerId === "gemini") return new GeminiSttProvider();
  if (providerId === "elevenlabs") return new ElevenLabsSttProvider();
  if (providerId === "deepgram") return new DeepgramSttProvider();
  return new MockSttProvider();
}
