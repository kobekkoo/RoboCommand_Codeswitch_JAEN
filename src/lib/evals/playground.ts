import {
  createMetric,
  createEvaluationRun,
  createPlaygroundSession,
  createSttResult,
  getAudioObject,
  getData,
  getEvalDatasetAudioObject,
  getModelConfigs,
  getRecordingDetail,
  markEvaluationRunRunning,
  markPlaygroundPromoted,
  updateEvaluationProgress,
} from "@/lib/data/repository";
import type { CommandPrompt, EvalDatasetRow, LinguisticDiversityCategory, PlaygroundResult, ScorerConfig, SttModelConfig } from "@/lib/domain";
import { scoreTranscript, scoreTranscriptWithOptionalJudge } from "@/lib/evals/scorers";
import { providerFor } from "@/lib/stt/providers";

function resultId(recordingId: string, modelConfigId: string) {
  return `preview_${recordingId}_${modelConfigId}`;
}

type PreviewItem = {
  row: EvalDatasetRow;
  prompt?: CommandPrompt;
  hasCommandLoopAudio: boolean;
  hasDatasetAudio: boolean;
};

export async function runPlaygroundPreview(input: {
  evalDatasetId: string;
  sampleSize: number;
  modelConfigIds: string[];
  scorerConfigIds: string[];
  taskConfigJson?: Record<string, unknown>;
}) {
  const data = await getData();
  const dataset = data.evalDatasets.find((candidate) => candidate.id === input.evalDatasetId);
  if (!dataset) throw new Error("Eval dataset not found.");
  const enabledModels = await getModelConfigs();
  const modelMap = new Map(enabledModels.filter((model) => model.isEnabled).map((model) => [model.id, model]));
  const scorers = data.scorerConfigs.filter((scorer) => input.scorerConfigIds.includes(scorer.id) && scorer.isEnabled);
  const sampleItems = await previewItemsForDataset(dataset.rowsJson?.length ? dataset.rowsJson : undefined, dataset.recordingIds, input.sampleSize);
  const sampleRecordingIds = sampleItems.map((item) => item.row.sourceRecordingId ?? item.row.id);
  const results: PlaygroundResult[] = [];

  for (const item of sampleItems) {
    const recordingId = item.row.sourceRecordingId ?? item.row.id;
    const detail = item.row.sourceRecordingId ? await getRecordingDetail(item.row.sourceRecordingId) : undefined;
    const commandLoopAudio = item.hasCommandLoopAudio && item.row.sourceRecordingId ? await getAudioObject(item.row.sourceRecordingId) : undefined;
    const datasetAudio = item.hasDatasetAudio && item.row.audioStoragePath ? await getEvalDatasetAudioObject(item.row.audioStoragePath) : undefined;
    const audio = commandLoopAudio ?? datasetAudio;
    if (item.hasCommandLoopAudio && (!detail?.recording || !detail.prompt || !audio)) {
      for (const modelConfigId of input.modelConfigIds) {
        results.push({
          id: resultId(recordingId, modelConfigId),
          rowId: item.row.id,
          recordingId,
          inputText: item.row.inputText,
          instruction: item.row.inputText,
          humanTranscript: item.row.humanTranscript,
          expectedText: item.row.expectedText,
          tags: item.row.tags,
          metadataJson: item.row.metadataJson,
          modelConfigId,
          modelName: modelMap.get(modelConfigId)?.displayName ?? "Unknown model",
          status: "failed",
          traceStatus: "failed",
          errorMessage: "Missing recording detail, prompt, or audio object.",
          scores: {},
          scorerOutputs: [],
          rationale: "The preview could not load the required recording inputs.",
        });
      }
      continue;
    }

    for (const modelConfigId of input.modelConfigIds) {
      const model = modelMap.get(modelConfigId);
      if (!model) {
        results.push({
          id: resultId(recordingId, modelConfigId),
          rowId: item.row.id,
          recordingId,
          inputText: item.row.inputText,
          instruction: item.row.inputText,
          humanTranscript: item.row.humanTranscript,
          expectedText: item.row.expectedText,
          tags: item.row.tags,
          metadataJson: item.row.metadataJson,
          modelConfigId,
          modelName: "Unavailable model",
          status: "failed",
          traceStatus: "failed",
          errorMessage: "Model is unavailable until its API key is configured.",
          scores: {},
          scorerOutputs: [],
          rationale: "The selected model is disabled in this environment.",
        });
        continue;
      }

      try {
        const reference = item.row.humanTranscript.trim();
        const response =
          audio
            ? await providerFor(model.provider).transcribe({
                audio: Buffer.from(audio.bytes),
                mimeType: detail?.recording.mimeType ?? audio.mimeType,
                model: model.modelIdentifier,
                languageHint: detail?.prompt?.language === "English" ? "en" : detail?.prompt?.language === "Japanese" ? "ja" : undefined,
                promptHint: model.provider === "mock" ? reference : undefined,
                configuration: model.configurationJson,
              })
            : simulateTextOnlyTranscript(item.row, model);
        const scored = scorers.length
          ? await scoreTranscriptWithOptionalJudge({
              reference,
              hypothesis: response.text,
              prompt: item.prompt ?? detail?.prompt,
              scorers,
            })
          : undefined;
        const scorerOutputs = scored ? buildScorerOutputs(scored.scores, scored.rationale, scorers) : [];
        results.push({
          id: resultId(recordingId, modelConfigId),
          rowId: item.row.id,
          recordingId,
          inputText: item.row.inputText,
          instruction: item.row.inputText,
          humanTranscript: reference,
          expectedText: item.row.expectedText,
          tags: item.row.tags,
          metadataJson: item.row.metadataJson,
          modelConfigId,
          modelName: model.displayName,
          status: "completed",
          traceStatus: "completed",
          hypothesis: response.text,
          latencyMs: response.latencyMs,
          detectedLanguage: response.detectedLanguage,
          scores: scored?.scores ?? {},
          scorerOutputs,
          rationale: scored?.rationale ?? "STT transcript generated. No scorer was selected for this preview.",
        });
      } catch (error) {
        results.push({
          id: resultId(recordingId, modelConfigId),
          rowId: item.row.id,
          recordingId,
          inputText: item.row.inputText,
          instruction: item.row.inputText,
          humanTranscript: item.row.humanTranscript,
          expectedText: item.row.expectedText,
          tags: item.row.tags,
          metadataJson: item.row.metadataJson,
          modelConfigId,
          modelName: model.displayName,
          status: "failed",
          traceStatus: "failed",
          errorMessage: error instanceof Error ? error.message : "Preview transcription failed.",
          scores: {},
          scorerOutputs: [],
          rationale: "The provider failed before producing a preview transcript.",
        });
      }
    }
  }

  return createPlaygroundSession({
    name: `Playground preview ${new Date().toISOString().slice(0, 10)}`,
    evalDatasetId: input.evalDatasetId,
    status: "completed",
    progressPct: 100,
    currentStep: "Preview complete",
    sampleRecordingIds,
    modelConfigIds: input.modelConfigIds,
    scorerConfigIds: input.scorerConfigIds,
    taskConfigJson: input.taskConfigJson,
    resultsJson: results,
  });
}

