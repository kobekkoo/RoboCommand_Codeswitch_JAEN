import {
  CONSENT_VERSION,
  defaultNormalizationProfile,
  type CollectionRecipe,
  type CommandPrompt,
  type Contributor,
  type DashboardStats,
  type EnvironmentType,
  type EvalDataset,
  type EvalDatasetRow,
  type EvaluationMetric,
  type EvaluationRun,
  type EvaluationRunModel,
  type ExperimentSnapshot,
  type PlaygroundResult,
  type PlaygroundSession,
  type CommandSemanticAnnotation,
  type MicrophoneDistance,
  type PromptAssignment,
  type QualityLabel,
  type QualityReview,
  type RecipeQuota,
  type Recording,
  type RecordingSession,
  type ScorerConfig,
  type SessionView,
  type SttModelConfig,
  type SttResult,
} from "@/lib/domain";
import { audioExtensionForMime } from "@/lib/audio/validation";
import {
  hospitalNursePrompts,
  hospitalNurseRecipe,
  robotCsHouseholdPrompts,
  robotCsHouseholdRecipe,
  seedModelConfigs,
  seedPrompts,
  seedQuotas,
  seedRecipe,
  seedScorerConfigs,
} from "@/lib/data/seed";

export type DemoAudioObject = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
};

export type CommandLoopData = {
  contributors: Contributor[];
  recipes: CollectionRecipe[];
  quotas: RecipeQuota[];
  prompts: CommandPrompt[];
  sessions: RecordingSession[];
  assignments: PromptAssignment[];
  recordings: Recording[];
  reviews: QualityReview[];
  modelConfigs: SttModelConfig[];
  evaluationRuns: EvaluationRun[];
  evaluationRunModels: EvaluationRunModel[];
  sttResults: SttResult[];
  metrics: EvaluationMetric[];
  evalDatasets: EvalDataset[];
  scorerConfigs: ScorerConfig[];
  playgroundSessions: PlaygroundSession[];
  experimentSnapshots: ExperimentSnapshot[];
  audioObjects: Map<string, DemoAudioObject>;
};

declare global {
  var __commandLoopData: CommandLoopData | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function completionCode() {
  return `CL-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function cloneSeed<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const importedRowsKey = "__commandLoopDatasetRows";

export function createInitialData(): CommandLoopData {
  return {
    contributors: [],
    recipes: [cloneSeed(seedRecipe), cloneSeed(hospitalNurseRecipe), cloneSeed(robotCsHouseholdRecipe)],
    quotas: cloneSeed(seedQuotas),
    prompts: cloneSeed([...seedPrompts, ...hospitalNursePrompts, ...robotCsHouseholdPrompts]),
    sessions: [],
    assignments: [],
    recordings: [],
    reviews: [],
    modelConfigs: cloneSeed(seedModelConfigs),
    evaluationRuns: [],
    evaluationRunModels: [],
    sttResults: [],
    metrics: [],
    evalDatasets: [],
    scorerConfigs: cloneSeed(seedScorerConfigs),
    playgroundSessions: [],
    experimentSnapshots: [],
    audioObjects: new Map(),
  };
}

export function resetDemoData() {
  globalThis.__commandLoopData = createInitialData();
  return globalThis.__commandLoopData;
}

export function getData() {
  if (!globalThis.__commandLoopData) {
    globalThis.__commandLoopData = createInitialData();
  }
  return globalThis.__commandLoopData;
}

export function publicSnapshot() {
  const data = getData();
  return {
    recipes: data.recipes,
    prompts: data.prompts,
    sessions: data.sessions,
    assignments: data.assignments,
    recordings: data.recordings,
    reviews: data.reviews,
    quotas: data.quotas,
    modelConfigs: data.modelConfigs,
    evaluationRuns: data.evaluationRuns,
    evaluationRunModels: data.evaluationRunModels,
    sttResults: data.sttResults,
    metrics: data.metrics,
    evalDatasets: data.evalDatasets,
    scorerConfigs: data.scorerConfigs,
    playgroundSessions: data.playgroundSessions,
    experimentSnapshots: data.experimentSnapshots,
  };
}

export function getOrCreateContributor(existingContributorId?: string) {
  const data = getData();
  const existing = existingContributorId
    ? data.contributors.find((contributor) => contributor.id === existingContributorId)
    : undefined;
  if (existing) return existing;

  const contributor: Contributor = {
    id: id("contributor"),
    publicCode: `P-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    createdAt: nowIso(),
  };
  data.contributors.push(contributor);
  return contributor;
}

export function recordContributorConsent(contributorId: string) {
  const data = getData();
  const contributor = data.contributors.find((candidate) => candidate.id === contributorId);
  if (!contributor) throw new Error("Contributor not found.");
  contributor.consentVersion = CONSENT_VERSION;
  contributor.consentedAt = nowIso();
  return contributor;
}

export function updateContributorProfile(
  contributorId: string,
  profile: Partial<
    Pick<
      Contributor,
      | "primaryLanguage"
      | "additionalLanguages"
      | "accentRegion"
      | "ageBand"
      | "voiceAssistantFamiliarity"
      | "defaultDeviceCategory"
      | "headphonesOrExternalMic"
    >
  >,
) {
  const data = getData();
  const contributor = data.contributors.find((candidate) => candidate.id === contributorId);
  if (!contributor) throw new Error("Contributor not found.");
  Object.assign(contributor, profile);
  return contributor;
}

