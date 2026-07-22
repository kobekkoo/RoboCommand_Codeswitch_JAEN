import {
  createMetric,
  createSttResult,
  clearFailedEvaluationResults,
  getAudioObject,
  getData,
  getRecordingDetail,
  markEvaluationRunCompleted,
  markEvaluationRunRunning,
  updateEvaluationProgress,
} from "@/lib/data/repository";
import type { CommandPrompt, LinguisticDiversityCategory, QualityReview, Recording } from "@/lib/domain";
import { scoreTranscriptWithOptionalJudge } from "@/lib/evals/scorers";
import { providerFor } from "@/lib/stt/providers";
import { buildCollectionPriorityRows } from "@/lib/stt/failure-analysis";

function nowIso() {
  return new Date().toISOString();
}

export function linguisticCategoryForRecording(input: {
  prompt?: Partial<Pick<CommandPrompt, "promptMode" | "language" | "commandVariant" | "tags">>;
  recording?: Partial<Pick<Recording, "durationMs">>;
  review?: Partial<Pick<QualityReview, "qualityFlags">>;
}): LinguisticDiversityCategory {
  const tags = input.prompt?.tags ?? [];
  const qualityFlags = input.review?.qualityFlags ?? [];
  if (
    input.prompt?.commandVariant === "Interrupted" ||
    tags.some((tag) => tag.includes("incomplete") || tag.includes("interrupted")) ||
    qualityFlags.includes("Incomplete command")
  ) {
    return "incomplete_audio";
  }
  if (
    input.prompt?.promptMode === "code_switching" ||
    input.prompt?.language === "English-Japanese" ||
    tags.some((tag) => tag.includes("code-switch"))
  ) {
    return "code_switching";
  }
  if ((input.recording?.durationMs ?? Number.POSITIVE_INFINITY) <= 3000 || tags.some((tag) => tag.includes("short"))) {
    return "short_utterance";
  }
  return "general";
}

export async function processNextEvaluationItem(runId: string) {
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  if (run.status === "completed" || run.status === "cancelled") return { done: true, run };

  await markEvaluationRunRunning(run.id);

  const modelLinks = data.evaluationRunModels.filter((link) => link.evaluationRunId === run.id);
  const snapshot = data.experimentSnapshots.find((candidate) => candidate.evaluationRunId === run.id);
  const scorerIds = snapshot?.scorerConfigIds.length ? snapshot.scorerConfigIds : ["scorer_transcript_core"];
  const scorers = data.scorerConfigs.filter((scorer) => scorerIds.includes(scorer.id) && scorer.isEnabled);
  for (const recordingId of run.selectedRecordingIds) {
    for (const link of modelLinks) {
      const existing = data.sttResults.find(
        (result) =>
          result.evaluationRunId === run.id &&
          result.recordingId === recordingId &&
          result.sttModelConfigId === link.sttModelConfigId,
      );
      if (existing) continue;

      const model = data.modelConfigs.find((config) => config.id === link.sttModelConfigId);
      const detail = await getRecordingDetail(recordingId);
      const audio = await getAudioObject(recordingId);
      if (!model || !detail?.recording || !detail.review || !detail.prompt || !audio) {
        await createSttResult({
          evaluationRunId: run.id,
          sttModelConfigId: link.sttModelConfigId,
          recordingId,
          status: "failed",
          errorMessage: "Missing model, review, prompt, or audio object.",
          completedAt: nowIso(),
        });
        return { done: false, run: await updateEvaluationProgress(run.id) };
      }

      try {
        const referenceTranscript = detail.recording.contributorTranscript.trim();
        const provider = providerFor(model.provider);
        const response = await provider.transcribe({
          audio: Buffer.from(audio.bytes),
          mimeType: detail.recording.mimeType,
          model: model.modelIdentifier,
          languageHint: detail.prompt.language === "English" ? "en" : detail.prompt.language === "Japanese" ? "ja" : undefined,
          promptHint: model.provider === "mock" ? referenceTranscript : undefined,
          configuration: model.configurationJson,
        });
        const result = await createSttResult({
          evaluationRunId: run.id,
          sttModelConfigId: model.id,
          recordingId,
          status: "completed",
          hypothesis: response.text,
          detectedLanguage: response.detectedLanguage,
          latencyMs: response.latencyMs,
          providerResponseJson: response.rawResponse,
          completedAt: nowIso(),
        });
        const scored = await scoreTranscriptWithOptionalJudge({
          reference: referenceTranscript,
          hypothesis: response.text,
          prompt: detail.prompt,
          scorers,
          normalizationProfile: run.normalizationProfileJson,
        });
        const linguisticCategory = linguisticCategoryForRecording({
          prompt: detail.prompt,
          recording: detail.recording,
          review: detail.review,
        });
        await createMetric({
          sttResultId: result.id,
          ...scored.metric,
          linguisticCategory,
        });
      } catch (error) {
        await createSttResult({
          evaluationRunId: run.id,
          sttModelConfigId: model.id,
          recordingId,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown STT failure",
          completedAt: nowIso(),
        });
      }

      return { done: false, run: await updateEvaluationProgress(run.id) };
    }
  }

  const completedRun = await markEvaluationRunCompleted(run.id);
  await updateEvaluationProgress(run.id);
  return { done: true, run: completedRun };
}