async function previewItemsForDataset(rows: EvalDatasetRow[] | undefined, recordingIds: string[], sampleSize: number): Promise<PreviewItem[]> {
  if (rows?.length) {
    return rows.slice(0, sampleSize).map((row) => ({
      row,
      hasCommandLoopAudio: row.source === "recording" && Boolean(row.sourceRecordingId),
      hasDatasetAudio: row.source !== "recording" && Boolean(row.audioStoragePath),
    }));
  }

  const items: PreviewItem[] = [];
  for (const recordingId of recordingIds.slice(0, sampleSize)) {
    const detail = await getRecordingDetail(recordingId);
    if (!detail?.recording) continue;
    items.push({
      row: {
        id: recordingId,
        source: "recording",
        sourceRecordingId: recordingId,
        inputText: detail.prompt?.displayInstruction ?? detail.prompt?.exactText ?? "CommandLoop recording",
        audioStoragePath: detail.recording.storagePath,
        humanTranscript: referenceTextForRecordingDetail(detail),
        expectedText: detail.prompt?.exactText,
        tags: detail.prompt?.tags ?? [],
        metadataJson: {
          promptId: detail.recording.promptId,
          language: detail.prompt?.language,
          taskType: detail.prompt?.taskType,
          commandVariant: detail.prompt?.commandVariant,
        },
        rowOrder: items.length,
      },
      prompt: detail.prompt,
      hasCommandLoopAudio: true,
      hasDatasetAudio: false,
    });
  }
  return items;
}