export function getActiveRecipes() {
  return getData().recipes.filter((recipe) => recipe.status === "active");
}

export function getRecipeBySlug(slug: string) {
  return getData().recipes.find((recipe) => recipe.slug === slug);
}

export function getRecipeById(recipeId: string) {
  return getData().recipes.find((recipe) => recipe.id === recipeId);
}

export function getPromptsForRecipe(recipeId: string) {
  return getData()
    .prompts.filter((prompt) => prompt.recipeId === recipeId && prompt.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function selectPromptAssignments(prompts: CommandPrompt[], completedPromptIds: Set<string>, count: number) {
  const available = prompts.filter((prompt) => prompt.isActive);
  const byLanguage = [...new Set(available.map((prompt) => prompt.language))].sort();
  const selected: CommandPrompt[] = [];

  for (const preferFresh of [true, false]) {
    let madeProgress = true;
    while (selected.length < count && madeProgress) {
      madeProgress = false;
      for (const language of byLanguage) {
        const candidate = available.find(
          (prompt) =>
            prompt.language === language &&
            !selected.some((item) => item.id === prompt.id) &&
            (preferFresh ? !completedPromptIds.has(prompt.id) : true),
        );
        if (candidate) {
          selected.push(candidate);
          madeProgress = true;
        }
        if (selected.length >= count) break;
      }
    }
  }

  return selected.slice(0, count);
}

export function createOrResumeSession(input: {
  contributorId: string;
  recipeSlug: string;
  environmentType: EnvironmentType;
  backgroundNoise?: string;
  microphoneDistance: MicrophoneDistance;
  deviceCategory?: string;
  deviceMetadataJson?: Record<string, unknown>;
  expectedInterruptions: boolean;
}) {
  const data = getData();
  const recipe = getRecipeBySlug(input.recipeSlug);
  if (!recipe || recipe.status !== "active") throw new Error("Active recipe not found.");

  const existing = data.sessions.find(
    (session) =>
      session.contributorId === input.contributorId &&
      session.recipeId === recipe.id &&
      (session.status === "setup" || session.status === "in_progress"),
  );
  if (existing) {
    Object.assign(existing, {
      environmentType: input.environmentType,
      backgroundNoise: input.backgroundNoise,
      microphoneDistance: input.microphoneDistance,
      deviceCategory: input.deviceCategory,
      deviceMetadataJson: input.deviceMetadataJson ?? existing.deviceMetadataJson,
      expectedInterruptions: input.expectedInterruptions,
    });
    return existing;
  }

  const priorCompletedPromptIds = new Set(
    data.recordings
      .filter((recording) => recording.contributorId === input.contributorId && recording.reviewStatus !== "removed")
      .map((recording) => recording.promptId),
  );
  const prompts = selectPromptAssignments(getPromptsForRecipe(recipe.id), priorCompletedPromptIds, recipe.promptsPerSession);
  if (prompts.length === 0) throw new Error("Recipe does not have active prompts.");

  const session: RecordingSession = {
    id: id("session"),
    contributorId: input.contributorId,
    recipeId: recipe.id,
    status: "setup",
    environmentType: input.environmentType,
    backgroundNoise: input.backgroundNoise,
    microphoneDistance: input.microphoneDistance,
    deviceCategory: input.deviceCategory,
    deviceMetadataJson: input.deviceMetadataJson ?? {},
    expectedInterruptions: input.expectedInterruptions,
    startedAt: nowIso(),
    completionCode: completionCode(),
  };
  data.sessions.push(session);
  prompts.forEach((prompt, index) => {
    data.assignments.push({
      id: id("assignment"),
      sessionId: session.id,
      promptId: prompt.id,
      assignmentOrder: index + 1,
      status: "assigned",
      createdAt: nowIso(),
    });
  });

  return session;
}

export function markSessionInProgress(sessionId: string) {
  const session = getData().sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error("Session not found.");
  if (session.status === "setup") session.status = "in_progress";
  return session;
}

export function getSessionView(sessionId: string): SessionView | undefined {
  const data = getData();
  const session = data.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return undefined;
  const recipe = data.recipes.find((candidate) => candidate.id === session.recipeId);
  if (!recipe) return undefined;
  const assignments = data.assignments
    .filter((assignment) => assignment.sessionId === sessionId)
    .sort((a, b) => a.assignmentOrder - b.assignmentOrder)
    .map((assignment) => {
      const prompt = data.prompts.find((candidate) => candidate.id === assignment.promptId);
      if (!prompt) throw new Error("Prompt missing for assignment.");
      const recording = data.recordings.find(
        (candidate) => candidate.assignmentId === assignment.id && !candidate.deletedAt,
      );
      return { ...assignment, prompt, recording };
    });

  return { session, recipe, assignments };
}

export function submitRecording(input: {
  sessionId: string;
  assignmentId: string;
  contributorTranscript: string;
  bytes: Uint8Array;
  mimeType: string;
  durationMs: number;
  audioSampleRateHz?: number;
  channelCount?: number;
  clientRms?: number;
  clientPeak?: number;
  inputValidity?: Recording["inputValidity"];
  silenceWarning: boolean;
  clippingWarning: boolean;
}) {
  const data = getData();
  const session = data.sessions.find((candidate) => candidate.id === input.sessionId);
  if (!session) throw new Error("Session not found.");
  const assignment = data.assignments.find(
    (candidate) => candidate.id === input.assignmentId && candidate.sessionId === input.sessionId,
  );
  if (!assignment) throw new Error("Assignment not found.");
  const prompt = data.prompts.find((candidate) => candidate.id === assignment.promptId);
  if (!prompt) throw new Error("Prompt not found.");

  const existing = data.recordings.find(
    (recording) => recording.assignmentId === assignment.id && recording.uploadStatus === "uploaded" && !recording.deletedAt,
  );
  if (existing) return existing;

  const recordingId = id("recording");
  const extension = audioExtensionForMime(input.mimeType);
  const storagePath = `recipes/${session.recipeId}/contributors/${session.contributorId}/sessions/${session.id}/${recordingId}.${extension}`;
  const recording: Recording = {
    id: recordingId,
    sessionId: session.id,
    assignmentId: assignment.id,
    contributorId: session.contributorId,
    recipeId: session.recipeId,
    promptId: prompt.id,
    storagePath,
    mimeType: input.mimeType,
    fileSizeBytes: input.bytes.byteLength,
    durationMs: input.durationMs,
    audioSampleRateHz: input.audioSampleRateHz,
    channelCount: input.channelCount,
    clientRms: input.clientRms,
    clientPeak: input.clientPeak,
    silenceWarning: input.silenceWarning,
    clippingWarning: input.clippingWarning,
    inputValidity: input.inputValidity ?? "valid_command",
    contributorTranscript: input.contributorTranscript,
    uploadStatus: "uploaded",
    reviewStatus: "pending",
    submittedAt: nowIso(),
  };

  data.recordings.push(recording);
  data.audioObjects.set(recording.id, {
    bytes: input.bytes,
    mimeType: input.mimeType,
    fileName: `${recording.id}.${extension}`,
  });
  assignment.status = "submitted";
  session.status = "in_progress";
  completeSessionIfDone(session.id);
  return recording;
}

export function skipAssignment(input: { sessionId: string; assignmentId: string; skipReason: string }) {
  const data = getData();
  const assignment = data.assignments.find(
    (candidate) => candidate.id === input.assignmentId && candidate.sessionId === input.sessionId,
  );
  if (!assignment) throw new Error("Assignment not found.");
  assignment.status = "skipped";
  assignment.skipReason = input.skipReason;
  const session = data.sessions.find((candidate) => candidate.id === input.sessionId);
  if (session && session.status === "setup") session.status = "in_progress";
  completeSessionIfDone(input.sessionId);
  return assignment;
}

export function completeSessionIfDone(sessionId: string) {
  const data = getData();
  const assignments = data.assignments.filter((assignment) => assignment.sessionId === sessionId);
  const session = data.sessions.find((candidate) => candidate.id === sessionId);
  if (session && assignments.length > 0 && assignments.every((assignment) => assignment.status !== "assigned")) {
    session.status = "completed";
    session.completedAt = session.completedAt ?? nowIso();
  }
}

export function getAudioObject(recordingId: string) {
  return getData().audioObjects.get(recordingId);
}

export function uploadEvalDatasetAudio(input: { bytes: Uint8Array; mimeType: string; fileName?: string }) {
  const assetId = id("dataset_audio");
  const extension = audioExtensionForMime(input.mimeType);
  const storagePath = `eval-datasets/manual/${assetId}.${extension}`;
  getData().audioObjects.set(storagePath, {
    bytes: input.bytes,
    mimeType: input.mimeType,
    fileName: input.fileName || `${assetId}.${extension}`,
  });
  return {
    storagePath,
    mimeType: input.mimeType,
    fileName: input.fileName || `${assetId}.${extension}`,
    fileSizeBytes: input.bytes.byteLength,
  };
}

export function getEvalDatasetAudioObject(storagePath: string) {
  return getData().audioObjects.get(storagePath);
}

export function getRecordingDetail(recordingId: string) {
  const data = getData();
  const recording = data.recordings.find((candidate) => candidate.id === recordingId);
  if (!recording) return undefined;
  const prompt = data.prompts.find((candidate) => candidate.id === recording.promptId);
  const session = data.sessions.find((candidate) => candidate.id === recording.sessionId);
  const review = data.reviews.find((candidate) => candidate.recordingId === recording.id);
  return { recording, prompt, session, review };
}

export function getReviewQueue() {
  const data = getData();
  return data.recordings
    .filter((recording) => !recording.deletedAt)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .map((recording) => {
      const prompt = data.prompts.find((candidate) => candidate.id === recording.promptId);
      const recipe = data.recipes.find((candidate) => candidate.id === recording.recipeId);
      const session = data.sessions.find((candidate) => candidate.id === recording.sessionId);
      const review = data.reviews.find((candidate) => candidate.recordingId === recording.id);
      return { recording, prompt, recipe, session, review };
    });
}

export function saveReview(input: {
  recordingId: string;
  reviewedTranscript: string;
  decision: "accepted" | "rejected";
  qualityFlags: QualityLabel[];
  rejectionReason?: string;
  audioQualityScore: number;
  commandComplianceScore: number;
  transcriptConfidenceScore: number;
  reviewerNotes?: string;
  semanticAnnotation?: CommandSemanticAnnotation;
}) {
  const data = getData();
  const recording = data.recordings.find((candidate) => candidate.id === input.recordingId);
  if (!recording) throw new Error("Recording not found.");

  const existing = data.reviews.find((review) => review.recordingId === recording.id);
  const review: QualityReview = {
    id: existing?.id ?? id("review"),
    recordingId: recording.id,
    reviewedTranscript: input.reviewedTranscript,
    decision: input.decision,
    qualityFlags: input.qualityFlags,
    rejectionReason: input.rejectionReason,
    audioQualityScore: input.audioQualityScore,
    commandComplianceScore: input.commandComplianceScore,
    transcriptConfidenceScore: input.transcriptConfidenceScore,
    reviewerNotes: input.reviewerNotes,
    semanticAnnotation: input.semanticAnnotation,
    reviewedAt: nowIso(),
  };

  if (existing) {
    Object.assign(existing, review);
  } else {
    data.reviews.push(review);
  }
  recording.reviewStatus = input.decision;
  return review;
}

export function acceptedRecordingsForEvaluation(recipeId?: string) {
  const data = getData();
  return data.recordings.filter((recording) => {
    if (recording.deletedAt || recording.reviewStatus !== "accepted") return false;
    if (recipeId && recording.recipeId !== recipeId) return false;
    const review = data.reviews.find((candidate) => candidate.recordingId === recording.id);
    return Boolean(review?.reviewedTranscript.trim());
  });
}

export function createEvalDataset(input: {
  name: string;
  description?: string;
  recipeId?: string;
  recordingIds?: string[];
  rows?: EvalDatasetRow[];
  filters?: Record<string, unknown>;
  tags?: string[];
}) {
  const data = getData();
  const accepted = acceptedRecordingsForEvaluation(input.recipeId);
  const allowed = new Set(accepted.map((recording) => recording.id));
  const rows = normalizeDatasetRows(input.rows ?? []);
  const fallbackRecordingIds = rows.length ? [] : accepted.map((recording) => recording.id);
  const selectedIds = (input.recordingIds?.length ? input.recordingIds : fallbackRecordingIds).filter((id) =>
    allowed.has(id),
  );
  if (selectedIds.length === 0 && rows.length === 0) throw new Error("Dataset requires at least one accepted recording or imported row.");
  const filters = { ...(input.filters ?? {}) };
  if (rows.length) filters[importedRowsKey] = rows;
  const dataset: EvalDataset = {
    id: id("dataset"),
    name: input.name,
    description: input.description,
    recipeId: input.recipeId,
    selectionFiltersJson: filters,
    recordingIds: selectedIds,
    rowsJson: rows.length ? rows : undefined,
    tags: input.tags ?? [],
    rowCount: rows.length || selectedIds.length,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.evalDatasets.push(dataset);
  return dataset;
}

function normalizeDatasetRows(rows: EvalDatasetRow[]) {
  return rows.map((row, index) => ({
    ...row,
    id: row.id || id("dataset_row"),
    tags: row.tags ?? [],
    metadataJson: row.metadataJson ?? {},
    rowOrder: row.rowOrder ?? index,
  }));
}

export function getScorerConfigs() {
  return getData().scorerConfigs;
}

export function createScorerConfig(input: {
  name: string;
  scorerType: ScorerConfig["scorerType"];
  description: string;
  metricKeys: string[];
  rubricText?: string;
  judgeModel?: string;
  thresholdsJson?: Record<string, unknown>;
}) {
  const scorer: ScorerConfig = {
    id: id("scorer"),
    name: input.name,
    slug: typeof input.thresholdsJson?.slug === "string" ? input.thresholdsJson.slug : undefined,
    scorerType: input.scorerType,
    description: input.description,
    metricKeys: input.metricKeys,
    rubricText: input.rubricText,
    judgeModel: input.judgeModel,
    thresholdsJson: input.thresholdsJson ?? {},
    isEnabled: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getData().scorerConfigs.push(scorer);
  return scorer;
}

export function updateScorerConfig(input: {
  scorerId: string;
  name?: string;
  scorerType?: ScorerConfig["scorerType"];
  description?: string;
  metricKeys?: string[];
  rubricText?: string;
  judgeModel?: string;
  thresholdsJson?: Record<string, unknown>;
  isEnabled?: boolean;
}) {
  const scorer = getData().scorerConfigs.find((candidate) => candidate.id === input.scorerId);
  if (!scorer) throw new Error("Scorer not found.");
  if (input.name) scorer.name = input.name;
  if (input.scorerType) scorer.scorerType = input.scorerType;
  if (input.description) scorer.description = input.description;
  if (input.metricKeys) scorer.metricKeys = input.metricKeys;
  if (input.rubricText !== undefined) scorer.rubricText = input.rubricText;
  if (input.judgeModel !== undefined) scorer.judgeModel = input.judgeModel;
  if (input.thresholdsJson) {
    scorer.thresholdsJson = input.thresholdsJson;
    scorer.slug = typeof input.thresholdsJson.slug === "string" ? input.thresholdsJson.slug : scorer.slug;
  }
  if (input.isEnabled !== undefined) scorer.isEnabled = input.isEnabled;
  scorer.updatedAt = nowIso();
  return scorer;
}

export function createPlaygroundSession(input: {
  name?: string;
  evalDatasetId?: string;
  status?: PlaygroundSession["status"];
  progressPct?: number;
  currentStep?: string;
  sampleRecordingIds: string[];
  modelConfigIds: string[];
  scorerConfigIds: string[];
  taskConfigJson?: Record<string, unknown>;
  resultsJson: PlaygroundResult[];
}) {
  const session: PlaygroundSession = {
    id: id("playground"),
    name: input.name,
    evalDatasetId: input.evalDatasetId,
    status: input.status,
    progressPct: input.progressPct,
    currentStep: input.currentStep,
    sampleRecordingIds: input.sampleRecordingIds,
    modelConfigIds: input.modelConfigIds,
    scorerConfigIds: input.scorerConfigIds,
    taskConfigJson: input.taskConfigJson ?? {},
    resultsJson: input.resultsJson,
    createdAt: nowIso(),
  };
  getData().playgroundSessions.unshift(session);
  return session;
}

export function markPlaygroundPromoted(playgroundSessionId: string, evaluationRunId: string) {
  const session = getData().playgroundSessions.find((candidate) => candidate.id === playgroundSessionId);
  if (!session) throw new Error("Playground session not found.");
  session.promotedEvaluationRunId = evaluationRunId;
  return session;
}

export function getModelConfigs() {
  const hasKeys = {
    mock: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
  };
  return getData().modelConfigs.map((config) => ({
    ...config,
    isEnabled: config.isEnabled && hasKeys[config.provider],
  }));
}

export function createEvaluationRun(input: {
  recipeId: string;
  name: string;
  modelConfigIds: string[];
  filters?: Record<string, unknown>;
  recordingIds?: string[];
  evalDatasetId?: string;
  scorerConfigIds?: string[];
  taskConfigJson?: Record<string, unknown>;
}) {
  const data = getData();
  const accepted = acceptedRecordingsForEvaluation(input.recipeId);
  const selectedRecordingIdSet = input.recordingIds?.length ? new Set(input.recordingIds) : undefined;
  const selectedRecordings = selectedRecordingIdSet
    ? accepted.filter((recording) => selectedRecordingIdSet.has(recording.id))
    : accepted;
  const run: EvaluationRun = {
    id: id("eval"),
    recipeId: input.recipeId,
    name: input.name,
    status: "draft",
    selectionFiltersJson: input.filters ?? {},
    normalizationProfileJson: defaultNormalizationProfile,
    selectedRecordingIds: selectedRecordings.map((recording) => recording.id),
    totalRecordings: selectedRecordings.length * input.modelConfigIds.length,
    completedRecordings: 0,
    failedRecordings: 0,
    createdAt: nowIso(),
  };
  data.evaluationRuns.push(run);
  input.modelConfigIds.forEach((modelConfigId) => {
    data.evaluationRunModels.push({
      id: id("eval_model"),
      evaluationRunId: run.id,
      sttModelConfigId: modelConfigId,
    });
  });
  if (input.evalDatasetId || input.scorerConfigIds?.length || input.taskConfigJson) {
    const dataset = input.evalDatasetId ? data.evalDatasets.find((candidate) => candidate.id === input.evalDatasetId) : undefined;
    const scorers = data.scorerConfigs.filter((scorer) => input.scorerConfigIds?.includes(scorer.id));
    data.experimentSnapshots.push({
      id: id("experiment"),
      evaluationRunId: run.id,
      evalDatasetId: input.evalDatasetId,
      taskConfigJson: input.taskConfigJson ?? {
        modelConfigIds: input.modelConfigIds,
        promptHintMode: "reference_for_mock",
        languageHintMode: "prompt_language",
      },
      scorerConfigIds: input.scorerConfigIds ?? ["scorer_transcript_core"],
      frozenDatasetJson: dataset
        ? { ...dataset, recordingIds: [...dataset.recordingIds] }
        : { recipeId: input.recipeId, recordingIds: selectedRecordings.map((recording) => recording.id) },
      frozenScorersJson: { scorers },
      createdAt: nowIso(),
    });
  }
  return run;
}

export function deleteEvaluationRun(runId: string) {
  const data = getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const resultIds = new Set(data.sttResults.filter((result) => result.evaluationRunId === runId).map((result) => result.id));
  data.metrics = data.metrics.filter((metric) => !resultIds.has(metric.sttResultId));
  data.sttResults = data.sttResults.filter((result) => result.evaluationRunId !== runId);
  data.evaluationRunModels = data.evaluationRunModels.filter((link) => link.evaluationRunId !== runId);
  data.evaluationRuns = data.evaluationRuns.filter((candidate) => candidate.id !== runId);
  data.recipes
    .filter((recipe) => recipe.sourceEvaluationRunId === runId)
    .forEach((recipe) => {
      recipe.sourceEvaluationRunId = undefined;
      recipe.followUpNotes = recipe.followUpNotes
        ? `${recipe.followUpNotes} Source evaluation run was deleted.`
        : "Source evaluation run was deleted.";
      recipe.updatedAt = nowIso();
    });
  return run;
}

export function renameEvaluationRun(runId: string, name: string) {
  const data = getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  run.name = name;
  return run;
}

export function clearFailedEvaluationResults(runId: string) {
  const data = getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const failedIds = new Set(
    data.sttResults
      .filter((result) => result.evaluationRunId === runId && result.status === "failed")
      .map((result) => result.id),
  );
  if (failedIds.size === 0) return { run, clearedCount: 0 };

  data.metrics = data.metrics.filter((metric) => !failedIds.has(metric.sttResultId));
  data.sttResults = data.sttResults.filter((result) => !failedIds.has(result.id));
  run.completedRecordings = data.sttResults.filter(
    (result) => result.evaluationRunId === run.id && result.status === "completed",
  ).length;
  run.failedRecordings = 0;
  run.status = "running";
  run.completedAt = undefined;
  return { run, clearedCount: failedIds.size };
}

export function updateEvaluationProgress(runId: string) {
  const data = getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const results = data.sttResults.filter((result) => result.evaluationRunId === run.id);
  run.completedRecordings = results.filter((result) => result.status === "completed").length;
  run.failedRecordings = results.filter((result) => result.status === "failed").length;
  const terminal = run.completedRecordings + run.failedRecordings;
  if (run.status === "running" && terminal >= run.totalRecordings) {
    run.status = "completed";
    run.completedAt = nowIso();
  }
  return run;
}

export function createSttResult(input: Omit<SttResult, "id" | "createdAt">) {
  const data = getData();
  const existing = data.sttResults.find(
    (result) =>
      result.evaluationRunId === input.evaluationRunId &&
      result.sttModelConfigId === input.sttModelConfigId &&
      result.recordingId === input.recordingId,
  );
  if (existing) return existing;
  const result: SttResult = {
    id: id("stt"),
    createdAt: nowIso(),
    ...input,
  };
  data.sttResults.push(result);
  return result;
}

export function createMetric(input: Omit<EvaluationMetric, "id">) {
  const data = getData();
  const existing = data.metrics.find((metric) => metric.sttResultId === input.sttResultId);
  if (existing) return existing;
  const metric: EvaluationMetric = { id: id("metric"), ...input };
  data.metrics.push(metric);
  return metric;
}

function groupCounts<T>(items: T[], label: (item: T) => string | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = label(item) ?? "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value }));
}

export function getDashboardStats(): DashboardStats {
  const data = getData();
  const submitted = data.recordings.filter((recording) => !recording.deletedAt);
  const accepted = submitted.filter((recording) => recording.reviewStatus === "accepted");
  const rejected = submitted.filter((recording) => recording.reviewStatus === "rejected");
  const pending = submitted.filter((recording) => recording.reviewStatus === "pending");
  const completedSessions = data.sessions.filter((session) => session.status === "completed");
  const sessionCounts = new Map<string, number>();
  submitted.forEach((recording) => sessionCounts.set(recording.sessionId, (sessionCounts.get(recording.sessionId) ?? 0) + 1));

  return {
    totalContributors: data.contributors.length,
    startedSessions: data.sessions.length,
    completedSessions: completedSessions.length,
    submittedRecordings: submitted.length,
    acceptedRecordings: accepted.length,
    rejectedRecordings: rejected.length,
    pendingReviewRecordings: pending.length,
    usableRecordingRate: submitted.length ? accepted.length / submitted.length : 0,
    averageRecordingsPerCompletedSession: completedSessions.length
      ? completedSessions.reduce((sum, session) => sum + (sessionCounts.get(session.id) ?? 0), 0) / completedSessions.length
      : 0,
    byLanguage: groupCounts(submitted, (recording) => data.prompts.find((prompt) => prompt.id === recording.promptId)?.language),
    byEnvironment: groupCounts(submitted, (recording) => data.sessions.find((session) => session.id === recording.sessionId)?.environmentType),
    byVariant: groupCounts(submitted, (recording) => data.prompts.find((prompt) => prompt.id === recording.promptId)?.commandVariant),
    byTaskType: groupCounts(submitted, (recording) => data.prompts.find((prompt) => prompt.id === recording.promptId)?.taskType),
    dailyVolume: groupCounts(submitted, (recording) => recording.submittedAt.slice(0, 10)).map(({ name, value }) => ({
      date: name,
      submitted: value,
    })),
  };
}

export function createRecipe(input: {
  name: string;
  slug: string;
  description: string;
  contributorInstructions: string;
  promptsPerSession: number;
  targetAcceptedRecordings: number;
}) {
  const data = getData();
  if (data.recipes.some((recipe) => recipe.slug === input.slug)) throw new Error("Recipe slug already exists.");
  const recipe: CollectionRecipe = {
    id: id("recipe"),
    name: input.name,
    slug: input.slug,
    version: 1,
    status: "draft",
    description: input.description,
    contributorInstructions: input.contributorInstructions,
    internalObjective: "Draft recipe created from the admin UI.",
    consentVersion: CONSENT_VERSION,
    targetAcceptedRecordings: input.targetAcceptedRecordings,
    promptsPerSession: input.promptsPerSession,
    supportedLanguages: ["English", "Japanese", "English-Japanese"],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  data.recipes.push(recipe);
  return recipe;
}

export function updateRecipe(input: {
  recipeId: string;
  name?: string;
  description?: string;
  contributorInstructions?: string;
  targetAcceptedRecordings?: number;
  promptsPerSession?: number;
  followUpNotes?: string;
}) {
  const data = getData();
  const recipe = data.recipes.find((candidate) => candidate.id === input.recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  if (input.name !== undefined) recipe.name = input.name;
  if (input.description !== undefined) recipe.description = input.description;
  if (input.contributorInstructions !== undefined) recipe.contributorInstructions = input.contributorInstructions;
  if (input.targetAcceptedRecordings !== undefined) recipe.targetAcceptedRecordings = input.targetAcceptedRecordings;
  if (input.promptsPerSession !== undefined) recipe.promptsPerSession = input.promptsPerSession;
  if (input.followUpNotes !== undefined) recipe.followUpNotes = input.followUpNotes;
  recipe.updatedAt = nowIso();
  return recipe;
}

export function cloneRecipe(recipeId: string, options?: { sourceEvaluationRunId?: string; followUpNotes?: string }) {
  const data = getData();
  const source = data.recipes.find((recipe) => recipe.id === recipeId);
  if (!source) throw new Error("Source recipe not found.");
  const clone: CollectionRecipe = {
    ...source,
    id: id("recipe"),
    name: `${source.name} follow-up`,
    slug: `${source.slug}-follow-up-${Date.now().toString(36)}`,
    version: source.version + 1,
    status: "draft",
    sourceRecipeId: source.id,
    sourceEvaluationRunId: options?.sourceEvaluationRunId,
    followUpNotes: options?.followUpNotes,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    activatedAt: undefined,
  };
  data.recipes.push(clone);
  const sourcePrompts = data.prompts.filter((prompt) => prompt.recipeId === source.id);
  sourcePrompts.forEach((prompt) => {
    data.prompts.push({
      ...prompt,
      id: id("prompt"),
      recipeId: clone.id,
      createdAt: nowIso(),
    });
  });
  return clone;
}

export function activateRecipe(recipeId: string) {
  const data = getData();
  const recipe = data.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  recipe.status = "active";
  recipe.activatedAt = nowIso();
  recipe.updatedAt = nowIso();
  return recipe;
}

export function archiveRecipe(recipeId: string) {
  const recipe = getData().recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  recipe.status = "archived";
  recipe.updatedAt = nowIso();
  return recipe;
}

export function addPromptToRecipe(input: {
  recipeId: string;
  promptMode: CommandPrompt["promptMode"];
  displayInstruction: string;
  exactText?: string;
  language: CommandPrompt["language"];
  taskType: CommandPrompt["taskType"];
  commandVariant: CommandPrompt["commandVariant"];
  targetIntent: string;
  slotsJson?: Record<string, unknown>;
  safetySensitive?: boolean;
  difficulty?: CommandPrompt["difficulty"];
  tags?: string[];
}) {
  const data = getData();
  const recipe = data.recipes.find((candidate) => candidate.id === input.recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  const collectedCount = data.recordings.filter((recording) => recording.recipeId === recipe.id).length;
  if (collectedCount > 0 && recipe.status !== "draft") {
    throw new Error("Recipes with collected data must be cloned before material prompt changes.");
  }
  const maxOrder = Math.max(0, ...data.prompts.filter((prompt) => prompt.recipeId === recipe.id).map((prompt) => prompt.displayOrder));
  const prompt: CommandPrompt = {
    id: id("prompt"),
    recipeId: recipe.id,
    promptMode: input.promptMode,
    displayInstruction: input.displayInstruction,
    exactText: input.exactText,
    language: input.language,
    taskType: input.taskType,
    commandVariant: input.commandVariant,
    targetIntent: input.targetIntent,
    slotsJson: input.slotsJson ?? {},
    safetySensitive:
      input.safetySensitive ?? (input.commandVariant === "Safety-sensitive" || input.taskType === "Safety intervention"),
    difficulty: input.difficulty ?? 2,
    tags: input.tags ?? [],
    displayOrder: maxOrder + 1,
    isActive: true,
    createdAt: nowIso(),
  };
  data.prompts.push(prompt);
  return prompt;
}

export function updatePrompt(input: {
  promptId: string;
  promptMode: CommandPrompt["promptMode"];
  displayInstruction: string;
  exactText?: string;
  language: CommandPrompt["language"];
  taskType: CommandPrompt["taskType"];
  commandVariant: CommandPrompt["commandVariant"];
  targetIntent: string;
}) {
  const data = getData();
  const prompt = data.prompts.find((candidate) => candidate.id === input.promptId);
  if (!prompt) throw new Error("Prompt not found.");
  const recipe = data.recipes.find((candidate) => candidate.id === prompt.recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  const collectedCount = data.recordings.filter((recording) => recording.recipeId === recipe.id).length;
  if (collectedCount > 0 && recipe.status !== "draft") {
    throw new Error("Recipes with collected data must be cloned before material prompt changes.");
  }

  prompt.promptMode = input.promptMode;
  prompt.displayInstruction = input.displayInstruction;
  prompt.exactText = input.exactText || undefined;
  prompt.language = input.language;
  prompt.taskType = input.taskType;
  prompt.commandVariant = input.commandVariant;
  prompt.targetIntent = input.targetIntent;
  prompt.safetySensitive = input.commandVariant === "Safety-sensitive" || input.taskType === "Safety intervention";
  recipe.updatedAt = nowIso();
  return prompt;
}

export function createFollowUpRecipeFromSlices(
  runId: string,
  sliceKeys: string[],
  options?: {
    name?: string;
    targetAcceptedRecordings?: number;
    promptsPerSession?: number;
    contributorInstructions?: string;
    followUpNotes?: string;
  },
) {
  const data = getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const notes =
    options?.followUpNotes ||
    `Created from evaluation ${run.name}. Selected next-collection priorities: ${sliceKeys.join(", ")}. More data is needed because these slices combine failure rate, severity, and coverage gaps.`;
  const draft = cloneRecipe(run.recipeId, { sourceEvaluationRunId: run.id, followUpNotes: notes });
  if (options?.name) draft.name = options.name;
  if (options?.contributorInstructions) draft.contributorInstructions = options.contributorInstructions;
  draft.promptsPerSession = options?.promptsPerSession ?? draft.promptsPerSession;
  draft.targetAcceptedRecordings = options?.targetAcceptedRecordings ?? Math.max(60, sliceKeys.length * 30);
  draft.updatedAt = nowIso();
  return draft;
}

export function exportAcceptedRows() {
  const data = getData();
  return acceptedRecordingsForEvaluation().map((recording) => {
    const prompt = data.prompts.find((candidate) => candidate.id === recording.promptId);
    const recipe = data.recipes.find((candidate) => candidate.id === recording.recipeId);
    const session = data.sessions.find((candidate) => candidate.id === recording.sessionId);
    const review = data.reviews.find((candidate) => candidate.recordingId === recording.id);
    const codeSwitchLevel = prompt?.slotsJson.codeSwitchLevel ?? prompt?.slotsJson.code_switch_level;
    return {
      recordingId: recording.id,
      recipeName: recipe?.name ?? "",
      recipeVersion: recipe?.version ?? "",
      promptId: prompt?.id ?? "",
      promptMode: prompt?.promptMode ?? "",
      displayInstruction: prompt?.displayInstruction ?? "",
      exactPromptText: prompt?.exactText ?? "",
      reviewedTranscript: review?.reviewedTranscript ?? "",
      contributorTranscript: recording.contributorTranscript,
      language: prompt?.language ?? "",
      taskType: prompt?.taskType ?? "",
      commandVariant: prompt?.commandVariant ?? "",
      codeSwitchLevel: typeof codeSwitchLevel === "string" ? codeSwitchLevel : "",
      promptTags: prompt?.tags.join("|") ?? "",
      targetIntent: prompt?.targetIntent ?? "",
      structuredSlots: JSON.stringify(prompt?.slotsJson ?? {}),
      annotatedIntent: review?.semanticAnnotation?.intent ?? prompt?.targetIntent ?? "",
      annotatedSlots: JSON.stringify(review?.semanticAnnotation?.slotsJson ?? prompt?.slotsJson ?? {}),
      requiresClarification: review?.semanticAnnotation?.requiresClarification ?? "",
      semanticUrgency: review?.semanticAnnotation?.urgency ?? "",
      semanticSafetySensitive: review?.semanticAnnotation?.safetySensitive ?? prompt?.safetySensitive ?? "",
      environment: session?.environmentType ?? "",
      backgroundNoise: session?.backgroundNoise ?? "",
      microphoneDistance: session?.microphoneDistance ?? "",
      deviceCategory: session?.deviceCategory ?? "",
      durationMs: recording.durationMs,
      mimeType: recording.mimeType,
      qualityLabels: review?.qualityFlags.join("|") ?? "",
      audioQualityScore: review?.audioQualityScore ?? "",
      consentVersion: recipe?.consentVersion ?? "",
      submittedAt: recording.submittedAt,
      temporaryAudioEndpoint: `/api/audio/${recording.id}`,
    };
  });
}

export function withdrawContributor(contributorId: string) {
  const data = getData();
  const contributor = data.contributors.find((candidate) => candidate.id === contributorId);
  if (!contributor) throw new Error("Contributor not found.");
  contributor.withdrawnAt = nowIso();
  data.recordings
    .filter((recording) => recording.contributorId === contributorId)
    .forEach((recording) => {
      recording.deletedAt = recording.deletedAt ?? nowIso();
      recording.reviewStatus = "removed";
      data.audioObjects.delete(recording.id);
    });
  return contributor;
}

export function removeRecording(recordingId: string) {
  const data = getData();
  const recording = data.recordings.find((candidate) => candidate.id === recordingId);
  if (!recording) throw new Error("Recording not found.");
  recording.deletedAt = nowIso();
  recording.reviewStatus = "removed";
  data.audioObjects.delete(recording.id);
  return recording;
}

export function cleanupAbandonedUploads() {
  const data = getData();
  const knownRecordingIds = new Set(data.recordings.filter((recording) => !recording.deletedAt).map((recording) => recording.id));
  let removed = 0;
  for (const recordingId of data.audioObjects.keys()) {
    if (!knownRecordingIds.has(recordingId)) {
      data.audioObjects.delete(recordingId);
      removed += 1;
    }
  }
  return removed;
}
