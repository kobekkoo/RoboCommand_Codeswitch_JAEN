import { Buffer } from "node:buffer";
import { AUDIO_BUCKET } from "@/lib/constants";
import {
  CONSENT_VERSION,
  defaultNormalizationProfile,
  type CollectionRecipe,
  type CommandPrompt,
  type CommandSemanticAnnotation,
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
import { audioExtensionForMime, baseAudioMimeType } from "@/lib/audio/validation";
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
import { selectPromptAssignments, type CommandLoopData, type DemoAudioObject } from "@/lib/data/store";
import { packReviewNotes, unpackReviewNotes } from "@/lib/data/review-notes";
import { packRecipeObjective, unpackRecipeObjective } from "@/lib/data/recipe-notes";
import { getEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
// Supabase returns untyped rows here; mapper functions below narrow each field into domain types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

let seedPromise: Promise<void> | undefined;
const importedRowsKey = "__commandLoopDatasetRows";

function nowIso() {
  return new Date().toISOString();
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function nil<T>(value: T | null | undefined) {
  return value ?? undefined;
}

function present<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function completionCode() {
  return `CL-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function publicCode() {
  return `P-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isUuid(value: string | undefined) {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

function throwIfError<T>(data: T, error: { message: string } | null, message: string) {
  if (error) throw new Error(`${message}: ${error.message}`);
  return data;
}

function missingSchemaColumn(message: string) {
  return message.match(/'([^']+)' column/)?.[1];
}

const optionalMetricColumns = new Set([
  "mixed_error_rate",
  "overgeneration_rate",
  "semantic_risk_flags",
  "linguistic_category",
  "scorer_scores_json",
  "scorer_rationale",
]);

function rowsOrEmpty<T>(data: T[] | null, error: { message: string } | null, message: string, optional = false) {
  if (optional && error?.message.includes("Could not find the table")) return [];
  return throwIfError(data, error, message) ?? [];
}

async function client() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  await ensureSeedData(supabase);
  return supabase;
}

async function ensureSeedData(supabase: SupabaseClient) {
  seedPromise ??= seedSupabaseData(supabase);
  await seedPromise;
}

async function seedSupabaseData(supabase: SupabaseClient) {
  const recipesToSeed = [seedRecipe, hospitalNurseRecipe, robotCsHouseholdRecipe];
  const { data: recipeRows, error: recipeError } = await supabase
    .from("collection_recipes")
    .upsert(
      recipesToSeed.map((recipe) => ({
        name: recipe.name,
        slug: recipe.slug,
        version: recipe.version,
        status: recipe.status,
        description: recipe.description,
        contributor_instructions: recipe.contributorInstructions,
        internal_objective: recipe.internalObjective,
        consent_version: recipe.consentVersion,
        target_accepted_recordings: recipe.targetAcceptedRecordings,
        prompts_per_session: recipe.promptsPerSession,
        supported_languages: recipe.supportedLanguages,
        activated_at: recipe.activatedAt ?? null,
      })),
      { onConflict: "slug" },
    )
    .select("*");
  throwIfError(recipeRows, recipeError, "Could not seed recipes");

  const recipeBySlug = new Map((recipeRows ?? []).map((row) => [row.slug, row.id]));
  const seedRecipeIdToSlug = new Map([
    [seedRecipe.id, seedRecipe.slug],
    [hospitalNurseRecipe.id, hospitalNurseRecipe.slug],
    [robotCsHouseholdRecipe.id, robotCsHouseholdRecipe.slug],
  ]);

  const prompts = [...seedPrompts, ...hospitalNursePrompts, ...robotCsHouseholdPrompts]
    .map((prompt) => {
      const slug = seedRecipeIdToSlug.get(prompt.recipeId);
      const recipeId = slug ? recipeBySlug.get(slug) : undefined;
      if (!recipeId) return undefined;
      return {
        recipe_id: recipeId,
        prompt_mode: prompt.promptMode,
        display_instruction: prompt.displayInstruction,
        exact_text: prompt.exactText ?? null,
        language: prompt.language,
        task_type: prompt.taskType,
        command_variant: prompt.commandVariant,
        target_intent: prompt.targetIntent,
        slots_json: prompt.slotsJson,
        safety_sensitive: prompt.safetySensitive,
        difficulty: prompt.difficulty,
        tags: prompt.tags,
        display_order: prompt.displayOrder,
        is_active: prompt.isActive,
      };
    })
    .filter(present);

  if (prompts.length) {
    const { error } = await supabase.from("command_prompts").upsert(prompts, {
      onConflict: "recipe_id,display_order",
    });
    throwIfError(null, error, "Could not seed prompts");
  }

  const quotas = seedQuotas
    .map((quota) => {
      const slug = seedRecipeIdToSlug.get(quota.recipeId);
      const recipeId = slug ? recipeBySlug.get(slug) : undefined;
      if (!recipeId) return undefined;
      return {
        recipe_id: recipeId,
        dimension: quota.dimension,
        dimension_value: quota.dimensionValue,
        target_count: quota.targetCount,
      };
    })
    .filter(present);

  if (quotas.length) {
    const { error } = await supabase.from("recipe_quotas").upsert(quotas, {
      onConflict: "recipe_id,dimension,dimension_value",
    });
    throwIfError(null, error, "Could not seed recipe quotas");
  }

  const { error: modelError } = await supabase.from("stt_model_configs").upsert(
    seedModelConfigs.map((model) => ({
      provider: model.provider,
      display_name: model.displayName,
      model_identifier: model.modelIdentifier,
      configuration_json: model.configurationJson,
      is_enabled: model.isEnabled,
    })),
    { onConflict: "provider,model_identifier" },
  );
  throwIfError(null, modelError, "Could not seed STT model configs");

  const { error: scorerError } = await supabase.from("scorer_configs").upsert(
    seedScorerConfigs.map((scorer) => ({
      name: scorer.name,
      scorer_type: scorer.scorerType,
      description: scorer.description,
      metric_keys: scorer.metricKeys,
      rubric_text: scorer.rubricText ?? null,
      judge_model: scorer.judgeModel ?? null,
      thresholds_json: scorer.thresholdsJson,
      is_enabled: scorer.isEnabled,
    })),
    { onConflict: "name" },
  );
  if (scorerError && !scorerError.message.includes("Could not find the table")) {
    throwIfError(null, scorerError, "Could not seed scorer configs");
  }
}

function mapContributor(row: Row): Contributor {
  return {
    id: row.id,
    publicCode: row.public_code,
    primaryLanguage: nil(row.primary_language),
    additionalLanguages: nil(row.additional_languages),
    accentRegion: nil(row.accent_region),
    ageBand: nil(row.age_band),
    voiceAssistantFamiliarity: nil(row.voice_assistant_familiarity),
    defaultDeviceCategory: nil(row.default_device_category),
    consentVersion: nil(row.consent_version),
    consentedAt: nil(row.consented_at),
    createdAt: row.created_at,
    withdrawnAt: nil(row.withdrawn_at),
  };
}

function mapRecipe(row: Row): CollectionRecipe {
  const objective = unpackRecipeObjective(row.internal_objective);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    version: row.version,
    status: row.status,
    description: row.description,
    contributorInstructions: row.contributor_instructions,
    internalObjective: objective.internalObjective,
    consentVersion: row.consent_version,
    targetAcceptedRecordings: row.target_accepted_recordings,
    promptsPerSession: row.prompts_per_session,
    supportedLanguages: row.supported_languages ?? [],
    sourceRecipeId: nil(row.source_recipe_id),
    sourceEvaluationRunId: nil(row.source_evaluation_run_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activatedAt: nil(row.activated_at),
    followUpNotes: nil(row.follow_up_notes) ?? objective.followUpNotes,
  };
}

function mapQuota(row: Row): RecipeQuota {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    dimension: row.dimension,
    dimensionValue: row.dimension_value,
    targetCount: row.target_count,
  };
}

function mapPrompt(row: Row): CommandPrompt {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    promptMode: row.prompt_mode,
    displayInstruction: row.display_instruction,
    exactText: nil(row.exact_text),
    language: row.language,
    taskType: row.task_type,
    commandVariant: row.command_variant,
    targetIntent: row.target_intent,
    slotsJson: row.slots_json ?? {},
    safetySensitive: row.safety_sensitive,
    difficulty: row.difficulty,
    tags: row.tags ?? [],
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function mapSession(row: Row): RecordingSession {
  return {
    id: row.id,
    contributorId: row.contributor_id,
    recipeId: row.recipe_id,
    status: row.status,
    environmentType: row.environment_type,
    backgroundNoise: nil(row.background_noise),
    microphoneDistance: row.microphone_distance,
    deviceCategory: nil(row.device_category),
    deviceMetadataJson: row.device_metadata_json ?? {},
    expectedInterruptions: row.expected_interruptions,
    startedAt: row.started_at,
    completedAt: nil(row.completed_at),
    completionCode: row.completion_code,
  };
}

function mapAssignment(row: Row): PromptAssignment {
  return {
    id: row.id,
    sessionId: row.session_id,
    promptId: row.prompt_id,
    assignmentOrder: row.assignment_order,
    status: row.status,
    skipReason: nil(row.skip_reason),
    createdAt: row.created_at,
  };
}

function mapRecording(row: Row): Recording {
  return {
    id: row.id,
    sessionId: row.session_id,
    assignmentId: row.assignment_id,
    contributorId: row.contributor_id,
    recipeId: row.recipe_id,
    promptId: row.prompt_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    durationMs: row.duration_ms,
    audioSampleRateHz: nil(row.audio_sample_rate_hz),
    channelCount: nil(row.channel_count),
    clientRms: row.client_rms === null || row.client_rms === undefined ? undefined : Number(row.client_rms),
    clientPeak: row.client_peak === null || row.client_peak === undefined ? undefined : Number(row.client_peak),
    silenceWarning: row.silence_warning,
    clippingWarning: row.clipping_warning,
    inputValidity: row.input_validity ?? "valid_command",
    contributorTranscript: row.contributor_transcript,
    uploadStatus: row.upload_status,
    reviewStatus: row.review_status,
    submittedAt: row.submitted_at,
    deletedAt: nil(row.deleted_at),
  };
}

function mapReview(row: Row): QualityReview {
  const notes = unpackReviewNotes(row.reviewer_notes);
  return {
    id: row.id,
    recordingId: row.recording_id,
    reviewedTranscript: row.reviewed_transcript,
    decision: row.decision,
    qualityFlags: row.quality_flags ?? [],
    rejectionReason: nil(row.rejection_reason),
    audioQualityScore: row.audio_quality_score,
    commandComplianceScore: row.command_compliance_score,
    transcriptConfidenceScore: row.transcript_confidence_score,
    reviewerNotes: notes.reviewerNotes,
    semanticAnnotation: notes.semanticAnnotation,
    reviewedAt: row.reviewed_at,
  };
}

function mapModel(row: Row): SttModelConfig {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.display_name,
    modelIdentifier: row.model_identifier,
    configurationJson: row.configuration_json ?? {},
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
  };
}

function mapRun(row: Row, selectedRecordingIds: string[]): EvaluationRun {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    name: row.name,
    status: row.status,
    selectionFiltersJson: row.selection_filters_json ?? {},
    normalizationProfileJson: row.normalization_profile_json ?? defaultNormalizationProfile,
    selectedRecordingIds,
    totalRecordings: row.total_recordings,
    completedRecordings: row.completed_recordings,
    failedRecordings: row.failed_recordings,
    createdAt: row.created_at,
    startedAt: nil(row.started_at),
    completedAt: nil(row.completed_at),
  };
}

function mapRunModel(row: Row): EvaluationRunModel {
  return {
    id: row.id,
    evaluationRunId: row.evaluation_run_id,
    sttModelConfigId: row.stt_model_config_id,
  };
}

function mapSttResult(row: Row): SttResult {
  return {
    id: row.id,
    evaluationRunId: row.evaluation_run_id,
    sttModelConfigId: row.stt_model_config_id,
    recordingId: row.recording_id,
    status: row.status,
    hypothesis: nil(row.hypothesis),
    detectedLanguage: nil(row.detected_language),
    latencyMs: nil(row.latency_ms),
    providerResponseJson: nil(row.provider_response_json),
    errorMessage: nil(row.error_message),
    createdAt: row.created_at,
    completedAt: nil(row.completed_at),
  };
}

function mapMetric(row: Row): EvaluationMetric {
  return {
    id: row.id,
    sttResultId: row.stt_result_id,
    referenceNormalized: row.reference_normalized,
    hypothesisNormalized: row.hypothesis_normalized,
    wordErrorRate: Number(row.word_error_rate),
    characterErrorRate: Number(row.character_error_rate),
    exactMatch: row.exact_match,
    insertions: row.insertions,
    deletions: row.deletions,
    substitutions: row.substitutions,
    referenceWordCount: row.reference_word_count,
    referenceCharacterCount: row.reference_character_count,
    mixedErrorRate: row.mixed_error_rate === null || row.mixed_error_rate === undefined ? undefined : Number(row.mixed_error_rate),
    overgenerationRate:
      row.overgeneration_rate === null || row.overgeneration_rate === undefined ? undefined : Number(row.overgeneration_rate),
    semanticRiskFlags: nil(row.semantic_risk_flags),
    linguisticCategory: nil(row.linguistic_category),
    scorerScoresJson: row.scorer_scores_json ?? undefined,
    scorerRationale: nil(row.scorer_rationale),
  };
}

function mapEvalDataset(row: Row): EvalDataset {
  const rows = datasetRowsFromFilters(row.selection_filters_json);
  return {
    id: row.id,
    name: row.name,
    description: nil(row.description),
    recipeId: nil(row.recipe_id),
    selectionFiltersJson: row.selection_filters_json ?? {},
    recordingIds: row.recording_ids ?? [],
    rowsJson: rows.length ? rows : undefined,
    tags: row.tags ?? [],
    rowCount: row.row_count ?? (rows.length || row.recording_ids?.length) ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScorerConfig(row: Row): ScorerConfig {
  const thresholds = {
    ...(row.thresholds_json ?? {}),
    ...(row.output_type ? { outputType: row.output_type } : {}),
    ...(row.choice_scores_json ? { choiceScores: row.choice_scores_json } : {}),
    ...(row.pass_threshold === null || row.pass_threshold === undefined ? {} : { passThreshold: Number(row.pass_threshold) }),
    ...(row.include_rationale === undefined ? {} : { includeRationale: row.include_rationale }),
  };
  return {
    id: row.id,
    name: row.name,
    slug: nil(row.slug) ?? (typeof row.thresholds_json?.slug === "string" ? row.thresholds_json.slug : undefined),
    scorerType: row.scorer_type,
    description: row.description,
    metricKeys: row.metric_keys ?? [],
    rubricText: nil(row.rubric_text),
    judgeModel: nil(row.judge_model),
    thresholdsJson: thresholds,
    isEnabled: row.is_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlaygroundSession(row: Row): PlaygroundSession {
  return {
    id: row.id,
    name: nil(row.name),
    evalDatasetId: nil(row.eval_dataset_id),
    status: nil(row.status),
    progressPct: row.progress_pct === null || row.progress_pct === undefined ? undefined : Number(row.progress_pct),
    currentStep: nil(row.current_step),
    sampleRecordingIds: row.sample_recording_ids ?? [],
    modelConfigIds: row.model_config_ids ?? [],
    scorerConfigIds: row.scorer_config_ids ?? [],
    taskConfigJson: row.task_config_json ?? {},
    resultsJson: (row.results_json ?? []) as PlaygroundResult[],
    promotedEvaluationRunId: nil(row.promoted_evaluation_run_id),
    createdAt: row.created_at,
  };
}

function mapExperimentSnapshot(row: Row): ExperimentSnapshot {
  return {
    id: row.id,
    evaluationRunId: row.evaluation_run_id,
    evalDatasetId: nil(row.eval_dataset_id),
    taskConfigJson: row.task_config_json ?? {},
    scorerConfigIds: row.scorer_config_ids ?? [],
    frozenDatasetJson: row.frozen_dataset_json ?? {},
    frozenScorersJson: row.frozen_scorers_json ?? {},
    costEstimateUsd: row.cost_estimate_usd === null || row.cost_estimate_usd === undefined ? undefined : Number(row.cost_estimate_usd),
    createdAt: row.created_at,
  };
}

function datasetRowsFromFilters(filters: unknown): EvalDatasetRow[] {
  if (!filters || typeof filters !== "object") return [];
  const rows = (filters as Record<string, unknown>)[importedRowsKey];
  return Array.isArray(rows) ? rows.filter(isDatasetRow) : [];
}

function isDatasetRow(value: unknown): value is EvalDatasetRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<EvalDatasetRow>;
  return Boolean(row.id && row.inputText && row.humanTranscript && row.source);
}

function normalizeDatasetRows(rows: EvalDatasetRow[]) {
  return rows.map((row, index) => ({
    ...row,
    tags: row.tags ?? [],
    metadataJson: row.metadataJson ?? {},
    rowOrder: row.rowOrder ?? index,
  }));
}

export async function getData(): Promise<CommandLoopData> {
  const supabase = await client();
  const [
    contributors,
    recipes,
    quotas,
    prompts,
    sessions,
    assignments,
    recordings,
    reviews,
    models,
    runs,
    runRecordings,
    runModels,
    sttResults,
    metrics,
    evalDatasets,
    scorerConfigs,
    playgroundSessions,
    experimentSnapshots,
  ] = await Promise.all([
    supabase.from("contributors").select("*"),
    supabase.from("collection_recipes").select("*").order("created_at", { ascending: true }),
    supabase.from("recipe_quotas").select("*"),
    supabase.from("command_prompts").select("*").order("display_order", { ascending: true }),
    supabase.from("recording_sessions").select("*").order("started_at", { ascending: true }),
    supabase.from("prompt_assignments").select("*").order("assignment_order", { ascending: true }),
    supabase.from("recordings").select("*").order("submitted_at", { ascending: true }),
    supabase.from("quality_reviews").select("*").order("reviewed_at", { ascending: true }),
    supabase.from("stt_model_configs").select("*").order("created_at", { ascending: true }),
    supabase.from("evaluation_runs").select("*").order("created_at", { ascending: true }),
    supabase.from("evaluation_run_recordings").select("*"),
    supabase.from("evaluation_run_models").select("*"),
    supabase.from("stt_results").select("*").order("created_at", { ascending: true }),
    supabase.from("evaluation_metrics").select("*"),
    supabase.from("eval_datasets").select("*").order("created_at", { ascending: false }),
    supabase.from("scorer_configs").select("*").order("created_at", { ascending: true }),
    supabase.from("playground_sessions").select("*").order("created_at", { ascending: false }),
    supabase.from("experiment_snapshots").select("*").order("created_at", { ascending: false }),
  ]);

  const selectedByRun = new Map<string, string[]>();
  rowsOrEmpty(runRecordings.data, runRecordings.error, "Could not load evaluation run recordings", true).forEach((row) => {
    selectedByRun.set(row.evaluation_run_id, [...(selectedByRun.get(row.evaluation_run_id) ?? []), row.recording_id]);
  });

  return {
    contributors: rowsOrEmpty(contributors.data, contributors.error, "Could not load contributors").map(mapContributor),
    recipes: rowsOrEmpty(recipes.data, recipes.error, "Could not load recipes").map(mapRecipe),
    quotas: rowsOrEmpty(quotas.data, quotas.error, "Could not load quotas").map(mapQuota),
    prompts: rowsOrEmpty(prompts.data, prompts.error, "Could not load prompts").map(mapPrompt),
    sessions: rowsOrEmpty(sessions.data, sessions.error, "Could not load sessions").map(mapSession),
    assignments: rowsOrEmpty(assignments.data, assignments.error, "Could not load assignments").map(mapAssignment),
    recordings: rowsOrEmpty(recordings.data, recordings.error, "Could not load recordings").map(mapRecording),
    reviews: rowsOrEmpty(reviews.data, reviews.error, "Could not load reviews").map(mapReview),
    modelConfigs: rowsOrEmpty(models.data, models.error, "Could not load STT model configs", true).map(mapModel),
    evaluationRuns: rowsOrEmpty(runs.data, runs.error, "Could not load evaluation runs", true).map((row) =>
      mapRun(row, selectedByRun.get(row.id) ?? []),
    ),
    evaluationRunModels: rowsOrEmpty(runModels.data, runModels.error, "Could not load evaluation run models", true).map(mapRunModel),
    sttResults: rowsOrEmpty(sttResults.data, sttResults.error, "Could not load STT results", true).map(mapSttResult),
    metrics: rowsOrEmpty(metrics.data, metrics.error, "Could not load evaluation metrics", true).map(mapMetric),
    evalDatasets: rowsOrEmpty(evalDatasets.data, evalDatasets.error, "Could not load eval datasets", true).map(mapEvalDataset),
    scorerConfigs: rowsOrEmpty(scorerConfigs.data, scorerConfigs.error, "Could not load scorer configs", true).map(mapScorerConfig),
    playgroundSessions: rowsOrEmpty(playgroundSessions.data, playgroundSessions.error, "Could not load playground sessions", true).map(mapPlaygroundSession),
    experimentSnapshots: rowsOrEmpty(experimentSnapshots.data, experimentSnapshots.error, "Could not load experiment snapshots", true).map(mapExperimentSnapshot),
    audioObjects: new Map(),
  };
}

export async function publicSnapshot() {
  const data = await getData();
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

export async function getOrCreateContributor(existingContributorId?: string) {
  const supabase = await client();
  if (isUuid(existingContributorId)) {
    const { data, error } = await supabase.from("contributors").select("*").eq("id", existingContributorId).maybeSingle();
    throwIfError(data, error, "Could not load contributor");
    if (data) return mapContributor(data);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from("contributors")
      .insert({ public_code: publicCode() })
      .select("*")
      .single();
    if (!error) return mapContributor(data);
    if (!error.message.includes("duplicate key")) throw new Error(`Could not create contributor: ${error.message}`);
  }
  throw new Error("Could not create a unique contributor code.");
}

export async function recordContributorConsent(contributorId: string) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("contributors")
    .update({ consent_version: CONSENT_VERSION, consented_at: nowIso() })
    .eq("id", contributorId)
    .select("*")
    .single();
  return mapContributor(throwIfError(data, error, "Could not record consent"));
}

export async function updateContributorProfile(
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
  const supabase = await client();
  const { data, error } = await supabase
    .from("contributors")
    .update(
      compact({
        primary_language: profile.primaryLanguage,
        additional_languages: profile.additionalLanguages,
        accent_region: profile.accentRegion,
        age_band: profile.ageBand,
        voice_assistant_familiarity: profile.voiceAssistantFamiliarity,
        default_device_category: profile.defaultDeviceCategory,
      }),
    )
    .eq("id", contributorId)
    .select("*")
    .single();
  return mapContributor(throwIfError(data, error, "Could not update contributor profile"));
}

export async function getActiveRecipes() {
  const data = await getData();
  return data.recipes.filter((recipe) => recipe.status === "active");
}

export async function getRecipeBySlug(slug: string) {
  const data = await getData();
  return data.recipes.find((recipe) => recipe.slug === slug);
}

export async function getRecipeById(recipeId: string) {
  const data = await getData();
  return data.recipes.find((recipe) => recipe.id === recipeId);
}

export async function getPromptsForRecipe(recipeId: string) {
  const data = await getData();
  return data.prompts
    .filter((prompt) => prompt.recipeId === recipeId && prompt.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function createOrResumeSession(input: {
  contributorId: string;
  recipeSlug: string;
  environmentType: EnvironmentType;
  backgroundNoise?: string;
  microphoneDistance: MicrophoneDistance;
  deviceCategory?: string;
  deviceMetadataJson?: Record<string, unknown>;
  expectedInterruptions: boolean;
}) {
  const supabase = await client();
  const data = await getData();
  const recipe = data.recipes.find((candidate) => candidate.slug === input.recipeSlug);
  if (!recipe || recipe.status !== "active") throw new Error("Active recipe not found.");

  const existing = data.sessions.find(
    (session) =>
      session.contributorId === input.contributorId &&
      session.recipeId === recipe.id &&
      (session.status === "setup" || session.status === "in_progress"),
  );
  if (existing) {
    const { data: row, error } = await supabase
      .from("recording_sessions")
      .update({
        environment_type: input.environmentType,
        background_noise: input.backgroundNoise ?? null,
        microphone_distance: input.microphoneDistance,
        device_category: input.deviceCategory ?? null,
        device_metadata_json: input.deviceMetadataJson ?? existing.deviceMetadataJson,
        expected_interruptions: input.expectedInterruptions,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    return mapSession(throwIfError(row, error, "Could not update session"));
  }

  const priorCompletedPromptIds = new Set(
    data.recordings
      .filter((recording) => recording.contributorId === input.contributorId && recording.reviewStatus !== "removed")
      .map((recording) => recording.promptId),
  );
  const prompts = selectPromptAssignments(
    data.prompts.filter((prompt) => prompt.recipeId === recipe.id && prompt.isActive),
    priorCompletedPromptIds,
    recipe.promptsPerSession,
  );
  if (prompts.length === 0) throw new Error("Recipe does not have active prompts.");

  const { data: sessionRow, error: sessionError } = await supabase
    .from("recording_sessions")
    .insert({
      contributor_id: input.contributorId,
      recipe_id: recipe.id,
      status: "setup",
      environment_type: input.environmentType,
      background_noise: input.backgroundNoise ?? null,
      microphone_distance: input.microphoneDistance,
      device_category: input.deviceCategory ?? null,
      device_metadata_json: input.deviceMetadataJson ?? {},
      expected_interruptions: input.expectedInterruptions,
      completion_code: completionCode(),
    })
    .select("*")
    .single();
  const session = mapSession(throwIfError(sessionRow, sessionError, "Could not create session"));

  const { error: assignmentError } = await supabase.from("prompt_assignments").insert(
    prompts.map((prompt, index) => ({
      session_id: session.id,
      prompt_id: prompt.id,
      assignment_order: index + 1,
      status: "assigned",
    })),
  );
  throwIfError(null, assignmentError, "Could not create prompt assignments");

  return session;
}

export async function markSessionInProgress(sessionId: string) {
  const data = await getData();
  const session = data.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error("Session not found.");
  if (session.status !== "setup") return session;
  const supabase = await client();
  const { data: row, error } = await supabase
    .from("recording_sessions")
    .update({ status: "in_progress" })
    .eq("id", sessionId)
    .select("*")
    .single();
  return mapSession(throwIfError(row, error, "Could not mark session in progress"));
}

export async function getSessionView(sessionId: string): Promise<SessionView | undefined> {
  const data = await getData();
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

async function completeSessionIfDone(sessionId: string) {
  const supabase = await client();
  const data = await getData();
  const assignments = data.assignments.filter((assignment) => assignment.sessionId === sessionId);
  const session = data.sessions.find((candidate) => candidate.id === sessionId);
  if (session && assignments.length > 0 && assignments.every((assignment) => assignment.status !== "assigned")) {
    const { data: row, error } = await supabase
      .from("recording_sessions")
      .update({ status: "completed", completed_at: session.completedAt ?? nowIso() })
      .eq("id", sessionId)
      .select("*")
      .single();
    throwIfError(row, error, "Could not complete session");
  }
}

export async function submitRecording(input: {
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
  const supabase = await client();
  const data = await getData();
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

  const recordingId = crypto.randomUUID();
  const extension = audioExtensionForMime(input.mimeType);
  const storagePath = `recipes/${session.recipeId}/contributors/${session.contributorId}/sessions/${session.id}/${recordingId}.${extension}`;
  const upload = await supabase.storage.from(AUDIO_BUCKET).upload(storagePath, Buffer.from(input.bytes), {
    contentType: baseAudioMimeType(input.mimeType),
    upsert: true,
  });
  throwIfError(upload.data, upload.error, "Could not upload audio");

  const { data: row, error } = await supabase
    .from("recordings")
    .insert({
      id: recordingId,
      session_id: session.id,
      assignment_id: assignment.id,
      contributor_id: session.contributorId,
      recipe_id: session.recipeId,
      prompt_id: prompt.id,
      storage_path: storagePath,
      mime_type: input.mimeType,
      file_size_bytes: input.bytes.byteLength,
      duration_ms: input.durationMs,
      audio_sample_rate_hz: input.audioSampleRateHz ?? null,
      channel_count: input.channelCount ?? null,
      client_rms: input.clientRms ?? null,
      client_peak: input.clientPeak ?? null,
      silence_warning: input.silenceWarning,
      clipping_warning: input.clippingWarning,
      input_validity: input.inputValidity ?? "valid_command",
      contributor_transcript: input.contributorTranscript,
      upload_status: "uploaded",
      review_status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
    throw new Error(`Could not save recording metadata: ${error.message}`);
  }

  const { error: assignmentError } = await supabase
    .from("prompt_assignments")
    .update({ status: "submitted" })
    .eq("id", assignment.id);
  throwIfError(null, assignmentError, "Could not mark assignment submitted");

  const { error: sessionError } = await supabase
    .from("recording_sessions")
    .update({ status: "in_progress" })
    .eq("id", session.id)
    .neq("status", "completed");
  throwIfError(null, sessionError, "Could not update session status");
  await completeSessionIfDone(session.id);

  return mapRecording(row);
}

export async function skipAssignment(input: { sessionId: string; assignmentId: string; skipReason: string }) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("prompt_assignments")
    .update({ status: "skipped", skip_reason: input.skipReason })
    .eq("id", input.assignmentId)
    .eq("session_id", input.sessionId)
    .select("*")
    .single();
  const assignment = mapAssignment(throwIfError(data, error, "Could not skip assignment"));

  const view = await getSessionView(input.sessionId);
  if (view?.session.status === "setup") {
    await supabase.from("recording_sessions").update({ status: "in_progress" }).eq("id", input.sessionId);
  }
  await completeSessionIfDone(input.sessionId);
  return assignment;
}

export async function getAudioObject(recordingId: string): Promise<DemoAudioObject | undefined> {
  const supabase = await client();
  const data = await getData();
  const recording = data.recordings.find((candidate) => candidate.id === recordingId && !candidate.deletedAt);
  if (!recording) return undefined;

  const { data: blob, error } = await supabase.storage.from(AUDIO_BUCKET).download(recording.storagePath);
  throwIfError(blob, error, "Could not download audio");
  if (!blob) throw new Error("Audio object was empty.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    mimeType: recording.mimeType,
    fileName: recording.storagePath.split("/").at(-1) ?? `${recording.id}.${audioExtensionForMime(recording.mimeType)}`,
  };
}

export async function uploadEvalDatasetAudio(input: { bytes: Uint8Array; mimeType: string; fileName?: string }) {
  const supabase = await client();
  const assetId = crypto.randomUUID();
  const extension = audioExtensionForMime(input.mimeType);
  const storagePath = `eval-datasets/manual/${assetId}.${extension}`;
  const upload = await supabase.storage.from(AUDIO_BUCKET).upload(storagePath, Buffer.from(input.bytes), {
    contentType: baseAudioMimeType(input.mimeType),
    upsert: true,
  });
  throwIfError(upload.data, upload.error, "Could not upload dataset audio");
  return {
    storagePath,
    mimeType: input.mimeType,
    fileName: input.fileName || `${assetId}.${extension}`,
    fileSizeBytes: input.bytes.byteLength,
  };
}

export async function getEvalDatasetAudioObject(storagePath: string): Promise<DemoAudioObject | undefined> {
  const supabase = await client();
  const { data: blob, error } = await supabase.storage.from(AUDIO_BUCKET).download(storagePath);
  throwIfError(blob, error, "Could not download dataset audio");
  if (!blob) return undefined;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    mimeType: blob.type || "application/octet-stream",
    fileName: storagePath.split("/").at(-1) ?? "dataset-audio",
  };
}

export async function getRecordingDetail(recordingId: string) {
  const data = await getData();
  const recording = data.recordings.find((candidate) => candidate.id === recordingId);
  if (!recording) return undefined;
  const prompt = data.prompts.find((candidate) => candidate.id === recording.promptId);
  const session = data.sessions.find((candidate) => candidate.id === recording.sessionId);
  const review = data.reviews.find((candidate) => candidate.recordingId === recording.id);
  return { recording, prompt, session, review };
}

export async function getReviewQueue() {
  const data = await getData();
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

export async function saveReview(input: {
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
  const supabase = await client();
  const data = await getData();
  const recording = data.recordings.find((candidate) => candidate.id === input.recordingId);
  if (!recording) throw new Error("Recording not found.");

  const { data: review, error } = await supabase
    .from("quality_reviews")
    .upsert(
      {
        recording_id: recording.id,
        reviewed_transcript: input.reviewedTranscript,
        decision: input.decision,
        quality_flags: input.qualityFlags,
        rejection_reason: input.rejectionReason ?? null,
        audio_quality_score: input.audioQualityScore,
        command_compliance_score: input.commandComplianceScore,
        transcript_confidence_score: input.transcriptConfidenceScore,
        reviewer_notes: packReviewNotes(input.reviewerNotes, input.semanticAnnotation) ?? null,
        reviewed_at: nowIso(),
      },
      { onConflict: "recording_id" },
    )
    .select("*")
    .single();
  throwIfError(review, error, "Could not save review");

  const { error: recordingError } = await supabase
    .from("recordings")
    .update({ review_status: input.decision })
    .eq("id", recording.id);
  throwIfError(null, recordingError, "Could not update recording review status");
  return mapReview(review);
}

export async function acceptedRecordingsForEvaluation(recipeId?: string) {
  const data = await getData();
  return data.recordings.filter((recording) => {
    if (recording.deletedAt || recording.reviewStatus !== "accepted") return false;
    if (recipeId && recording.recipeId !== recipeId) return false;
    const review = data.reviews.find((candidate) => candidate.recordingId === recording.id);
    return Boolean(review?.reviewedTranscript.trim());
  });
}

export async function createEvalDataset(input: {
  name: string;
  description?: string;
  recipeId?: string;
  recordingIds?: string[];
  rows?: EvalDatasetRow[];
  filters?: Record<string, unknown>;
  tags?: string[];
}) {
  const supabase = await client();
  const accepted = await acceptedRecordingsForEvaluation(input.recipeId);
  const allowed = new Set(accepted.map((recording) => recording.id));
  const rows = normalizeDatasetRows(input.rows ?? []);
  const fallbackRecordingIds = rows.length ? [] : accepted.map((recording) => recording.id);
  const selectedIds = (input.recordingIds?.length ? input.recordingIds : fallbackRecordingIds).filter((id) =>
    allowed.has(id),
  );
  if (selectedIds.length === 0 && rows.length === 0) throw new Error("Dataset requires at least one accepted recording or imported row.");
  const filters = { ...(input.filters ?? {}) };
  if (rows.length) filters[importedRowsKey] = rows;
  const { data, error } = await supabase
    .from("eval_datasets")
    .insert({
      name: input.name,
      description: input.description ?? null,
      recipe_id: input.recipeId ?? null,
      selection_filters_json: filters,
      recording_ids: selectedIds,
      tags: input.tags ?? [],
      row_count: rows.length || selectedIds.length,
    })
    .select("*")
    .single();
  return mapEvalDataset(throwIfError(data, error, "Could not create eval dataset"));
}

export async function getScorerConfigs() {
  return (await getData()).scorerConfigs;
}

export async function createScorerConfig(input: {
  name: string;
  scorerType: ScorerConfig["scorerType"];
  description: string;
  metricKeys: string[];
  rubricText?: string;
  judgeModel?: string;
  thresholdsJson?: Record<string, unknown>;
}) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("scorer_configs")
    .insert({
      name: input.name,
      scorer_type: input.scorerType,
      description: input.description,
      metric_keys: input.metricKeys,
      rubric_text: input.rubricText ?? null,
      judge_model: input.judgeModel ?? null,
      thresholds_json: input.thresholdsJson ?? {},
      is_enabled: true,
    })
    .select("*")
    .single();
  return mapScorerConfig(throwIfError(data, error, "Could not create scorer config"));
}

export async function updateScorerConfig(input: {
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
  const supabase = await client();
  const updates = compact({
    name: input.name,
    scorer_type: input.scorerType,
    description: input.description,
    metric_keys: input.metricKeys,
    rubric_text: input.rubricText,
    judge_model: input.judgeModel,
    thresholds_json: input.thresholdsJson,
    is_enabled: input.isEnabled,
    updated_at: nowIso(),
  });
  const { data, error } = await supabase.from("scorer_configs").update(updates).eq("id", input.scorerId).select("*").single();
  return mapScorerConfig(throwIfError(data, error, "Could not update scorer config"));
}

export async function createPlaygroundSession(input: {
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
  const supabase = await client();
  const { data, error } = await supabase
    .from("playground_sessions")
    .insert({
      name: input.name ?? null,
      eval_dataset_id: input.evalDatasetId ?? null,
      sample_recording_ids: input.sampleRecordingIds,
      model_config_ids: input.modelConfigIds,
      scorer_config_ids: input.scorerConfigIds,
      task_config_json: input.taskConfigJson ?? {},
      results_json: input.resultsJson,
    })
    .select("*")
    .single();
  return mapPlaygroundSession(throwIfError(data, error, "Could not create playground session"));
}

export async function markPlaygroundPromoted(playgroundSessionId: string, evaluationRunId: string) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("playground_sessions")
    .update({ promoted_evaluation_run_id: evaluationRunId })
    .eq("id", playgroundSessionId)
    .select("*")
    .single();
  return mapPlaygroundSession(throwIfError(data, error, "Could not mark playground promoted"));
}

export async function updatePlaygroundSession(input: { playgroundSessionId: string; resultsJson: PlaygroundResult[]; sampleRecordingIds: string[] }) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("playground_sessions")
    .update({
      results_json: input.resultsJson,
      sample_recording_ids: input.sampleRecordingIds,
    })
    .eq("id", input.playgroundSessionId)
    .select("*")
    .single();
  return mapPlaygroundSession(throwIfError(data, error, "Could not update playground session"));
}

export async function getModelConfigs() {
  const data = await getData();
  const env = getEnv();
  const hasKeys = {
    mock: true,
    openai: Boolean(env.OPENAI_API_KEY),
    gemini: Boolean(env.GEMINI_API_KEY),
    elevenlabs: Boolean(env.ELEVENLABS_API_KEY),
    deepgram: Boolean(env.DEEPGRAM_API_KEY),
  };
  return data.modelConfigs.map((config) => ({
    ...config,
    isEnabled: config.isEnabled && hasKeys[config.provider],
  }));
}

export async function createEvaluationRun(input: {
  recipeId: string;
  name: string;
  modelConfigIds: string[];
  filters?: Record<string, unknown>;
  recordingIds?: string[];
  evalDatasetId?: string;
  scorerConfigIds?: string[];
  taskConfigJson?: Record<string, unknown>;
}) {
  const supabase = await client();
  const accepted = await acceptedRecordingsForEvaluation(input.recipeId);
  const selectedRecordingIdSet = input.recordingIds?.length ? new Set(input.recordingIds) : undefined;
  const selectedRecordings = selectedRecordingIdSet
    ? accepted.filter((recording) => selectedRecordingIdSet.has(recording.id))
    : accepted;
  const runId = crypto.randomUUID();
  const { data: runRow, error: runError } = await supabase
    .from("evaluation_runs")
    .insert({
      id: runId,
      recipe_id: input.recipeId,
      name: input.name,
      status: "draft",
      selection_filters_json: input.filters ?? {},
      normalization_profile_json: defaultNormalizationProfile,
      total_recordings: selectedRecordings.length * input.modelConfigIds.length,
      completed_recordings: 0,
      failed_recordings: 0,
    })
    .select("*")
    .single();
  throwIfError(runRow, runError, "Could not create evaluation run");

  if (selectedRecordings.length) {
    const { error } = await supabase.from("evaluation_run_recordings").insert(
      selectedRecordings.map((recording) => ({ evaluation_run_id: runId, recording_id: recording.id })),
    );
    throwIfError(null, error, "Could not attach recordings to evaluation run");
  }
  if (input.modelConfigIds.length) {
    const { error } = await supabase.from("evaluation_run_models").insert(
      input.modelConfigIds.map((modelConfigId) => ({ evaluation_run_id: runId, stt_model_config_id: modelConfigId })),
    );
    throwIfError(null, error, "Could not attach models to evaluation run");
  }

  if (input.evalDatasetId || input.scorerConfigIds?.length || input.taskConfigJson) {
    const data = await getData();
    const dataset = input.evalDatasetId ? data.evalDatasets.find((candidate) => candidate.id === input.evalDatasetId) : undefined;
    const scorers = data.scorerConfigs.filter((scorer) => input.scorerConfigIds?.includes(scorer.id));
    const { error } = await supabase.from("experiment_snapshots").insert({
      evaluation_run_id: runId,
      eval_dataset_id: input.evalDatasetId ?? null,
      task_config_json: input.taskConfigJson ?? {
        modelConfigIds: input.modelConfigIds,
        promptHintMode: "reference_for_mock",
        languageHintMode: "prompt_language",
      },
      scorer_config_ids: input.scorerConfigIds ?? [],
      frozen_dataset_json: dataset
        ? { ...dataset, recordingIds: [...dataset.recordingIds] }
        : { recipeId: input.recipeId, recordingIds: selectedRecordings.map((recording) => recording.id) },
      frozen_scorers_json: { scorers },
      cost_estimate_usd: null,
    });
    throwIfError(null, error, "Could not create experiment snapshot");
  }

  return mapRun(runRow, selectedRecordings.map((recording) => recording.id));
}

export async function deleteEvaluationRun(runId: string) {
  const supabase = await client();
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");

  const { error: recipeError } = await supabase
    .from("collection_recipes")
    .update({ source_evaluation_run_id: null })
    .eq("source_evaluation_run_id", runId);
  throwIfError(null, recipeError, "Could not detach follow-up recipes");

  const { error } = await supabase.from("evaluation_runs").delete().eq("id", runId);
  throwIfError(null, error, "Could not delete evaluation run");
  return run;
}

export async function renameEvaluationRun(runId: string, name: string) {
  const supabase = await client();
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const { data: row, error } = await supabase
    .from("evaluation_runs")
    .update({ name })
    .eq("id", runId)
    .select("*")
    .single();
  return mapRun(throwIfError(row, error, "Could not rename evaluation run"), run.selectedRecordingIds);
}

export async function clearFailedEvaluationResults(runId: string) {
  const supabase = await client();
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const failedCount = data.sttResults.filter((result) => result.evaluationRunId === runId && result.status === "failed").length;
  if (failedCount === 0) return { run, clearedCount: 0 };

  const { error: deleteError } = await supabase
    .from("stt_results")
    .delete()
    .eq("evaluation_run_id", runId)
    .eq("status", "failed");
  throwIfError(null, deleteError, "Could not clear failed STT results");

  const completedRecordings = data.sttResults.filter(
    (result) => result.evaluationRunId === runId && result.status === "completed",
  ).length;
  const { data: row, error } = await supabase
    .from("evaluation_runs")
    .update({
      status: "running",
      completed_recordings: completedRecordings,
      failed_recordings: 0,
      completed_at: null,
    })
    .eq("id", runId)
    .select("*")
    .single();
  return { run: mapRun(throwIfError(row, error, "Could not reset evaluation run"), run.selectedRecordingIds), clearedCount: failedCount };
}

export async function markEvaluationRunRunning(runId: string) {
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  if (run.status === "running") return run;
  const supabase = await client();
  const startedAt = run.startedAt ?? nowIso();
  const { data: row, error } = await supabase
    .from("evaluation_runs")
    .update({ status: "running", started_at: startedAt })
    .eq("id", runId)
    .select("*")
    .single();
  return mapRun(throwIfError(row, error, "Could not start evaluation run"), run.selectedRecordingIds);
}

export async function markEvaluationRunCompleted(runId: string) {
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const supabase = await client();
  const completedAt = nowIso();
  const { data: row, error } = await supabase
    .from("evaluation_runs")
    .update({ status: "completed", completed_at: completedAt })
    .eq("id", runId)
    .select("*")
    .single();
  return mapRun(throwIfError(row, error, "Could not complete evaluation run"), run.selectedRecordingIds);
}

export async function updateEvaluationProgress(runId: string) {
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const results = data.sttResults.filter((result) => result.evaluationRunId === run.id);
  const completedRecordings = results.filter((result) => result.status === "completed").length;
  const failedRecordings = results.filter((result) => result.status === "failed").length;
  const terminal = completedRecordings + failedRecordings;
  const patch: Row = {
    completed_recordings: completedRecordings,
    failed_recordings: failedRecordings,
  };
  if (run.status === "running" && terminal >= run.totalRecordings) {
    patch.status = "completed";
    patch.completed_at = nowIso();
  }
  const supabase = await client();
  const { data: row, error } = await supabase
    .from("evaluation_runs")
    .update(patch)
    .eq("id", runId)
    .select("*")
    .single();
  return mapRun(throwIfError(row, error, "Could not update evaluation progress"), run.selectedRecordingIds);
}

export async function createSttResult(input: Omit<SttResult, "id" | "createdAt">) {
  const supabase = await client();
  const { data: existing, error: existingError } = await supabase
    .from("stt_results")
    .select("*")
    .eq("evaluation_run_id", input.evaluationRunId)
    .eq("stt_model_config_id", input.sttModelConfigId)
    .eq("recording_id", input.recordingId)
    .maybeSingle();
  throwIfError(existing, existingError, "Could not load STT result");
  if (existing) return mapSttResult(existing);

  const { data, error } = await supabase
    .from("stt_results")
    .insert({
      evaluation_run_id: input.evaluationRunId,
      stt_model_config_id: input.sttModelConfigId,
      recording_id: input.recordingId,
      status: input.status,
      hypothesis: input.hypothesis ?? null,
      detected_language: input.detectedLanguage ?? null,
      latency_ms: input.latencyMs ?? null,
      provider_response_json: input.providerResponseJson ?? null,
      error_message: input.errorMessage ?? null,
      completed_at: input.completedAt ?? null,
    })
    .select("*")
    .single();
  return mapSttResult(throwIfError(data, error, "Could not create STT result"));
}

export async function createMetric(input: Omit<EvaluationMetric, "id">) {
  const supabase = await client();
  const { data: existing, error: existingError } = await supabase
    .from("evaluation_metrics")
    .select("*")
    .eq("stt_result_id", input.sttResultId)
    .maybeSingle();
  throwIfError(existing, existingError, "Could not load evaluation metric");
  if (existing) return mapMetric(existing);

  const payload: Row = {
    stt_result_id: input.sttResultId,
    reference_normalized: input.referenceNormalized,
    hypothesis_normalized: input.hypothesisNormalized,
    word_error_rate: input.wordErrorRate,
    character_error_rate: input.characterErrorRate,
    exact_match: input.exactMatch,
    insertions: input.insertions,
    deletions: input.deletions,
    substitutions: input.substitutions,
    reference_word_count: input.referenceWordCount,
    reference_character_count: input.referenceCharacterCount,
    mixed_error_rate: input.mixedErrorRate ?? null,
    overgeneration_rate: input.overgenerationRate ?? null,
    semantic_risk_flags: input.semanticRiskFlags ?? null,
    linguistic_category: input.linguisticCategory ?? null,
    scorer_scores_json: input.scorerScoresJson ?? null,
    scorer_rationale: input.scorerRationale ?? null,
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from("evaluation_metrics").insert(payload).select("*").single();
    if (!error) {
      if (!data) throw new Error("Could not create evaluation metric: Supabase returned no row.");
      return mapMetric(data);
    }
    const missingColumn = missingSchemaColumn(error.message);
    if (!missingColumn || !(missingColumn in payload) || !optionalMetricColumns.has(missingColumn)) {
      throw new Error(`Could not create evaluation metric: ${error.message}`);
    }
    delete payload[missingColumn];
  }
  throw new Error("Could not create evaluation metric after removing unavailable optional columns.");
}

function groupCounts<T>(items: T[], label: (item: T) => string | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = label(item) ?? "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value }));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const data = await getData();
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

export async function createRecipe(input: {
  name: string;
  slug: string;
  description: string;
  contributorInstructions: string;
  promptsPerSession: number;
  targetAcceptedRecordings: number;
}) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("collection_recipes")
    .insert({
      name: input.name,
      slug: input.slug,
      version: 1,
      status: "draft",
      description: input.description,
      contributor_instructions: input.contributorInstructions,
      internal_objective: "Draft recipe created from the admin UI.",
      consent_version: CONSENT_VERSION,
      target_accepted_recordings: input.targetAcceptedRecordings,
      prompts_per_session: input.promptsPerSession,
      supported_languages: ["English", "Japanese", "English-Japanese"],
    })
    .select("*")
    .single();
  return mapRecipe(throwIfError(data, error, "Could not create recipe"));
}

export async function updateRecipe(input: {
  recipeId: string;
  name?: string;
  description?: string;
  contributorInstructions?: string;
  targetAcceptedRecordings?: number;
  promptsPerSession?: number;
  followUpNotes?: string;
}) {
  const existing = (await getData()).recipes.find((recipe) => recipe.id === input.recipeId);
  if (!existing) throw new Error("Recipe not found.");
  const patch: Row = { updated_at: nowIso() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.contributorInstructions !== undefined) patch.contributor_instructions = input.contributorInstructions;
  if (input.targetAcceptedRecordings !== undefined) patch.target_accepted_recordings = input.targetAcceptedRecordings;
  if (input.promptsPerSession !== undefined) patch.prompts_per_session = input.promptsPerSession;
  if (input.followUpNotes !== undefined) patch.internal_objective = packRecipeObjective(existing.internalObjective, input.followUpNotes);
  const supabase = await client();
  const { data, error } = await supabase
    .from("collection_recipes")
    .update(patch)
    .eq("id", input.recipeId)
    .select("*")
    .single();
  const recipe = mapRecipe(throwIfError(data, error, "Could not update recipe"));
  return { ...recipe, followUpNotes: input.followUpNotes ?? recipe.followUpNotes };
}

export async function cloneRecipe(recipeId: string, options?: { sourceEvaluationRunId?: string; followUpNotes?: string }) {
  const supabase = await client();
  const data = await getData();
  const source = data.recipes.find((recipe) => recipe.id === recipeId);
  if (!source) throw new Error("Source recipe not found.");
  const { data: recipeRow, error } = await supabase
    .from("collection_recipes")
    .insert({
      name: `${source.name} follow-up`,
      slug: `${source.slug}-follow-up-${Date.now().toString(36)}`,
      version: source.version + 1,
      status: "draft",
      description: source.description,
      contributor_instructions: source.contributorInstructions,
      internal_objective: packRecipeObjective(source.internalObjective, options?.followUpNotes),
      consent_version: source.consentVersion,
      target_accepted_recordings: source.targetAcceptedRecordings,
      prompts_per_session: source.promptsPerSession,
      supported_languages: source.supportedLanguages,
      source_recipe_id: source.id,
      source_evaluation_run_id: options?.sourceEvaluationRunId ?? null,
    })
    .select("*")
    .single();
  const clone = mapRecipe(throwIfError(recipeRow, error, "Could not clone recipe"));

  const sourcePrompts = data.prompts.filter((prompt) => prompt.recipeId === source.id);
  if (sourcePrompts.length) {
    const { error: promptError } = await supabase.from("command_prompts").insert(
      sourcePrompts.map((prompt) => ({
        recipe_id: clone.id,
        prompt_mode: prompt.promptMode,
        display_instruction: prompt.displayInstruction,
        exact_text: prompt.exactText ?? null,
        language: prompt.language,
        task_type: prompt.taskType,
        command_variant: prompt.commandVariant,
        target_intent: prompt.targetIntent,
        slots_json: prompt.slotsJson,
        safety_sensitive: prompt.safetySensitive,
        difficulty: prompt.difficulty,
        tags: prompt.tags,
        display_order: prompt.displayOrder,
        is_active: prompt.isActive,
      })),
    );
    throwIfError(null, promptError, "Could not clone prompts");
  }
  return { ...clone, followUpNotes: options?.followUpNotes };
}

export async function activateRecipe(recipeId: string) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("collection_recipes")
    .update({ status: "active", activated_at: nowIso(), updated_at: nowIso() })
    .eq("id", recipeId)
    .select("*")
    .single();
  return mapRecipe(throwIfError(data, error, "Could not activate recipe"));
}

export async function archiveRecipe(recipeId: string) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("collection_recipes")
    .update({ status: "archived", updated_at: nowIso() })
    .eq("id", recipeId)
    .select("*")
    .single();
  return mapRecipe(throwIfError(data, error, "Could not archive recipe"));
}

export async function addPromptToRecipe(input: {
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
  const supabase = await client();
  const data = await getData();
  const recipe = data.recipes.find((candidate) => candidate.id === input.recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  const collectedCount = data.recordings.filter((recording) => recording.recipeId === recipe.id).length;
  if (collectedCount > 0 && recipe.status !== "draft") {
    throw new Error("Recipes with collected data must be cloned before material prompt changes.");
  }
  const maxOrder = Math.max(0, ...data.prompts.filter((prompt) => prompt.recipeId === recipe.id).map((prompt) => prompt.displayOrder));
  const { data: row, error } = await supabase
    .from("command_prompts")
    .insert({
      recipe_id: recipe.id,
      prompt_mode: input.promptMode,
      display_instruction: input.displayInstruction,
      exact_text: input.exactText ?? null,
      language: input.language,
      task_type: input.taskType,
      command_variant: input.commandVariant,
      target_intent: input.targetIntent,
      slots_json: input.slotsJson ?? {},
      safety_sensitive:
        input.safetySensitive ?? (input.commandVariant === "Safety-sensitive" || input.taskType === "Safety intervention"),
      difficulty: input.difficulty ?? 2,
      tags: input.tags ?? [],
      display_order: maxOrder + 1,
      is_active: true,
    })
    .select("*")
    .single();
  return mapPrompt(throwIfError(row, error, "Could not add prompt"));
}

export async function updatePrompt(input: {
  promptId: string;
  promptMode: CommandPrompt["promptMode"];
  displayInstruction: string;
  exactText?: string;
  language: CommandPrompt["language"];
  taskType: CommandPrompt["taskType"];
  commandVariant: CommandPrompt["commandVariant"];
  targetIntent: string;
}) {
  const data = await getData();
  const prompt = data.prompts.find((candidate) => candidate.id === input.promptId);
  if (!prompt) throw new Error("Prompt not found.");
  const recipe = data.recipes.find((candidate) => candidate.id === prompt.recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  const collectedCount = data.recordings.filter((recording) => recording.recipeId === recipe.id).length;
  if (collectedCount > 0 && recipe.status !== "draft") {
    throw new Error("Recipes with collected data must be cloned before material prompt changes.");
  }

  const supabase = await client();
  const { data: row, error } = await supabase
    .from("command_prompts")
    .update({
      prompt_mode: input.promptMode,
      display_instruction: input.displayInstruction,
      exact_text: input.exactText || null,
      language: input.language,
      task_type: input.taskType,
      command_variant: input.commandVariant,
      target_intent: input.targetIntent,
      safety_sensitive: input.commandVariant === "Safety-sensitive" || input.taskType === "Safety intervention",
    })
    .eq("id", input.promptId)
    .select("*")
    .single();
  const updatedPrompt = mapPrompt(throwIfError(row, error, "Could not update prompt"));

  const { error: recipeError } = await supabase
    .from("collection_recipes")
    .update({ updated_at: nowIso() })
    .eq("id", prompt.recipeId);
  throwIfError(null, recipeError, "Could not update recipe timestamp");

  return updatedPrompt;
}

export async function createFollowUpRecipeFromSlices(
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
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const notes =
    options?.followUpNotes ||
    `Created from evaluation ${run.name}. Selected next-collection priorities: ${sliceKeys.join(", ")}. More data is needed because these slices combine failure rate, severity, and coverage gaps.`;
  const draft = await cloneRecipe(run.recipeId, { sourceEvaluationRunId: run.id, followUpNotes: notes });
  const supabase = await client();
  const targetAcceptedRecordings = options?.targetAcceptedRecordings ?? Math.max(60, sliceKeys.length * 30);
  const patch: Row = {
    target_accepted_recordings: targetAcceptedRecordings,
    prompts_per_session: options?.promptsPerSession ?? draft.promptsPerSession,
    updated_at: nowIso(),
  };
  if (options?.name) patch.name = options.name;
  if (options?.contributorInstructions) patch.contributor_instructions = options.contributorInstructions;
  const { data: row, error } = await supabase
    .from("collection_recipes")
    .update(patch)
    .eq("id", draft.id)
    .select("*")
    .single();
  return { ...mapRecipe(throwIfError(row, error, "Could not update follow-up recipe")), followUpNotes: notes };
}

export async function exportAcceptedRows() {
  const data = await getData();
  const accepted = await acceptedRecordingsForEvaluation();
  return accepted.map((recording) => {
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

export async function withdrawContributor(contributorId: string) {
  const supabase = await client();
  const data = await getData();
  const contributor = data.contributors.find((candidate) => candidate.id === contributorId);
  if (!contributor) throw new Error("Contributor not found.");
  const withdrawnAt = nowIso();
  const recordings = data.recordings.filter((recording) => recording.contributorId === contributorId && !recording.deletedAt);

  const { data: row, error } = await supabase
    .from("contributors")
    .update({ withdrawn_at: withdrawnAt })
    .eq("id", contributorId)
    .select("*")
    .single();
  throwIfError(row, error, "Could not mark contributor withdrawn");

  if (recordings.length) {
    const { error: recordingError } = await supabase
      .from("recordings")
      .update({ deleted_at: withdrawnAt, review_status: "removed" })
      .in(
        "id",
        recordings.map((recording) => recording.id),
      );
    throwIfError(null, recordingError, "Could not remove contributor recordings");
    await supabase.storage.from(AUDIO_BUCKET).remove(recordings.map((recording) => recording.storagePath));
  }
  return mapContributor(row);
}

export async function removeRecording(recordingId: string) {
  const supabase = await client();
  const data = await getData();
  const recording = data.recordings.find((candidate) => candidate.id === recordingId);
  if (!recording) throw new Error("Recording not found.");
  const { data: row, error } = await supabase
    .from("recordings")
    .update({ deleted_at: nowIso(), review_status: "removed" })
    .eq("id", recordingId)
    .select("*")
    .single();
  throwIfError(row, error, "Could not remove recording");
  await supabase.storage.from(AUDIO_BUCKET).remove([recording.storagePath]);
  return mapRecording(row);
}

export async function cleanupAbandonedUploads() {
  return 0;
}