function referenceTextForRecordingDetail(detail: Awaited<ReturnType<typeof getRecordingDetail>>) {
  return detail?.prompt?.exactText?.trim() || detail?.review?.reviewedTranscript?.trim() || detail?.recording?.contributorTranscript?.trim() || "";
}

function simulateTextOnlyTranscript(row: EvalDatasetRow, model: SttModelConfig) {
  if (model.provider !== "mock") throw new Error("This imported row is text-only. Real STT models need audio from CommandLoop or an accessible audio URL.");
  const reference = row.humanTranscript.trim();
  const text = model.modelIdentifier === "mock-noisy" ? reference.split(/\s+/).slice(1).join(" ") || reference : reference;
  return {
    text,
    latencyMs: model.modelIdentifier === "mock-noisy" ? 120 : 80,
    detectedLanguage: typeof row.metadataJson.language === "string" ? row.metadataJson.language : undefined,
    raw: { source: "text-only-mock" },
  };
}

function buildScorerOutputs(scores: Record<string, number>, rationale: string, scorers: ScorerConfig[]) {
  return scorers.map((scorer) => {
    const scorerScores = Object.fromEntries(Object.entries(scores).filter(([key]) => scorerScoreKeys(scorer).includes(key)));
    const threshold = typeof scorer.thresholdsJson.passThreshold === "number" ? scorer.thresholdsJson.passThreshold : undefined;
    const headlineScore = Object.values(scorerScores)[0];
    return {
      scorerId: scorer.id,
      scorerName: scorer.name,
      scorerType: scorer.scorerType,
      metricKeys: scorer.metricKeys,
      scores: scorerScores,
      passThreshold: threshold,
      passed: threshold === undefined || headlineScore === undefined ? undefined : headlineScore >= threshold,
      rationale,
    };
  });
}

function scorerScoreKeys(scorer: ScorerConfig) {
  if (scorer.scorerType === "deterministic") return ["wer", "cer", "mer", "exact_match", "overgeneration", "semantic_risk"];
  if (scorer.scorerType === "llm_judge") return ["command_fidelity"];
  if (scorer.scorerType === "human_review") return ["reviewer_validation"];
  return scorer.metricKeys;
}

export async function promotePlaygroundSession(input: { playgroundSessionId: string; name: string }) {
  const data = await getData();
  const session = data.playgroundSessions.find((candidate) => candidate.id === input.playgroundSessionId);
  if (!session) throw new Error("Playground session not found.");
  const dataset = session.evalDatasetId ? data.evalDatasets.find((candidate) => candidate.id === session.evalDatasetId) : undefined;
  const firstRecording = data.recordings.find((recording) => recording.id === session.sampleRecordingIds[0]);
  const recipeId = dataset?.recipeId ?? firstRecording?.recipeId;
  if (!recipeId) throw new Error("Could not determine experiment recipe.");

  const run = await createEvaluationRun({
    recipeId,
    name: input.name,
    modelConfigIds: session.modelConfigIds,
    recordingIds: session.sampleRecordingIds,
    evalDatasetId: session.evalDatasetId,
    scorerConfigIds: session.scorerConfigIds,
    taskConfigJson: session.taskConfigJson,
    filters: { source: "playground", playgroundSessionId: session.id },
  });
  const hydratedRun = await hydrateEvaluationRunFromPlaygroundSession(run.id, session.id);
  await markPlaygroundPromoted(session.id, run.id);
  return hydratedRun;
}

