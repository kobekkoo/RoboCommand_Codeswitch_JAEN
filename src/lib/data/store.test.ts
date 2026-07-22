import { describe, expect, it } from "vitest";
import {
  createEvalDataset,
  createEvaluationRun,
  createOrResumeSession,
  createScorerConfig,
  getData,
  resetDemoData,
  saveReview,
  selectPromptAssignments,
  submitRecording,
} from "@/lib/data/store";
import { robotCsHouseholdPrompts, robotCsHouseholdRecipeId, seedPrompts } from "@/lib/data/seed";

describe("assignment selection", () => {
  it("does not assign duplicate prompts in one session", () => {
    const selected = selectPromptAssignments(seedPrompts, new Set(), 12);
    expect(new Set(selected.map((prompt) => prompt.id)).size).toBe(selected.length);
  });

  it("prefers prompts the contributor has not already completed", () => {
    resetDemoData();
    const completed = new Set(seedPrompts.slice(0, 6).map((prompt) => prompt.id));
    const selected = selectPromptAssignments(seedPrompts, completed, 6);
    expect(selected.some((prompt) => completed.has(prompt.id))).toBe(false);
  });

  it("loads the RobotCS household recipe with code-switch level coverage", () => {
    const data = resetDemoData();
    const recipe = data.recipes.find((candidate) => candidate.id === robotCsHouseholdRecipeId);
    const prompts = data.prompts.filter((prompt) => prompt.recipeId === robotCsHouseholdRecipeId);

    expect(recipe?.slug).toBe("robot-cs-household-en-ja-v1");
    expect(recipe?.supportedLanguages).toEqual(["English-Japanese"]);
    expect(prompts).toHaveLength(robotCsHouseholdPrompts.length);
    expect(new Set(prompts.map((prompt) => prompt.slotsJson.codeSwitchLevel))).toEqual(
      new Set(["word", "phrase", "sentence", "speech"]),
    );
    expect(prompts.every((prompt) => prompt.language === "English-Japanese")).toBe(true);
  });

  it("snapshots accepted recordings into reusable eval datasets", () => {
    const data = resetDemoData();
    const recordingId = createAcceptedRecording("contributor_dataset_a", "Pick up the red cup.");

    const dataset = createEvalDataset({
      name: "Smoke dataset",
      recipeId: "recipe_robot_home_v1",
      recordingIds: [recordingId, "not_accepted"],
      filters: { language: "English" },
      tags: ["smoke"],
    });
    createAcceptedRecording("contributor_dataset_b", "Open the drawer.");

    expect(dataset.recordingIds).toEqual([recordingId]);
    expect(dataset.rowCount).toBe(1);
    expect(dataset.selectionFiltersJson).toEqual({ language: "English" });
    expect(data.evalDatasets).toHaveLength(1);
  });

  it("creates scorer configs and experiment snapshots for dataset-backed experiments", () => {
    resetDemoData();
    const recordingId = createAcceptedRecording("contributor_experiment", "Pick up the red cup.");
    const dataset = createEvalDataset({
      name: "Regression dataset",
      recipeId: "recipe_robot_home_v1",
      recordingIds: [recordingId],
    });
    const scorer = createScorerConfig({
      name: "Object preservation",
      scorerType: "llm_judge",
      description: "Checks whether command objects are preserved.",
      metricKeys: ["command_fidelity"],
      rubricText: "Score object preservation from 0 to 1.",
      judgeModel: "gpt-4o-mini",
    });

    const run = createEvaluationRun({
      recipeId: "recipe_robot_home_v1",
      name: "Dataset-backed experiment",
      modelConfigIds: ["model_mock_echo"],
      recordingIds: dataset.recordingIds,
      evalDatasetId: dataset.id,
      scorerConfigIds: [scorer.id],
      taskConfigJson: { languageHintMode: "prompt_language" },
    });
    const snapshot = getData().experimentSnapshots.find((candidate) => candidate.evaluationRunId === run.id);

    expect(run.totalRecordings).toBe(1);
    expect(snapshot?.evalDatasetId).toBe(dataset.id);
    expect(snapshot?.scorerConfigIds).toEqual([scorer.id]);
    expect(snapshot?.frozenDatasetJson).toMatchObject({ id: dataset.id, rowCount: 1 });
  });
});

function createAcceptedRecording(contributorId: string, transcript: string) {
  const data = getData();
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
