import type { CommandPrompt, QualityReview, Recording, RecordingSession } from "@/lib/domain";
import { publicSnapshot } from "@/lib/data/repository";

type Row = {
  recording: Recording;
  prompt?: CommandPrompt;
  session?: RecordingSession;
  review?: QualityReview;
};

export async function buildDatasetPackage(recipeId: string) {
  const snapshot = await publicSnapshot();
  const recipe = snapshot.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  const prompts = snapshot.prompts.filter((prompt) => prompt.recipeId === recipe.id);
  const quotas = snapshot.quotas.filter((quota) => quota.recipeId === recipe.id);
  const recordings = snapshot.recordings.filter((recording) => recording.recipeId === recipe.id && !recording.deletedAt);
  const rows: Row[] = recordings.map((recording) => ({
    recording,
    prompt: prompts.find((prompt) => prompt.id === recording.promptId),
    session: snapshot.sessions.find((session) => session.id === recording.sessionId),
    review: snapshot.reviews.find((review) => review.recordingId === recording.id),
  }));
  const accepted = rows.filter((row) => row.recording.reviewStatus === "accepted" && row.review);
  const rejected = rows.filter((row) => row.recording.reviewStatus === "rejected");
  const pending = rows.filter((row) => row.recording.reviewStatus === "pending");

  const byLanguage = countBy(prompts.map((prompt) => prompt.language));
  const byTaskType = countBy(prompts.map((prompt) => prompt.taskType));
  const byCodeSwitchLevel = countBy(prompts.map(codeSwitchLevelForPrompt).filter(presentString));
  const byEnvironment = countBy(rows.map((row) => row.session?.environmentType ?? "Unknown"));
  const releaseReadiness = {
    targetAcceptedRecordings: recipe.targetAcceptedRecordings,
    acceptedRecordings: accepted.length,
    coveragePercent: recipe.targetAcceptedRecordings
      ? Math.round((accepted.length / recipe.targetAcceptedRecordings) * 100)
      : 0,
    pendingReview: pending.length,
    rejectedRecordings: rejected.length,
    promptCount: prompts.length,
    quotaCount: quotas.length,
  };

  const manifest = accepted.map((row) => ({
    recordingId: row.recording.id,
    audioEndpoint: `/api/audio/${row.recording.id}`,
    storagePath: row.recording.storagePath,
    mimeType: row.recording.mimeType,
    durationMs: row.recording.durationMs,
    contributorTranscript: row.recording.contributorTranscript,
    reviewedTranscript: row.review?.reviewedTranscript,
    intent: row.review?.semanticAnnotation?.intent ?? row.prompt?.targetIntent,
    slots: row.review?.semanticAnnotation?.slotsJson ?? row.prompt?.slotsJson ?? {},
    language: row.prompt?.language,
    taskType: row.prompt?.taskType,
    commandVariant: row.prompt?.commandVariant,
    codeSwitchLevel: codeSwitchLevelForPrompt(row.prompt),
    promptDifficulty: row.prompt?.difficulty,
    promptTags: row.prompt?.tags ?? [],
    safetySensitive:
      row.review?.semanticAnnotation?.safetySensitive ??
      row.prompt?.safetySensitive ??
      (row.prompt?.taskType === "Safety intervention" || row.prompt?.commandVariant === "Safety-sensitive"),
    environment: row.session?.environmentType,
    microphoneDistance: row.session?.microphoneDistance,
    split: splitFor(row.recording.id),
  }));

  return {
    datasetCard: {
      id: recipe.id,
      name: recipe.name,
      version: recipe.version,
      status: recipe.status,
      description: recipe.description,
      useCase: recipe.internalObjective,
      contributorInstructions: recipe.contributorInstructions,
      consentVersion: recipe.consentVersion,
      supportedLanguages: recipe.supportedLanguages,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
      limitations: [
        "Prototype collection flow; speaker identity verification is not implemented.",
        "Temporary audio endpoints require admin access and are not permanent signed URLs.",
        "Semantic labels are reviewer-provided and should be audited before model training.",
      ],
      governance: {
        excludesDeletedRecordings: true,
        consentTracked: true,
        piiReviewViaQualityFlags: true,
      },
      releaseReadiness,
      coverage: { byLanguage, byTaskType, byCodeSwitchLevel, byEnvironment },
      quotas,
    },
    manifest,
    splits: {
      train: manifest.filter((row) => row.split === "train"),
      validation: manifest.filter((row) => row.split === "validation"),
      test: manifest.filter((row) => row.split === "test"),
    },
    trainingExamples: manifest.map((row) => ({
      input: row.contributorTranscript,
      output: {
        intent: row.intent,
        slots: row.slots,
        safety_sensitive: row.safetySensitive,
      },
      metadata: {
        recordingId: row.recordingId,
        language: row.language,
        taskType: row.taskType,
        codeSwitchLevel: row.codeSwitchLevel,
        split: row.split,
      },
    })),
  };
}

function countBy(values: string[]) {
  return [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function codeSwitchLevelForPrompt(prompt?: CommandPrompt) {
  const level = prompt?.slotsJson.codeSwitchLevel ?? prompt?.slotsJson.code_switch_level;
  if (typeof level === "string" && level.trim()) return level.trim();
  const tag = prompt?.tags.find((item) => item.startsWith("cs-level:"));
  return tag?.slice("cs-level:".length);
}

function presentString(value: string | undefined): value is string {
  return Boolean(value);
}

function splitFor(id: string) {
  const bucket = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 10;
  if (bucket < 7) return "train";
  if (bucket < 9) return "validation";
  return "test";
}