export async function processAllEvaluationItems(runId: string) {
  let processed = 0;
  let latest = await processNextEvaluationItem(runId);

  while (!latest.done && processed < 5000) {
    processed += 1;
    latest = await processNextEvaluationItem(runId);
  }

  if (!latest.done && processed >= 5000) {
    throw new Error("Stopped after 5000 work items. Process the remaining items in another batch.");
  }

  return { ...latest, processed };
}

export async function retryFailedEvaluationItems(runId: string) {
  const reset = await clearFailedEvaluationResults(runId);
  if (reset.clearedCount === 0) return { done: false, run: reset.run, processed: 0, retried: 0 };
  const latest = await processAllEvaluationItems(runId);
  return { ...latest, retried: reset.clearedCount };
}

export async function getEvaluationReport(runId: string) {
  const data = await getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) return undefined;
  const results = data.sttResults.filter((result) => result.evaluationRunId === run.id);
  const rows = results.map((result) => {
    const metric = data.metrics.find((candidate) => candidate.sttResultId === result.id);
    const recording = data.recordings.find((candidate) => candidate.id === result.recordingId);
    const prompt = recording ? data.prompts.find((candidate) => candidate.id === recording.promptId) : undefined;
    const session = recording ? data.sessions.find((candidate) => candidate.id === recording.sessionId) : undefined;
    const review = recording ? data.reviews.find((candidate) => candidate.recordingId === recording.id) : undefined;
    const model = data.modelConfigs.find((candidate) => candidate.id === result.sttModelConfigId);
    return { result, metric, recording, prompt, session, review, model };
  });

  const completed = rows.filter((row) => row.metric);
  const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  const percentile = (values: number[], p: number) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
  };

  function sliceBy(label: string, key: (row: (typeof rows)[number]) => string | undefined, includeUnknown = true) {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const value = key(row);
      if (!value && !includeUnknown) continue;
      const groupName = value ?? "Unknown";
      groups.set(groupName, [...(groups.get(groupName) ?? []), row]);
    }
    return [...groups.entries()].map(([name, group]) => {
      const withMetrics = group.filter((row) => row.metric);
      return {
        label,
        name,
        acceptedCount: group.length,
        evaluatedCount: withMetrics.length,
        meanWer: mean(withMetrics.map((row) => row.metric?.wordErrorRate ?? 0)),
        medianWer: percentile(withMetrics.map((row) => row.metric?.wordErrorRate ?? 0), 0.5),
        meanCer: mean(withMetrics.map((row) => row.metric?.characterErrorRate ?? 0)),
        meanMer: mean(withMetrics.map((row) => row.metric?.mixedErrorRate ?? row.metric?.characterErrorRate ?? 0)),
        meanOvergeneration: mean(withMetrics.map((row) => row.metric?.overgenerationRate ?? 0)),
        semanticRiskRate: withMetrics.length
          ? withMetrics.filter((row) => (row.metric?.semanticRiskFlags?.length ?? 0) > 0).length / withMetrics.length
          : 0,
        exactMatchRate: withMetrics.length
          ? withMetrics.filter((row) => row.metric?.exactMatch).length / withMetrics.length
          : 0,
        failureRate: group.length ? group.filter((row) => row.result.status === "failed").length / group.length : 0,
        medianLatency: percentile(
          withMetrics.map((row) => row.result.latencyMs ?? 0).filter((value) => value > 0),
          0.5,
        ),
        tinySample: withMetrics.length < 3,
      };
    });
  }

  function codeSwitchLevel(row: (typeof rows)[number]) {
    const level = row.prompt?.slotsJson.codeSwitchLevel ?? row.prompt?.slotsJson.code_switch_level;
    if (typeof level === "string" && level.trim()) return level.trim();
    const tag = row.prompt?.tags.find((item) => item.startsWith("cs-level:"));
    return tag?.slice("cs-level:".length);
  }

  const latencies = completed.map((row) => row.result.latencyMs ?? 0).filter((value) => value > 0);
  return {
    run,
    rows,
    summary: {
      overallWer: mean(completed.map((row) => row.metric?.wordErrorRate ?? 0)),
      overallCer: mean(completed.map((row) => row.metric?.characterErrorRate ?? 0)),
      overallMer: mean(completed.map((row) => row.metric?.mixedErrorRate ?? row.metric?.characterErrorRate ?? 0)),
      overgenerationRate: mean(completed.map((row) => row.metric?.overgenerationRate ?? 0)),
      semanticRiskRate: completed.length
        ? completed.filter((row) => (row.metric?.semanticRiskFlags?.length ?? 0) > 0).length / completed.length
        : 0,
      exactMatchRate: completed.length
        ? completed.filter((row) => row.metric?.exactMatch).length / completed.length
        : 0,
      medianLatency: percentile(latencies, 0.5),
      p95Latency: percentile(latencies, 0.95),
      failureRate: results.length ? results.filter((result) => result.status === "failed").length / results.length : 0,
      recordingCount: run.selectedRecordingIds.length,
    },
    slices: [
      ...sliceBy("Model", (row) => row.model?.displayName),
      ...sliceBy("Linguistic category", (row) =>
        row.metric?.linguisticCategory ??
        linguisticCategoryForRecording({ prompt: row.prompt, recording: row.recording, review: row.review }),
      ),
      ...sliceBy("Language", (row) => row.prompt?.language),
      ...sliceBy("Code-switch level", codeSwitchLevel, false),
      ...sliceBy("Environment", (row) => row.session?.environmentType),
      ...sliceBy("Command variant", (row) => row.prompt?.commandVariant),
      ...sliceBy("Task type", (row) => row.prompt?.taskType),
      ...sliceBy("Microphone distance", (row) => row.session?.microphoneDistance),
      ...sliceBy("Audio quality score", (row) => {
        const review = row.recording ? data.reviews.find((candidate) => candidate.recordingId === row.recording?.id) : undefined;
        return review ? String(review.audioQualityScore) : undefined;
      }),
      ...sliceBy("Duration bucket", (row) => {
        const duration = row.recording?.durationMs ?? 0;
        if (duration < 3000) return "0-3 seconds";
        if (duration < 8000) return "3-8 seconds";
        return "8+ seconds";
      }),
    ],
  };
}

export async function rankFlywheelSlices(runId?: string) {
  const data = await getData();
  const targetRun = runId ? data.evaluationRuns.find((run) => run.id === runId) : data.evaluationRuns.at(-1);
  if (!targetRun) return [];
  const report = await getEvaluationReport(targetRun.id);
  if (!report) return [];
  return report.slices
    .map((slice) => ({
      ...slice,
      score:
        slice.meanWer * 3 +
        slice.meanCer * 2 +
        (slice.tinySample ? 1.2 : 0) +
        slice.failureRate * 2 +
        (slice.label === "Command variant" || slice.label === "Task type" ? 0.2 : 0),
      runId: targetRun.id,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

export async function generateCollectionPriorities(runId?: string, targetSampleCount = 50) {
  const data = await getData();
  const targetRun = runId ? data.evaluationRuns.find((run) => run.id === runId) : data.evaluationRuns.at(-1);
  if (!targetRun) return [];
  const report = await getEvaluationReport(targetRun.id);
  if (!report) return [];
  return buildCollectionPriorityRows(report.rows, { runId: targetRun.id, targetSampleCount });
}
