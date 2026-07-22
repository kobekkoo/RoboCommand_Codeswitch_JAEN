export const CONSENT_VERSION = "prototype-consent-2026-07";

export const promptModes = [
  "read_exactly",
  "natural_paraphrase",
  "scenario_freeform",
  "self_correction",
  "ambiguous_reference",
  "code_switching",
  "multi_step",
  "safety_intervention",
] as const;

export const taskTypes = [
  "Pick up",
  "Place",
  "Hand over",
  "Open",
  "Close",
  "Move",
  "Navigate",
  "Search or locate",
  "Pour",
  "Clean or wipe",
  "Stop or pause",
  "Multi-step manipulation",
  "Clarification request",
  "Safety intervention",
] as const;

export const commandVariants = [
  "Canonical",
  "Polite",
  "Casual",
  "Indirect",
  "Ambiguous",
  "Self-corrected",
  "Repeated",
  "Hesitant",
  "Interrupted",
  "Code-switched",
  "Multi-step",
  "Safety-sensitive",
  "Out-of-scope",
  "Negative command",
] as const;

export const languages = ["English", "Japanese", "English-Japanese"] as const;

export const environmentTypes = [
  "Indoor, quiet",
  "Indoor, moderate background noise",
  "Indoor, loud",
  "Outdoor, quiet",
  "Outdoor, traffic",
  "Outdoor, crowd or conversation",
  "Other",
] as const;

export const microphoneDistances = [
  "Near: under 30 cm",
  "Medium: 30-100 cm",
  "Far: over 100 cm",
] as const;

export const qualityLabels = [
  "Acceptable",
  "Silence or nearly silent",
  "Clipped or distorted",
  "Excessive background noise",
  "Wrong command",
  "Incomplete command",
  "Multiple speakers",
  "Contains private information",
  "Transcript mismatch",
  "Duplicate",
  "Other",
] as const;

export const inputValidityLabels = [
  "valid_command",
  "silence",
  "background_noise",
  "music",
  "unintelligible",
  "unrelated_speech",
] as const;

export type PromptMode = (typeof promptModes)[number];
export type TaskType = (typeof taskTypes)[number];
export type CommandVariant = (typeof commandVariants)[number];
export type CommandLanguage = (typeof languages)[number];
export type EnvironmentType = (typeof environmentTypes)[number];
export type MicrophoneDistance = (typeof microphoneDistances)[number];
export type QualityLabel = (typeof qualityLabels)[number];
export type InputValidity = (typeof inputValidityLabels)[number];

export type RecipeStatus = "draft" | "active" | "paused" | "archived";
export type SessionStatus = "setup" | "in_progress" | "completed" | "abandoned";
export type AssignmentStatus = "assigned" | "submitted" | "skipped";
export type ReviewStatus = "pending" | "accepted" | "rejected" | "removed";
export type EvaluationStatus = "draft" | "running" | "paused" | "completed" | "cancelled" | "failed";
export type SttResultStatus = "pending" | "completed" | "failed";

export type Contributor = {
  id: string;
  publicCode: string;
  primaryLanguage?: string;
  additionalLanguages?: string;
  accentRegion?: string;
  ageBand?: string;
  voiceAssistantFamiliarity?: "none" | "occasional" | "frequent" | "prefer_not_to_say";
  defaultDeviceCategory?: "phone" | "laptop" | "tablet" | "desktop" | "prefer_not_to_say";
  headphonesOrExternalMic?: "yes" | "no" | "prefer_not_to_say";
  consentVersion?: string;
  consentedAt?: string;
  createdAt: string;
  withdrawnAt?: string;
};

export type CollectionRecipe = {
  id: string;
  name: string;
  slug: string;
  version: number;
  status: RecipeStatus;
  description: string;
  contributorInstructions: string;
  internalObjective: string;
  consentVersion: string;
  targetAcceptedRecordings: number;
  promptsPerSession: number;
  supportedLanguages: CommandLanguage[];
  sourceRecipeId?: string;
  sourceEvaluationRunId?: string;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  followUpNotes?: string;
};

