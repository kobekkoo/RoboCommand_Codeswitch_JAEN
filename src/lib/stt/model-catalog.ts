import type { SttModelConfig } from "@/lib/domain";

type ModelCatalogEntry = {
  summary: string;
  details: string;
  externalUrl?: string;
  externalLabel?: string;
  isRealProvider: boolean;
};

const modelCatalog: Record<string, ModelCatalogEntry> = {
  "mock:mock-echo": {
    summary: "Deterministic pipeline placeholder that echoes the reviewed transcript.",
    details:
      "Mock Echo does not listen to the audio. It returns the reviewed transcript as the model output so the evaluation pipeline can be smoke-tested with a near-perfect baseline.",
    isRealProvider: false,
  },
  "mock:mock-noisy": {
    summary: "Deterministic placeholder that intentionally drops the first word.",
    details:
      "Mock Noisy does not listen to the audio. It creates a predictable error by dropping the first word, which makes dashboards and failure slices easier to demo.",
    isRealProvider: false,
  },
  "openai:gpt-4o-transcribe": {
    summary: "OpenAI Audio API speech-to-text model for higher-quality transcription.",
    details:
      "This is a real API-backed transcription model. It sends the recorded audio to OpenAI's transcriptions endpoint and stores the returned transcript for comparison against reviewed text.",
    externalUrl: "https://platform.openai.com/docs/guides/speech-to-text",
    externalLabel: "OpenAI speech-to-text guide",
    isRealProvider: true,
  },
  "openai:gpt-4o-mini-transcribe": {
    summary: "Smaller OpenAI Audio API speech-to-text model for faster or lower-cost evaluation.",
    details:
      "This is a real API-backed transcription model. Use it as a practical baseline when you want to compare quality and latency against the larger transcription model.",
    externalUrl: "https://platform.openai.com/docs/guides/speech-to-text",
    externalLabel: "OpenAI speech-to-text guide",
    isRealProvider: true,
  },
  "openai:whisper-1": {
    summary: "OpenAI Whisper transcription endpoint, powered by the open source Whisper V2 model.",
    details:
      "This is a real API-backed transcription model. It is useful as a widely known baseline and supports richer response formats such as verbose JSON.",
    externalUrl: "https://platform.openai.com/docs/api-reference/audio/createTranscription",
    externalLabel: "OpenAI transcription API reference",
    isRealProvider: true,
  },
  "gemini:gemini-3.5-flash": {
    summary: "Google Gemini audio-understanding model prompted to return a verbatim transcript.",
    details:
      "This is a real hosted model accessed with GEMINI_API_KEY. It is useful as a fast multimodal baseline for short audio, code-switching, and incomplete command clips.",
    externalUrl: "https://ai.google.dev/gemini-api/docs/audio",
    externalLabel: "Gemini audio understanding guide",
    isRealProvider: true,
  },
  "gemini:gemini-3.1-pro-preview": {
    summary: "Google Gemini Pro preview audio-understanding model for higher-quality multimodal transcription tests.",
    details:
      "This is a real hosted model accessed with GEMINI_API_KEY. Use it when you want a stronger Gemini comparison point, while remembering preview models may change behavior over time.",
    externalUrl: "https://ai.google.dev/gemini-api/docs/gemini-3",
    externalLabel: "Gemini 3 model guide",
    isRealProvider: true,
  },
  "elevenlabs:scribe_v2": {
    summary: "ElevenLabs current Scribe speech-to-text model.",
    details:
      "This is a real API-backed transcription model accessed with ELEVENLABS_API_KEY. It returns transcript text plus language and word metadata that can help inspect multilingual clips.",
    externalUrl: "https://elevenlabs.io/docs/api-reference/speech-to-text/convert",
    externalLabel: "ElevenLabs speech-to-text API",
    isRealProvider: true,
  },
  "elevenlabs:scribe_v1": {
    summary: "ElevenLabs Scribe v1, included for comparability with the Back to Basics paper.",
    details:
      "This is a real API-backed transcription model accessed with ELEVENLABS_API_KEY. Keep it mainly as a paper-comparable baseline; prefer Scribe v2 for current default evaluations.",
    externalUrl: "https://elevenlabs.io/docs/api-reference/speech-to-text/convert",
    externalLabel: "ElevenLabs speech-to-text API",
    isRealProvider: true,
  },
  "deepgram:nova-3": {
    summary: "Deepgram Nova-3 general ASR model with multilingual/code-switch support.",
    details:
      "This is a real API-backed transcription model accessed with DEEPGRAM_API_KEY. It is the recommended Nova default for multilingual or noisy command audio.",
    externalUrl: "https://developers.deepgram.com/docs/models-languages-overview",
    externalLabel: "Deepgram models and languages",
    isRealProvider: true,
  },
  "deepgram:nova-2": {
    summary: "Deepgram Nova-2, included because the Back to Basics paper reports Nova 2.",
    details:
      "This is a real API-backed transcription model accessed with DEEPGRAM_API_KEY. Use it when you want the closest hosted Nova comparison to the paper's model set.",
    externalUrl: "https://developers.deepgram.com/docs/models-languages-overview",
    externalLabel: "Deepgram models and languages",
    isRealProvider: true,
  },
};

export function modelCatalogEntry(model: Pick<SttModelConfig, "provider" | "modelIdentifier">): ModelCatalogEntry {
  return (
    modelCatalog[`${model.provider}:${model.modelIdentifier}`] ?? {
      summary: "Configured STT model.",
      details: "This model is available through the provider configured for this CommandLoop environment.",
      isRealProvider: model.provider !== "mock",
    }
  );
}

export function modelProviderLabel(model: Pick<SttModelConfig, "provider">) {
  if (model.provider === "openai") return "OpenAI API";
  if (model.provider === "gemini") return "Google Gemini API";
  if (model.provider === "elevenlabs") return "ElevenLabs API";
  if (model.provider === "deepgram") return "Deepgram API";
  return "Local mock";
}
