import { describe, expect, it } from "vitest";
import {
  createEvaluationRun,
  createOrResumeSession,
  createMetric,
  createSttResult,
  getData,
  resetDemoData,
  saveReview,
  submitRecording,
} from "@/lib/data/store";
import { getEvaluationReport, processAllEvaluationItems, processNextEvaluationItem, retryFailedEvaluationItems } from "@/lib/stt/evaluation";

describe("evaluation processing", () => {
  it("is idempotent for a recording/model pair", async () => {
    const data = resetDemoData();
    const contributor = { id: "contributor_test", publicCode: "P-TEST", createdAt: new Date().toISOString() };
    data.contributors.push(contributor);
    const session = createOrResumeSession({
      contributorId: contributor.id,
      recipeSlug: "robot-home-commands-v1",
      environmentType: "Indoor, quiet",
      microphoneDistance: "Near: under 30 cm",
      expectedInterruptions: false,
    });
    const assignment = data.assignments.find((candidate) => candidate.sessionId === session.id)!;
    const manualTranscript = "Please grab the crimson mug.";
    const recording = submitRecording({
      sessionId: session.id,
      assignmentId: assignment.id,
      contributorTranscript: manualTranscript,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      durationMs: 1200,
      silenceWarning: false,
      clippingWarning: false,
    });
    saveReview({
      recordingId: recording.id,
      reviewedTranscript: "Pick up the red cup.",
      decision: "accepted",
      qualityFlags: ["Acceptable"],
      audioQualityScore: 5,
      commandComplianceScore: 5,
      transcriptConfidenceScore: 5,
    });
    const run = createEvaluationRun({
      recipeId: session.recipeId,
      name: "Test run",
      modelConfigIds: ["model_mock_echo"],
    });

    await processNextEvaluationItem(run.id);
    await processNextEvaluationItem(run.id);

    const results = getData().sttResults.filter((result) => result.evaluationRunId === run.id);
    const metric = getData().metrics.find((candidate) => candidate.sttResultId === results[0]!.id);
    expect(results).toHaveLength(1);
    expect(metric?.referenceNormalized).toBe("please grab the crimson mug");
    expect(metric?.exactMatch).toBe(true);
  });

  it("processes all remaining recording/model work items", async () => {
    const data = resetDemoData();
    const contributor = { id: "contributor_batch", publicCode: "P-BATCH", createdAt: new Date().toISOString() };
    data.contributors.push(contributor);
    const session = createOrResumeSession({
      contributorId: contributor.id,
      recipeSlug: "robot-home-commands-v1",
      environmentType: "Indoor, quiet",
      microphoneDistance: "Near: under 30 cm",
      expectedInterruptions: false,
    });
    const assignments = data.assignments.filter((candidate) => candidate.sessionId === session.id).slice(0, 2);
    for (const assignment of assignments) {
      const recording = submitRecording({
        sessionId: session.id,
        assignmentId: assignment.id,
        contributorTranscript: "Pick up the red cup.",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm",
        durationMs: 1200,
        silenceWarning: false,
        clippingWarning: false,
      });
      saveReview({
        recordingId: recording.id,
        reviewedTranscript: "Pick up the red cup.",
        decision: "accepted",
        qualityFlags: ["Acceptable"],
        audioQualityScore: 5,
        commandComplianceScore: 5,
        transcriptConfidenceScore: 5,
      });
    }
    const run = createEvaluationRun({
      recipeId: session.recipeId,
      name: "Batch run",
      modelConfigIds: ["model_mock_echo", "model_mock_noisy"],
    });

    const result = await processAllEvaluationItems(run.id);

    expect(result.done).toBe(true);
    expect(result.processed).toBe(4);
    expect(getData().sttResults.filter((candidate) => candidate.evaluationRunId === run.id)).toHaveLength(4);
  });

  it("clears failed results before retrying a run", async () => {
    const data = resetDemoData();
    const contributor = { id: "contributor_retry", publicCode: "P-RETRY", createdAt: new Date().toISOString() };
    data.contributors.push(contributor);
    const session = createOrResumeSession({
      contributorId: contributor.id,
      recipeSlug: "robot-home-commands-v1",
      environmentType: "Indoor, quiet",
      microphoneDistance: "Near: under 30 cm",
      expectedInterruptions: false,
    });
    const assignment = data.assignments.find((candidate) => candidate.sessionId === session.id)!;
    const recording = submitRecording({
      sessionId: session.id,
      assignmentId: assignment.id,
      contributorTranscript: "Pick up the red cup.",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      durationMs: 1200,
      silenceWarning: false,
      clippingWarning: false,
    });
    saveReview({
      recordingId: recording.id,
      reviewedTranscript: "Pick up the red cup.",
      decision: "accepted",
      qualityFlags: ["Acceptable"],
      audioQualityScore: 5,
      commandComplianceScore: 5,
      transcriptConfidenceScore: 5,
    });
    const run = createEvaluationRun({
      recipeId: session.recipeId,
      name: "Retry run",
      modelConfigIds: ["model_mock_echo"],
    });
    createSttResult({
      evaluationRunId: run.id,
      sttModelConfigId: "model_mock_echo",
      recordingId: recording.id,
      status: "failed",
      errorMessage: "Quota exceeded.",
      completedAt: new Date().toISOString(),
    });

    const result = await retryFailedEvaluationItems(run.id);
    const results = getData().sttResults.filter((candidate) => candidate.evaluationRunId === run.id);

    expect(result.retried).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("completed");
    expect(getData().metrics.filter((metric) => metric.sttResultId === results[0]!.id)).toHaveLength(1);
  });

  it("reports linguistic diversity metrics and slices", async () => {
    const data = resetDemoData();
    const contributor = { id: "contributor_linguistic", publicCode: "P-LING", createdAt: new Date().toISOString() };
    data.contributors.push(contributor);
    const session = createOrResumeSession({
      contributorId: contributor.id,
      recipeSlug: "robot-cs-household-en-ja-v1",
      environmentType: "Indoor, quiet",
      microphoneDistance: "Near: under 30 cm",
      expectedInterruptions: false,
    });
    const assignment = data.assignments.find((candidate) => candidate.sessionId === session.id)!;
    const recording = submitRecording({
      sessionId: session.id,
      assignmentId: assignment.id,
      contributorTranscript: "Clean the table. テーブルを綺麗にして。",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      durationMs: 2500,
      silenceWarning: false,
      clippingWarning: false,
    });
    saveReview({
      recordingId: recording.id,
      reviewedTranscript: "Clean the table. テーブルを綺麗にして。",
      decision: "accepted",
      qualityFlags: ["Acceptable"],
      audioQualityScore: 5,
      commandComplianceScore: 5,
      transcriptConfidenceScore: 5,
    });
    const run = createEvaluationRun({
      recipeId: session.recipeId,
      name: "Linguistic run",
      modelConfigIds: ["model_mock_echo"],
    });

    await processAllEvaluationItems(run.id);
    const report = await getEvaluationReport(run.id);
    const metric = getData().metrics[0];

    expect(report?.summary.overallMer).toBe(0);
    expect(metric?.linguisticCategory).toBe("code_switching");
    expect(metric?.semanticRiskFlags).toEqual([]);
    expect(report?.slices.some((slice) => slice.label === "Linguistic category" && slice.name === "code_switching")).toBe(true);
  });

  it("falls back gracefully for legacy metrics without linguistic columns", async () => {
    const data = resetDemoData();
    const contributor = { id: "contributor_legacy", publicCode: "P-LEGACY", createdAt: new Date().toISOString() };
    data.contributors.push(contributor);
    const session = createOrResumeSession({
      contributorId: contributor.id,
      recipeSlug: "robot-home-commands-v1",
      environmentType: "Indoor, quiet",
      microphoneDistance: "Near: under 30 cm",
      expectedInterruptions: false,
    });
    const assignment = data.assignments.find((candidate) => candidate.sessionId === session.id)!;
    const recording = submitRecording({
      sessionId: session.id,
      assignmentId: assignment.id,
      contributorTranscript: "Pick up the red cup.",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/webm",
      durationMs: 1200,
      silenceWarning: false,
      clippingWarning: false,
    });
    saveReview({
      recordingId: recording.id,
      reviewedTranscript: "Pick up the red cup.",
      decision: "accepted",
      qualityFlags: ["Acceptable"],
      audioQualityScore: 5,
      commandComplianceScore: 5,
      transcriptConfidenceScore: 5,
    });
    const run = createEvaluationRun({
      recipeId: session.recipeId,
      name: "Legacy run",
      modelConfigIds: ["model_mock_echo"],
    });
    const result = createSttResult({
      evaluationRunId: run.id,
      sttModelConfigId: "model_mock_echo",
      recordingId: recording.id,
      status: "completed",
      hypothesis: "Pick up the red cup.",
      completedAt: new Date().toISOString(),
    });
    createMetric({
      sttResultId: result.id,
      referenceNormalized: "pick up the red cup",
      hypothesisNormalized: "pick up the red cup",
      wordErrorRate: 0,
      characterErrorRate: 0,
      exactMatch: true,
      insertions: 0,
      deletions: 0,
      substitutions: 0,
      referenceWordCount: 5,
      referenceCharacterCount: 15,
    });

    const report = await getEvaluationReport(run.id);

    expect(report?.summary.overallMer).toBe(0);
    expect(report?.rows[0]?.metric?.mixedErrorRate).toBeUndefined();
    expect(report?.slices.some((slice) => slice.label === "Linguistic category" && slice.name === "short_utterance")).toBe(true);
  });
});