export type RecipeQuota = {
  id: string;
  recipeId: string;
  dimension: string;
  dimensionValue: string;
  targetCount: number;
};

export type CommandPrompt = {
  id: string;
  recipeId: string;
  promptMode: PromptMode;
  displayInstruction: string;
  exactText?: string;
  language: CommandLanguage;
  taskType: TaskType;
  commandVariant: CommandVariant;
  targetIntent: string;
  slotsJson: Record<string, unknown>;
  safetySensitive: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
};

export type RecordingSession = {
  id: string;
  contributorId: string;
  recipeId: string;
  status: SessionStatus;
  environmentType: EnvironmentType;
  backgroundNoise?: string;
  microphoneDistance: MicrophoneDistance;
  deviceCategory?: string;
  deviceMetadataJson: Record<string, unknown>;
  expectedInterruptions: boolean;
  startedAt: string;
  completedAt?: string;
  completionCode: string;
};

export type PromptAssignment = {
  id: string;
  sessionId: string;
  promptId: string;
  assignmentOrder: number;
  status: AssignmentStatus;
  skipReason?: string;
  createdAt: string;
};

export type Recording = {
  id: string;
  sessionId: string;
  assignmentId: string;
  contributorId: string;
  recipeId: string;
  promptId: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  durationMs: number;
  audioSampleRateHz?: number;
  channelCount?: number;
  clientRms?: number;
  clientPeak?: number;
  silenceWarning: boolean;
  clippingWarning: boolean;
  inputValidity: InputValidity;
  contributorTranscript: string;
  uploadStatus: "uploaded" | "failed";
  reviewStatus: ReviewStatus;
  submittedAt: string;
  deletedAt?: string;
};

export type QualityReview = {
  id: string;
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
  reviewedAt: string;
};

export type SttProviderId = "mock" | "openai" | "gemini" | "elevenlabs" | "deepgram";
export type LinguisticDiversityCategory = "code_switching" | "short_utterance" | "incomplete_audio" | "general";

export type CommandSemanticAnnotation = {
  intent: string;
  slotsJson: Record<string, unknown>;
  urgency: "normal" | "urgent" | "safety_critical";
  requiresClarification: boolean;
  safetySensitive: boolean;
};

export type SttModelConfig = {
  id: string;
  provider: SttProviderId;
  displayName: string;
  modelIdentifier: string;
  configurationJson: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: string;
};