export async function hydrateEvaluationRunFromPlaygroundSession(runId: string, playgroundSessionId: string) {
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  const session = data.playgroundSessions.find((candidate) => candidate.id === playgroundSessionId);
  if (!session) throw new Error("Playground session not found.");
  if (!session.resultsJson.length) throw new Error("Playground session has no results to save.");

  await markEvaluationRunRunning(run.id);
  const scorers = data.scorerConfigs.filter((scorer) => session.scorerConfigIds.includes(scorer.id) && scorer.isEnabled);

  for (const previewResult of session.resultsJson) {
    if (!run.selectedRecordingIds.includes(previewResult.recordingId)) continue;
    if (!session.modelConfigIds.includes(previewResult.modelConfigId)) continue;

    const detail = await getRecordingDetail(previewResult.recordingId);
    const result = await createSttResult({
      evaluationRunId: run.id,
      sttModelConfigId: previewResult.modelConfigId,
      recordingId: previewResult.recordingId,
      status: previewResult.status,
      hypothesis: previewResult.hypothesis,
      detectedLanguage: previewResult.detectedLanguage,
      latencyMs: previewResult.latencyMs,
      providerResponseJson: {
        source: "playground_preview",
        playgroundSessionId: session.id,
        rowId: previewResult.rowId,
        traceStatus: previewResult.traceStatus,
        scorerOutputs: previewResult.scorerOutputs ?? [],
      },
      errorMessage: previewResult.errorMessage,
      completedAt: new Date().toISOString(),
    });

    const reference = previewResult.humanTranscript?.trim();
    if (previewResult.status !== "completed" || !previewResult.hypothesis || !reference || scorers.length === 0) continue;

    const scored = scoreTranscript({
      reference,
      hypothesis: previewResult.hypothesis,
      prompt: detail?.prompt,
      scorers,
      normalizationProfile: run.normalizationProfileJson,
    });
    await createMetric({
      sttResultId: result.id,
      ...scored.metric,
      scorerScoresJson: previewResult.scores,
      scorerRationale: previewResult.rationale,
      linguisticCategory: linguisticCategoryForPreview({
        result: previewResult,
        prompt: detail?.prompt,
        durationMs: detail?.recording.durationMs,
        qualityFlags: detail?.review?.qualityFlags,
      }),
    });
  }

  return updateEvaluationProgress(run.id);
}

function linguisticCategoryForPreview(input: {
  result: PlaygroundResult;
  prompt?: CommandPrompt;
  durationMs?: number;
  qualityFlags?: string[];
}): LinguisticDiversityCategory {
  const tags = [...(input.prompt?.tags ?? []), ...(input.result.tags ?? [])];
  const metadata = input.result.metadataJson ?? {};
  const language = input.prompt?.language ?? (typeof metadata.language === "string" ? metadata.language : undefined);
  const commandVariant = input.prompt?.commandVariant ?? (typeof metadata.commandVariant === "string" ? metadata.commandVariant : undefined);
  if (
    commandVariant === "Interrupted" ||
    tags.some((tag) => tag.includes("incomplete") || tag.includes("interrupted")) ||
    input.qualityFlags?.includes("Incomplete command")
  ) {
    return "incomplete_audio";
  }
  if (
    input.prompt?.promptMode === "code_switching" ||
    language === "English-Japanese" ||
    tags.some((tag) => tag.includes("code-switch"))
  ) {
    return "code_switching";
  }
  if ((input.durationMs ?? Number.POSITIVE_INFINITY) <= 3000 || tags.some((tag) => tag.includes("short"))) {
    return "short_utterance";
  }
  return "general";
}
