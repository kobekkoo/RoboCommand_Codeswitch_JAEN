import { z } from "zod";
import {
  commandVariants,
  environmentTypes,
  inputValidityLabels,
  languages,
  microphoneDistances,
  promptModes,
  qualityLabels,
  taskTypes,
} from "@/lib/domain";
import { MAX_AUDIO_FILE_BYTES, supportedAudioMimeTypes } from "@/lib/constants";

const formBooleanSchema = z.union([z.boolean(), z.enum(["true", "false"])]).transform((value) => value === true || value === "true");
const promptDifficultySchema = z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]));

export const consentSchema = z.object({
  accepted: z.boolean().refine((value) => value, "Consent is required to continue."),
});

export const onboardingSchema = z.object({
  primaryLanguage: z.string().min(1),
  additionalLanguages: z.string().max(200).optional(),
  accentRegion: z.string().max(120).optional(),
  ageBand: z.string().min(1),
  voiceAssistantFamiliarity: z.enum(["none", "occasional", "frequent", "prefer_not_to_say"]),
  defaultDeviceCategory: z.enum(["phone", "laptop", "tablet", "desktop", "prefer_not_to_say"]),
  headphonesOrExternalMic: z.enum(["yes", "no", "prefer_not_to_say"]),
});

export const sessionSetupSchema = z.object({
  recipeSlug: z.string().min(1),
  environmentType: z.enum(environmentTypes),
  backgroundNoise: z.string().max(160).optional(),
  microphoneDistance: z.enum(microphoneDistances),
  deviceCategory: z.string().max(80).optional(),
  expectedInterruptions: z.boolean(),
  deviceMetadataJson: z.record(z.string(), z.unknown()).optional(),
});

export const recordingSubmitSchema = z.object({
  sessionId: z.string().min(1),
  assignmentId: z.string().min(1),
  contributorTranscript: z.string().trim().min(1, "A transcript is required."),
  mimeType: z.string().min(1),
  durationMs: z.coerce.number().int().min(250).max(25_000),
  audioSampleRateHz: z.coerce.number().int().positive().optional(),
  channelCount: z.coerce.number().int().positive().optional(),
  clientRms: z.coerce.number().min(0).max(1).optional(),
  clientPeak: z.coerce.number().min(0).max(1).optional(),
  inputValidity: z.enum(inputValidityLabels).optional(),
  silenceWarning: formBooleanSchema,
  clippingWarning: formBooleanSchema,
});

export const skipAssignmentSchema = z.object({
  sessionId: z.string().min(1),
  assignmentId: z.string().min(1),
  skipReason: z.string().trim().min(2).max(300),
});

export const adminLoginSchema = z.object({
  password: z.string().min(1),
});

export const reviewDecisionSchema = z.object({
  recordingId: z.string().min(1),
  reviewedTranscript: z.string().trim().min(1),
  decision: z.enum(["accepted", "rejected"]),
  qualityFlags: z.array(z.enum(qualityLabels)).min(1),
  rejectionReason: z.string().max(300).optional(),
  audioQualityScore: z.coerce.number().int().min(1).max(5),
  commandComplianceScore: z.coerce.number().int().min(1).max(5),
  transcriptConfidenceScore: z.coerce.number().int().min(1).max(5),
  reviewerNotes: z.string().max(1000).optional(),
  semanticAnnotation: z
    .object({
      intent: z.string().trim().min(2).max(120),
      slotsJson: z.record(z.string(), z.unknown()),
      urgency: z.enum(["normal", "urgent", "safety_critical"]),
      requiresClarification: z.boolean(),
      safetySensitive: z.boolean(),
    })
    .optional(),
});

export const recipeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(3),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().min(5),
    contributorInstructions: z.string().trim().min(5),
    promptsPerSession: z.coerce.number().int().min(1).max(20),
    targetAcceptedRecordings: z.coerce.number().int().min(1),
  }),
  z.object({ action: z.literal("clone"), recipeId: z.string().min(1) }),
  z.object({
    action: z.literal("update"),
    recipeId: z.string().min(1),
    name: z.string().trim().min(3).optional(),
    description: z.string().trim().min(5).optional(),
    contributorInstructions: z.string().trim().min(5).optional(),
    targetAcceptedRecordings: z.coerce.number().int().min(1).optional(),
    promptsPerSession: z.coerce.number().int().min(1).max(20).optional(),
    followUpNotes: z.string().max(1200).optional(),
  }),
  z.object({ action: z.literal("activate"), recipeId: z.string().min(1) }),
  z.object({ action: z.literal("archive"), recipeId: z.string().min(1) }),
  z.object({
    action: z.literal("addPrompt"),
    recipeId: z.string().min(1),
    promptMode: z.enum(promptModes),
    displayInstruction: z.string().trim().min(3),
    exactText: z.string().optional(),
    language: z.enum(languages),
    taskType: z.enum(taskTypes),
    commandVariant: z.enum(commandVariants),
    targetIntent: z.string().trim().min(2),
    slotsJson: z.record(z.string(), z.unknown()).optional(),
    safetySensitive: z.boolean().optional(),
    difficulty: promptDifficultySchema.optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
  }),
  z.object({
    action: z.literal("updatePrompt"),
    promptId: z.string().min(1),
    promptMode: z.enum(promptModes),
    displayInstruction: z.string().trim().min(3),
    exactText: z.string().optional(),
    language: z.enum(languages),
    taskType: z.enum(taskTypes),
    commandVariant: z.enum(commandVariants),
    targetIntent: z.string().trim().min(2),
  }),
]);

