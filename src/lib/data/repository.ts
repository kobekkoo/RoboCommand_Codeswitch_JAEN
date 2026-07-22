import type { Contributor } from "@/lib/domain";
import { getEnv } from "@/lib/env";
import * as memory from "@/lib/data/store";
import * as supabase from "@/lib/data/supabase-store";

export { resetDemoData, selectPromptAssignments } from "@/lib/data/store";

export function isSupabaseBacked() {
  if (process.env.COMMANDLOOP_DATA_BACKEND === "memory") return false;
  if (process.env.NODE_ENV === "test") return false;
  return getEnv().hasSupabase;
}

const repo = () => (isSupabaseBacked() ? supabase : memory);

export async function getData() {
  return repo().getData();
}

export async function publicSnapshot() {
  return repo().publicSnapshot();
}

export async function getOrCreateContributor(existingContributorId?: string) {
  return repo().getOrCreateContributor(existingContributorId);
}

export async function recordContributorConsent(contributorId: string) {
  return repo().recordContributorConsent(contributorId);
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
  return repo().updateContributorProfile(contributorId, profile);
}

export async function getActiveRecipes() {
  return repo().getActiveRecipes();
}

export async function getRecipeBySlug(slug: string) {
  return repo().getRecipeBySlug(slug);
}

export async function getRecipeById(recipeId: string) {
  return repo().getRecipeById(recipeId);
}

export async function getPromptsForRecipe(recipeId: string) {
  return repo().getPromptsForRecipe(recipeId);
}

export async function createOrResumeSession(input: Parameters<typeof memory.createOrResumeSession>[0]) {
  return repo().createOrResumeSession(input);
}

export async function markSessionInProgress(sessionId: string) {
  return repo().markSessionInProgress(sessionId);
}

export async function getSessionView(sessionId: string) {
  return repo().getSessionView(sessionId);
}

export async function submitRecording(input: Parameters<typeof memory.submitRecording>[0]) {
  return repo().submitRecording(input);
}

export async function skipAssignment(input: Parameters<typeof memory.skipAssignment>[0]) {
  return repo().skipAssignment(input);
}

export async function getAudioObject(recordingId: string) {
  return repo().getAudioObject(recordingId);
}

export async function uploadEvalDatasetAudio(input: Parameters<typeof memory.uploadEvalDatasetAudio>[0]) {
  return repo().uploadEvalDatasetAudio(input);
}

export async function getEvalDatasetAudioObject(storagePath: string) {
  return repo().getEvalDatasetAudioObject(storagePath);
}

export async function getRecordingDetail(recordingId: string) {
  return repo().getRecordingDetail(recordingId);
}

export async function getReviewQueue() {
  return repo().getReviewQueue();
}

export async function saveReview(input: Parameters<typeof memory.saveReview>[0]) {
  return repo().saveReview(input);
}

export async function acceptedRecordingsForEvaluation(recipeId?: string) {
  return repo().acceptedRecordingsForEvaluation(recipeId);
}

export async function createEvalDataset(input: Parameters<typeof memory.createEvalDataset>[0]) {
  return repo().createEvalDataset(input);
}

export async function getScorerConfigs() {
  return repo().getScorerConfigs();
}

export async function createScorerConfig(input: Parameters<typeof memory.createScorerConfig>[0]) {
  return repo().createScorerConfig(input);
}

export async function updateScorerConfig(input: Parameters<typeof memory.updateScorerConfig>[0]) {
  return repo().updateScorerConfig(input);
}

export async function createPlaygroundSession(input: Parameters<typeof memory.createPlaygroundSession>[0]) {
  return repo().createPlaygroundSession(input);
}

export async function markPlaygroundPromoted(playgroundSessionId: string, evaluationRunId: string) {
  return repo().markPlaygroundPromoted(playgroundSessionId, evaluationRunId);
}

export async function getModelConfigs() {
  return repo().getModelConfigs();
}

export async function createEvaluationRun(input: Parameters<typeof memory.createEvaluationRun>[0]) {
  return repo().createEvaluationRun(input);
}

export async function deleteEvaluationRun(runId: string) {
  return repo().deleteEvaluationRun(runId);
}

export async function renameEvaluationRun(runId: string, name: string) {
  return repo().renameEvaluationRun(runId, name);
}

export async function clearFailedEvaluationResults(runId: string) {
  return repo().clearFailedEvaluationResults(runId);
}

export async function markEvaluationRunRunning(runId: string) {
  if (isSupabaseBacked()) return supabase.markEvaluationRunRunning(runId);
  const data = memory.getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  run.status = "running";
  run.startedAt = run.startedAt ?? new Date().toISOString();
  return run;
}

export async function markEvaluationRunCompleted(runId: string) {
  if (isSupabaseBacked()) return supabase.markEvaluationRunCompleted(runId);
  const data = memory.getData();
  const run = data.evaluationRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new Error("Evaluation run not found.");
  run.status = "completed";
  run.completedAt = new Date().toISOString();
  return run;
}

export async function updateEvaluationProgress(runId: string) {
  return repo().updateEvaluationProgress(runId);
}

export async function createSttResult(input: Parameters<typeof memory.createSttResult>[0]) {
  return repo().createSttResult(input);
}

export async function createMetric(input: Parameters<typeof memory.createMetric>[0]) {
  return repo().createMetric(input);
}

export async function getDashboardStats() {
  return repo().getDashboardStats();
}

export async function createRecipe(input: Parameters<typeof memory.createRecipe>[0]) {
  return repo().createRecipe(input);
}

export async function updateRecipe(input: Parameters<typeof memory.updateRecipe>[0]) {
  return repo().updateRecipe(input);
}

export async function cloneRecipe(recipeId: string, options?: Parameters<typeof memory.cloneRecipe>[1]) {
  return repo().cloneRecipe(recipeId, options);
}

export async function activateRecipe(recipeId: string) {
  return repo().activateRecipe(recipeId);
}

export async function archiveRecipe(recipeId: string) {
  return repo().archiveRecipe(recipeId);
}

export async function addPromptToRecipe(input: Parameters<typeof memory.addPromptToRecipe>[0]) {
  return repo().addPromptToRecipe(input);
}

export async function updatePrompt(input: Parameters<typeof memory.updatePrompt>[0]) {
  return repo().updatePrompt(input);
}

export async function createFollowUpRecipeFromSlices(
  runId: string,
  sliceKeys: string[],
  options?: Parameters<typeof memory.createFollowUpRecipeFromSlices>[2],
) {
  return repo().createFollowUpRecipeFromSlices(runId, sliceKeys, options);
}

export async function exportAcceptedRows() {
  return repo().exportAcceptedRows();
}

export async function withdrawContributor(contributorId: string) {
  return repo().withdrawContributor(contributorId);
}

export async function removeRecording(recordingId: string) {
  return repo().removeRecording(recordingId);
}

export async function cleanupAbandonedUploads() {
  return repo().cleanupAbandonedUploads();
}