export type EvaluationRun = {
  id: string;
  recipeId: string;
  name: string;
  status: EvaluationStatus;
  selectionFiltersJson: Record<string, unknown>;
  normalizationProfileJson: NormalizationProfile;
  selectedRecordingIds: string[];
  totalRecordings: number;
  completedRecordings: number;
  failedRecordings: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type EvaluationRunModel = {
  id: string;
  evaluationRunId: string;
  sttModelConfigId: string;
};

export type SttResult = {
  id: string;
  evaluationRunId: string;
  sttModelConfigId: string;
  recordingId: string;
  status: SttResultStatus;
  hypothesis?: string;
  detectedLanguage?: string;
  latencyMs?: number;
  providerResponseJson?: unknown;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
};

export type EvaluationMetric = {
  id: string;
  sttResultId: string;
  referenceNormalized: string;
  hypothesisNormalized: string;
  wordErrorRate: number;
  characterErrorRate: number;
  exactMatch: boolean;
  insertions: number;
  deletions: number;
  substitutions: number;
  referenceWordCount: number;
  referenceCharacterCount: number;
  mixedErrorRate?: number;
  overgenerationRate?: number;
  semanticRiskFlags?: string[];
  linguisticCategory?: LinguisticDiversityCategory;
  scorerScoresJson?: Record<string, number>;
  scorerRationale?: string;
};

export type EvalDataset = {
  id: string;
  name: string;
  description?: string;
  recipeId?: string;
  selectionFiltersJson: Record<string, unknown>;
  recordingIds: string[];
  rowsJson?: EvalDatasetRow[];
  tags: string[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
};

export type EvalDatasetRow = {
  id: string;
  source: "recording" | "import" | "manual";
  sourceRecordingId?: string;
  inputText: string;
  audioStoragePath?: string;
  audioUrl?: string;
  humanTranscript: string;
  expectedText?: string;
  tags: string[];
  metadataJson: Record<string, unknown>;
  rowOrder: number;
};

export type EvalTaskConfig = {
  id: string;
  name: string;
  modelConfigIds: string[];
  languageHintMode: "prompt_language" | "auto";
  promptHintMode: "none" | "reference_for_mock";
  taskConfigJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ScorerType = "deterministic" | "llm_judge" | "human_review";

export type ScorerConfig = {
  id: string;
  name: string;
  slug?: string;
  scorerType: ScorerType;
  description: string;
  metricKeys: string[];
  rubricText?: string;
  judgeModel?: string;
  thresholdsJson: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlaygroundResult = {
  id: string;
  rowId?: string;
  recordingId: string;
  inputText?: string;
  instruction?: string;
  humanTranscript?: string;
  expectedText?: string;
  tags?: string[];
  metadataJson?: Record<string, unknown>;
  modelConfigId: string;
  modelName: string;
  status: SttResultStatus;
  traceStatus?: "queued" | "transcribing" | "scoring" | "completed" | "failed";
  hypothesis?: string;
  latencyMs?: number;
  detectedLanguage?: string;
  errorMessage?: string;
  scores: Record<string, number>;
  scorerOutputs?: PlaygroundScorerOutput[];
  rationale: string;
};

export type PlaygroundScorerOutput = {
  scorerId: string;
  scorerName: string;
  scorerType: ScorerType;
  metricKeys: string[];
  scores: Record<string, number>;
  passThreshold?: number;
  passed?: boolean;
  rationale: string;
};

export type PlaygroundSession = {
  id: string;
  name?: string;
  evalDatasetId?: string;
  status?: "queued" | "running" | "completed" | "failed" | "cancelled";
  progressPct?: number;
  currentStep?: string;
  sampleRecordingIds: string[];
  modelConfigIds: string[];
  scorerConfigIds: string[];
  taskConfigJson: Record<string, unknown>;
  resultsJson: PlaygroundResult[];
  promotedEvaluationRunId?: string;
  createdAt: string;
};

export type ExperimentSnapshot = {
  id: string;
  evaluationRunId: string;
  evalDatasetId?: string;
  taskConfigJson: Record<string, unknown>;
  scorerConfigIds: string[];
  frozenDatasetJson: Record<string, unknown>;
  frozenScorersJson: Record<string, unknown>;
  costEstimateUsd?: number;
  createdAt: string;
};

export type NormalizationProfile = {
  nfkc: boolean;
  lowercaseLatin: boolean;
  collapseWhitespace: boolean;
  normalizePunctuation: boolean;
  ignoreSpacesForCer: boolean;
};

export const defaultNormalizationProfile: NormalizationProfile = {
  nfkc: true,
  lowercaseLatin: true,
  collapseWhitespace: true,
  normalizePunctuation: true,
  ignoreSpacesForCer: true,
};

export type SessionView = {
  session: RecordingSession;
  recipe: CollectionRecipe;
  assignments: Array<PromptAssignment & { prompt: CommandPrompt; recording?: Recording }>;
};

export type DashboardStats = {
  totalContributors: number;
  startedSessions: number;
  completedSessions: number;
  submittedRecordings: number;
  acceptedRecordings: number;
  rejectedRecordings: number;
  pendingReviewRecordings: number;
  usableRecordingRate: number;
  averageRecordingsPerCompletedSession: number;
  byLanguage: Array<{ name: string; value: number }>;
  byEnvironment: Array<{ name: string; value: number }>;
  byVariant: Array<{ name: string; value: number }>;
  byTaskType: Array<{ name: string; value: number }>;
  dailyVolume: Array<{ date: string; submitted: number }>;
};