export const evaluationCreateSchema = z.object({
  recipeId: z.string().min(1),
  name: z.string().trim().min(3),
  modelConfigIds: z.array(z.string().min(1)).min(1),
  filters: z.record(z.string(), z.unknown()).optional(),
  recordingIds: z.array(z.string().min(1)).optional(),
  evalDatasetId: z.string().min(1).optional(),
  scorerConfigIds: z.array(z.string().min(1)).optional(),
  taskConfigJson: z.record(z.string(), z.unknown()).optional(),
});

export const evaluationRenameSchema = z.object({
  runId: z.string().min(1),
  name: z.string().trim().min(3).max(120),
});

export const evalDatasetCreateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
  recipeId: z.string().min(1).optional(),
  recordingIds: z.array(z.string().min(1)).min(1).optional(),
  rows: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(160),
        source: z.enum(["recording", "import", "manual"]),
        sourceRecordingId: z.string().trim().min(1).optional(),
        inputText: z.string().trim().min(1).max(2000),
        audioStoragePath: z.string().trim().max(1000).optional(),
        audioUrl: z.string().trim().max(1000).optional(),
        humanTranscript: z.string().trim().min(1).max(2000),
        expectedText: z.string().trim().max(2000).optional(),
        tags: z.array(z.string().trim().min(1).max(80)).default([]),
        metadataJson: z.record(z.string(), z.unknown()).default({}),
        rowOrder: z.coerce.number().int().min(0),
      }),
    )
    .optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).optional(),
}).refine((value) => Boolean(value.recordingIds?.length || value.rows?.length), {
  message: "Dataset requires at least one selected recording or imported row.",
}).refine((value) => !value.rows?.some((row) => row.source === "manual" && !row.audioStoragePath && !row.audioUrl), {
  message: "Manual dataset rows require an uploaded audio file.",
});

export const scorerCreateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  scorerType: z.enum(["deterministic", "llm_judge", "human_review"]),
  description: z.string().trim().min(3).max(500),
  metricKeys: z.array(z.string().trim().min(1)).min(1),
  rubricText: z.string().trim().max(2000).optional(),
  judgeModel: z.string().trim().max(120).optional(),
  thresholdsJson: z.record(z.string(), z.unknown()).optional(),
});

export const scorerUpdateSchema = z.object({
  scorerId: z.string().min(1),
  name: z.string().trim().min(3).max(120).optional(),
  scorerType: z.enum(["deterministic", "llm_judge", "human_review"]).optional(),
  description: z.string().trim().min(3).max(500).optional(),
  metricKeys: z.array(z.string().trim().min(1)).min(1).optional(),
  rubricText: z.string().trim().max(2000).optional(),
  judgeModel: z.string().trim().max(120).optional(),
  thresholdsJson: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
});

export const playgroundRunSchema = z.object({
  evalDatasetId: z.string().min(1),
  sampleSize: z.coerce.number().int().min(1).max(10),
  modelConfigIds: z.array(z.string().min(1)).min(1),
  scorerConfigIds: z.array(z.string().min(1)).default([]),
  taskConfigJson: z.record(z.string(), z.unknown()).optional(),
});

export const playgroundPromoteSchema = z.object({
  playgroundSessionId: z.string().min(1),
  name: z.string().trim().min(3).max(120),
});

export const playgroundSessionUpdateSchema = z.object({
  resultsJson: z.array(z.record(z.string(), z.unknown())),
  sampleRecordingIds: z.array(z.string().min(1)),
});

export function validateAudioUpload(file: File | Blob, mimeType: string) {
  if (file.size > MAX_AUDIO_FILE_BYTES) {
    return { ok: false as const, error: "Audio file is larger than the 10 MB MVP limit." };
  }

  const normalized = mimeType.toLowerCase();
  const baseMime = normalized.split(";")[0] ?? normalized;
  const allowed = supportedAudioMimeTypes.some((candidate) => {
    const candidateBase = candidate.split(";")[0];
    return normalized === candidate || baseMime === candidateBase;
  });

  if (!allowed) {
    return { ok: false as const, error: `Unsupported audio type: ${mimeType}` };
  }

  return { ok: true as const };
}
