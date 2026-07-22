import { describe, expect, it } from "vitest";
import {
  createEvalDataset,
  createOrResumeSession,
  getData,
  resetDemoData,
  saveReview,
  submitRecording,
} from "@/lib/data/store";
import { promotePlaygroundSession, runPlaygroundPreview } from "@/lib/evals/playground";

describe("evaluation playground", () => {
  it("runs previews without creating permanent experiment rows", async () => {
    const recordingId = createAcceptedRecording("contributor_preview", "Pick up the red cup.");
    const dataset = createEvalDataset({
      name: "Preview dataset",
      recipeId: "recipe_robot_home_v1",
      recordingIds: [recordingId],
    });

    const session = await runPlaygroundPreview({
      evalDatasetId: dataset.id,
      sampleSize: 1,
      modelConfigIds: ["model_mock_echo"],
      scorerConfigIds: ["scorer_transcript_core"],
    });

    expect(session.resultsJson).toHaveLength(1);
    expect(session.resultsJson[0]?.status).toBe("completed");
    expect(session.resultsJson[0]?.scores.mer).toBe(0);
    expect(getData().evaluationRuns).toHaveLength(0);
    expect(getData().sttResults).toHaveLength(0);
  });

  it("promotes playground sessions into immutable experiments", async () => {
    const recordingId = createAcceptedRecording("contributor_promote", "Open the drawer.");
    const dataset = createEvalDataset({
      name: "Promote dataset",
      recipeId: "recipe_robot_home_v1",
      recordingIds: [recordingId],
    });
    const session = await runPlaygroundPreview({
      evalDatasetId: dataset.id,
      sampleSize: 1,
      modelConfigIds: ["model_mock_echo"],
      scorerConfigIds: ["scorer_transcript_core", "scorer_command_fidelity_judge"],
    });

    const run = await promotePlaygroundSession({ playgroundSessionId: session.id, name: "Promoted experiment" });
    const snapshot = getData().experimentSnapshots.find((candidate) => candidate.evaluationRunId === run.id);

    expect(run.name).toBe("Promoted experiment");
    expect(run.totalRecordings).toBe(1);
    expect(run.completedRecordings).toBe(1);
    expect(run.status).toBe("completed");
    expect(snapshot?.evalDatasetId).toBe(dataset.id);
    expect(snapshot?.scorerConfigIds).toEqual(["scorer_transcript_core", "scorer_command_fidelity_judge"]);
    expect(getData().playgroundSessions.find((candidate) => candidate.id === session.id)?.promotedEvaluationRunId).toBe(run.id);
    expect(getData().sttResults).toMatchObject([
      {
        evaluationRunId: run.id,
        sttModelConfigId: "model_mock_echo",
        recordingId,
        status: "completed",
        hypothesis: "Pick up the red cup.",
      },
    ]);
    expect(getData().metrics).toHaveLength(1);
    expect(getData().metrics[0]?.scorerScoresJson).toMatchObject({ wer: 0, cer: 0, mer: 0 });
  });

  it("runs and promotes STT-only playground sessions without requiring scorers", async () => {
    const recordingId = createAcceptedRecording("contributor_stt_only", "Walk to the kitchen.");
    const dataset = createEvalDataset({
      name: "STT only dataset",
      recipeId: "recipe_robot_home_v1",
      recordingIds: [recordingId],
    });

    const session = await runPlaygroundPreview({
      evalDatasetId: dataset.id,
      sampleSize: 1,
      modelConfigIds: ["model_mock_echo"],
      scorerConfigIds: [],
    });

    expect(session.scorerConfigIds).toEqual([]);
    expect(session.resultsJson[0]).toMatchObject({
      status: "completed",
      hypothesis: "Pick up the red cup.",
      scores: {},
      scorerOutputs: [],
    });

    const run = await promotePlaygroundSession({ playgroundSessionId: session.id, name: "STT only experiment" });
    expect(run.completedRecordings).toBe(1);
    expect(run.status).toBe("completed");
    expect(getData().sttResults).toHaveLength(1);
    expect(getData().metrics).toHaveLength(0);
  });

  it("runs text-only imported rows through mock models with scorer attribution", async () => {
    resetDemoData();
    const dataset = createEvalDataset({
      name: "Imported text dataset",
      rows: [
        {
          id: "import-row-1",
          source: "import",
          inputText: "Ask the robot to clean the table using English and Japanese.",
          humanTranscript: "Clean the table. テーブルを綺麗にして。",
          expectedText: "Clean the table. テーブルを綺麗にして。",
          tags: ["code-switching"],
          metadataJson: { language: "English-Japanese" },
          rowOrder: 0,
        },
      ],
    });

    const session = await runPlaygroundPreview({
      evalDatasetId: dataset.id,
      sampleSize: 1,
      modelConfigIds: ["model_mock_echo"],
      scorerConfigIds: ["scorer_transcript_core"],
    });

    expect(session.sampleRecordingIds).toEqual(["import-row-1"]);
    expect(session.resultsJson[0]).toMatchObject({
      rowId: "import-row-1",
      humanTranscript: "Clean the table. テーブルを綺麗にして。",
      hypothesis: "Clean the table. テーブルを綺麗にして。",
      status: "completed",
    });
    expect(session.resultsJson[0]?.scorerOutputs?.[0]).toMatchObject({
      scorerName: "Transcript Core Metrics",
      scores: { wer: 0, cer: 0, mer: 0 },
    });
  });
});

function createAcceptedRecording(contributorId: string, transcript: string) {
  const data = resetDemoData();
  data.contributors.push({ id: contributorId, publicCode: contributorId.toUpperCase(), createdAt: new Date().toISOString() });
  const session = createOrResumeSession({
    contributorId,
    recipeSlug: "robot-home-commands-v1",
    environmentType: "Indoor, quiet",
    microphoneDistance: "Near: under 30 cm",
    expectedInterruptions: false,
  });
  const assignment = data.assignments.find((candidate) => candidate.sessionId === session.id)!;
  const recording = submitRecording({
    sessionId: session.id,
    assignmentId: assignment.id,
    contributorTranscript: transcript,
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "audio/webm",
    durationMs: 1200,
    silenceWarning: false,
    clippingWarning: false,
  });
  saveReview({
    recordingId: recording.id,
    reviewedTranscript: transcript,
    decision: "accepted",
    qualityFlags: ["Acceptable"],
    audioQualityScore: 5,
    commandComplianceScore: 5,
    transcriptConfidenceScore: 5,
  });
  return recording.id;
}
