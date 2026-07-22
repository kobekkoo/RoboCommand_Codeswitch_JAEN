import {
  createMetric,
  createEvaluationRun,
  createOrResumeSession,
  createSttResult,
  getData,
  getSessionView,
  recordContributorConsent,
  resetDemoData,
  saveReview,
  skipAssignment,
  submitRecording,
  updateContributorProfile,
} from "@/lib/data/store";
import { CONSENT_VERSION, type CommandLanguage, type EnvironmentType, type MicrophoneDistance } from "@/lib/domain";
import { linguisticCategoryForRecording, processNextEvaluationItem } from "@/lib/stt/evaluation";
import { calculateTranscriptMetrics } from "@/lib/stt/metrics";

const sampleRate = 16_000;

type DemoContributorProfile = {
  primaryLanguage: CommandLanguage;
  additionalLanguages?: string;
  accentRegion?: string;
  ageBand: string;
  voiceAssistantFamiliarity: "none" | "occasional" | "frequent" | "prefer_not_to_say";
  defaultDeviceCategory: "phone" | "laptop" | "tablet" | "desktop" | "prefer_not_to_say";
  headphonesOrExternalMic: "yes" | "no" | "prefer_not_to_say";
};

const demoProfiles: DemoContributorProfile[] = [
  {
    primaryLanguage: "English",
    additionalLanguages: "Japanese beginner",
    accentRegion: "US West",
    ageBand: "25-34",
    voiceAssistantFamiliarity: "frequent",
    defaultDeviceCategory: "phone",
    headphonesOrExternalMic: "no",
  },
  {
    primaryLanguage: "Japanese",
    additionalLanguages: "English",
    accentRegion: "Kanto",
    ageBand: "35-44",
    voiceAssistantFamiliarity: "occasional",
    defaultDeviceCategory: "laptop",
    headphonesOrExternalMic: "yes",
  },
  {
    primaryLanguage: "English-Japanese",
    additionalLanguages: "English, Japanese",
    accentRegion: "Bilingual broad",
    ageBand: "18-24",
    voiceAssistantFamiliarity: "frequent",
    defaultDeviceCategory: "tablet",
    headphonesOrExternalMic: "prefer_not_to_say",
  },
  {
    primaryLanguage: "English",
    additionalLanguages: "Prefer not to say",
    accentRegion: "UK broad",
    ageBand: "45-54",
    voiceAssistantFamiliarity: "none",
    defaultDeviceCategory: "desktop",
    headphonesOrExternalMic: "yes",
  },
];

const demoConditions: Array<{
  environmentType: EnvironmentType;
  backgroundNoise: string;
  microphoneDistance: MicrophoneDistance;
  deviceCategory: string;
  expectedInterruptions: boolean;
}> = [
  {
    environmentType: "Indoor, quiet",
    backgroundNoise: "none",
    microphoneDistance: "Near: under 30 cm",
    deviceCategory: "phone in hand",
    expectedInterruptions: false,
  },
  {
    environmentType: "Indoor, moderate background noise",
    backgroundNoise: "fan and distant conversation",
    microphoneDistance: "Medium: 30-100 cm",
    deviceCategory: "laptop on desk",
    expectedInterruptions: false,
  },
  {
    environmentType: "Outdoor, traffic",
    backgroundNoise: "passing cars",
    microphoneDistance: "Medium: 30-100 cm",
    deviceCategory: "phone held near chest",
    expectedInterruptions: true,
  },
  {
    environmentType: "Outdoor, crowd or conversation",
    backgroundNoise: "nearby conversation",
    microphoneDistance: "Far: over 100 cm",
    deviceCategory: "tablet on table",
    expectedInterruptions: true,
  },
];

function nowMinus(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function synthesizeWavTone(durationMs: number, frequencyHz: number, amplitude: number) {
  const sampleCount = Math.floor((durationMs / 1000) * sampleRate);
  const dataBytes = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(1, index / 400, (sampleCount - index) / 400);
    const sample = Math.sin((index / sampleRate) * frequencyHz * Math.PI * 2) * amplitude * envelope;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

function referenceForPrompt(prompt: { exactText?: string; language: string; targetIntent: string; displayInstruction: string }) {
  if (prompt.exactText) return prompt.exactText;
  if (prompt.language === "Japanese") {
    if (prompt.targetIntent.includes("bring")) return "青いボトルを持ってきてください。";
    if (prompt.targetIntent.includes("locate")) return "棚の上の鍵を探してください。";
    return "ロボットに自然な日本語でお願いしました。";
  }
  if (prompt.language === "English-Japanese") {
    if (prompt.targetIntent.includes("clean")) return "Table をきれいに wipe して。";
    if (prompt.targetIntent.includes("stop")) return "Sofa の近くで stop して。";
    return "その bottle を table の上に置いて。";
  }
  if (prompt.targetIntent.includes("clean")) return "Please wipe up the small spill on the table.";
  if (prompt.targetIntent.includes("pour")) return "Could you pour some water into the cup?";
  if (prompt.targetIntent.includes("locate")) return "Find the remote and bring it to me.";
  return prompt.displayInstruction.replace(/\.$/, "");
}

function ensureNoisyMockModel() {
  const data = getData();
  const existing = data.modelConfigs.find((model) => model.id === "model_mock_noisy");
  if (existing) return existing;
  const model = {
    id: "model_mock_noisy",
    provider: "mock" as const,
    displayName: "Mock Noisy",
    modelIdentifier: "mock-noisy",
    configurationJson: { deterministic: true, dropsFirstWord: true },
    isEnabled: true,
    createdAt: new Date().toISOString(),
  };
  data.modelConfigs.push(model);
  return model;
}

export async function seedDemoAudioData() {
  const data = resetDemoData();
  const recipe = data.recipes.find((candidate) => candidate.slug === "robot-home-commands-v1");
  if (!recipe) throw new Error("Seed recipe not found.");
  const noisyModel = ensureNoisyMockModel();
  const contributorsCreated: string[] = [];
  let recordingsCreated = 0;
  let accepted = 0;
  let rejected = 0;
  let pending = 0;
  let skipped = 0;

  demoProfiles.forEach((profile, profileIndex) => {
    const contributor = {
      id: `demo_contributor_${profileIndex + 1}`,
      publicCode: `DEMO-${profileIndex + 1}`,
      consentVersion: CONSENT_VERSION,
      consentedAt: nowMinus(220 - profileIndex * 20),
      createdAt: nowMinus(240 - profileIndex * 20),
    };
    data.contributors.push(contributor);
    recordContributorConsent(contributor.id);
    updateContributorProfile(contributor.id, profile);
    contributorsCreated.push(contributor.id);

    const condition = demoConditions[profileIndex % demoConditions.length]!;
    const session = createOrResumeSession({
      contributorId: contributor.id,
      recipeSlug: recipe.slug,
      ...condition,
      deviceMetadataJson: {
        demo: true,
        userAgent: "CommandLoop synthetic fixture",
      },
    });
    const view = getSessionView(session.id);
    if (!view) throw new Error("Could not create demo session.");

    view.assignments.forEach((assignment, assignmentIndex) => {
      if ((profileIndex + assignmentIndex) % 11 === 0) {
        skipAssignment({
          sessionId: session.id,
          assignmentId: assignment.id,
          skipReason: "Synthetic fixture skipped to exercise dashboard completion math.",
        });
        skipped += 1;
        return;
      }

      const durationMs = 1300 + ((profileIndex * 7 + assignmentIndex * 3) % 9) * 420;
      const amplitude = profileIndex === 3 ? 0.96 : 0.18 + ((assignmentIndex % 5) * 0.12);
      const bytes = synthesizeWavTone(durationMs, 180 + profileIndex * 70 + assignmentIndex * 11, amplitude);
      const reviewedTranscript = referenceForPrompt(assignment.prompt);
      const transcriptVariant =
        assignmentIndex % 7 === 0 ? reviewedTranscript.replace(/^(\S+\s*)/u, "") || reviewedTranscript : reviewedTranscript;
      const recording = submitRecording({
        sessionId: session.id,
        assignmentId: assignment.id,
        contributorTranscript: transcriptVariant,
        bytes,
        mimeType: "audio/wav",
        durationMs,
        audioSampleRateHz: sampleRate,
        channelCount: 1,
        clientRms: Math.min(1, amplitude * 0.58),
        clientPeak: Math.min(1, amplitude),
        silenceWarning: amplitude < 0.04,
        clippingWarning: amplitude > 0.94,
      });
      recording.submittedAt = nowMinus(180 - profileIndex * 32 - assignmentIndex * 3);
      recordingsCreated += 1;

      if ((profileIndex + assignmentIndex) % 9 === 0) {
        saveReview({
          recordingId: recording.id,
          reviewedTranscript,
          decision: "rejected",
          qualityFlags: amplitude > 0.94 ? ["Clipped or distorted"] : ["Transcript mismatch"],
          rejectionReason: amplitude > 0.94 ? "Synthetic clipping fixture." : "Synthetic transcript mismatch fixture.",
          audioQualityScore: amplitude > 0.94 ? 2 : 3,
          commandComplianceScore: 2,
          transcriptConfidenceScore: 2,
          reviewerNotes: "Demo data generated for dashboard review states.",
        });
        rejected += 1;
        return;
      }

      if ((profileIndex + assignmentIndex) % 8 === 0) {
        pending += 1;
        return;
      }

      saveReview({
        recordingId: recording.id,
        reviewedTranscript,
        decision: "accepted",
        qualityFlags: amplitude > 0.75 ? ["Excessive background noise"] : ["Acceptable"],
        audioQualityScore: amplitude > 0.75 ? 3 : 4 + (assignmentIndex % 2),
        commandComplianceScore: 4,
        transcriptConfidenceScore: 4,
        reviewerNotes: "Synthetic accepted fixture.",
      });
      accepted += 1;
    });
  });

  const run = createEvaluationRun({
    recipeId: recipe.id,
    name: "Synthetic dashboard smoke evaluation",
    modelConfigIds: ["model_mock_echo", noisyModel.id],
    filters: { fixture: "synthetic-audio" },
  });

  while (run.status !== "completed") {
    await processNextEvaluationItem(run.id);
  }

  const failureAnalysisRunId = seedFailureAnalysisFixtures(recipe.slug);

  return {
    contributorsCreated: contributorsCreated.length,
    sessionsCreated: contributorsCreated.length,
    recordingsCreated,
    accepted,
    rejected,
    pending,
    skipped,
    evaluationRunId: run.id,
    failureAnalysisRunId,
    sttResultsCreated: getData().sttResults.filter((result) => result.evaluationRunId === run.id).length,
  };
}

type FailureFixture = {
  id: string;
  reference: string;
  hypothesis: string;
  validity?: Parameters<typeof submitRecording>[0]["inputValidity"];
  environmentType: EnvironmentType;
  backgroundNoise: string;
  microphoneDistance: MicrophoneDistance;
  clientRms: number;
  clientPeak: number;
  silenceWarning?: boolean;
  clippingWarning?: boolean;
  profile: DemoContributorProfile;
};

function seedFailureAnalysisFixtures(recipeSlug: string) {
  const data = getData();
  const fixtures: FailureFixture[] = [
    {
      id: "red_mug_to_mat",
      reference: "Pick up the red mug.",
      hypothesis: "pick up the red mat",
      environmentType: "Indoor, quiet",
      backgroundNoise: "none",
      microphoneDistance: "Near: under 30 cm",
      clientRms: 0.14,
      clientPeak: 0.42,
      profile: demoProfiles[0]!,
    },
    {
      id: "left_to_right",
      reference: "Turn left at the doorway.",
      hypothesis: "turn right at the doorway",
      environmentType: "Indoor, quiet",
      backgroundNoise: "none",
      microphoneDistance: "Near: under 30 cm",
      clientRms: 0.16,
      clientPeak: 0.39,
      profile: demoProfiles[0]!,
    },
    {
      id: "two_to_three",
      reference: "Bring two towels to the cart.",
      hypothesis: "bring three towels to the cart",
      environmentType: "Indoor, moderate background noise",
      backgroundNoise: "fan noise",
      microphoneDistance: "Medium: 30-100 cm",
      clientRms: 0.19,
      clientPeak: 0.51,
      profile: demoProfiles[1]!,
    },
    {
      id: "self_correction_deletion",
      reference: "Um bring the red mug, actually the blue bottle.",
      hypothesis: "um bring the red mug the bottle",
      environmentType: "Indoor, loud",
      backgroundNoise: "machinery noise",
      microphoneDistance: "Far: over 100 cm",
      clientRms: 0.28,
      clientPeak: 0.82,
      profile: demoProfiles[2]!,
    },
    {
      id: "machinery_false_actionable",
      reference: "",
      hypothesis: "pick up the metal tray",
      validity: "background_noise",
      environmentType: "Indoor, loud",
      backgroundNoise: "machinery noise",
      microphoneDistance: "Far: over 100 cm",
      clientRms: 0.31,
      clientPeak: 0.88,
      profile: demoProfiles[3]!,
    },
    {
      id: "silence_empty",
      reference: "",
      hypothesis: "",
      validity: "silence",
      environmentType: "Indoor, quiet",
      backgroundNoise: "none",
      microphoneDistance: "Near: under 30 cm",
      clientRms: 0.001,
      clientPeak: 0.004,
      silenceWarning: true,
      profile: demoProfiles[1]!,
    },
    {
      id: "quiet_scripted_good",
      reference: "Please place the cup on the table.",
      hypothesis: "please place the cup on the table",
      environmentType: "Indoor, quiet",
      backgroundNoise: "none",
      microphoneDistance: "Near: under 30 cm",
      clientRms: 0.15,
      clientPeak: 0.37,
      profile: demoProfiles[0]!,
    },
  ];

  const createdRecordings = fixtures.map((fixture, index) => {
    const contributor = {
      id: `demo_failure_contributor_${fixture.id}`,
      publicCode: `FAIL-${index + 1}`,
      consentVersion: CONSENT_VERSION,
      consentedAt: nowMinus(80 - index),
      createdAt: nowMinus(90 - index),
    };
    data.contributors.push(contributor);
    updateContributorProfile(contributor.id, fixture.profile);
    const session = createOrResumeSession({
      contributorId: contributor.id,
      recipeSlug,
      environmentType: fixture.environmentType,
      backgroundNoise: fixture.backgroundNoise,
      microphoneDistance: fixture.microphoneDistance,
      deviceCategory: "demo fixture microphone",
      expectedInterruptions: fixture.backgroundNoise !== "none",
      deviceMetadataJson: { demoFailureFixture: fixture.id },
    });
    const assignment = data.assignments.find((candidate) => candidate.sessionId === session.id);
    if (!assignment) throw new Error("Could not create failure fixture assignment.");
    const bytes = synthesizeWavTone(1800 + index * 130, 260 + index * 40, Math.max(0.01, fixture.clientRms));
    const recording = submitRecording({
      sessionId: session.id,
      assignmentId: assignment.id,
      contributorTranscript: fixture.reference,
      bytes,
      mimeType: "audio/wav",
      durationMs: 1800 + index * 130,
      audioSampleRateHz: sampleRate,
      channelCount: 1,
      clientRms: fixture.clientRms,
      clientPeak: fixture.clientPeak,
      silenceWarning: Boolean(fixture.silenceWarning),
      clippingWarning: Boolean(fixture.clippingWarning),
      inputValidity: fixture.validity ?? "valid_command",
    });
    const review = saveReview({
      recordingId: recording.id,
      reviewedTranscript: fixture.reference || "Invalid input fixture",
      decision: "accepted",
      qualityFlags: fixture.validity === "valid_command" || !fixture.validity ? ["Acceptable"] : ["Other"],
      audioQualityScore: fixture.silenceWarning ? 1 : fixture.backgroundNoise === "none" ? 5 : 2,
      commandComplianceScore: fixture.validity === "valid_command" || !fixture.validity ? 5 : 1,
      transcriptConfidenceScore: fixture.hypothesis ? 3 : 1,
      reviewerNotes: `Failure-analysis demo fixture: ${fixture.id}.`,
    });
    return { fixture, recording, review };
  });

  const run = createEvaluationRun({
    recipeId: data.recipes.find((recipe) => recipe.slug === recipeSlug)!.id,
    name: "P1 failure analysis demo evaluation",
    modelConfigIds: ["model_mock_echo"],
    filters: { fixture: "p1-failure-analysis" },
  });
  run.selectedRecordingIds = createdRecordings.map(({ recording }) => recording.id);
  run.totalRecordings = createdRecordings.length;

  for (const { fixture, recording, review } of createdRecordings) {
    const result = createSttResult({
      evaluationRunId: run.id,
      sttModelConfigId: "model_mock_echo",
      recordingId: recording.id,
      status: "completed",
      hypothesis: fixture.hypothesis,
      detectedLanguage: "en",
      latencyMs: 350,
      providerResponseJson: { fixture: fixture.id },
      completedAt: new Date().toISOString(),
    });
    const metrics = calculateTranscriptMetrics(fixture.reference, fixture.hypothesis, run.normalizationProfileJson);
    const prompt = data.prompts.find((candidate) => candidate.id === recording.promptId);
    createMetric({
      sttResultId: result.id,
      referenceNormalized: metrics.referenceNormalized,
      hypothesisNormalized: metrics.hypothesisNormalized,
      wordErrorRate: metrics.wordErrorRate,
      characterErrorRate: metrics.characterErrorRate,
      mixedErrorRate: metrics.mixedErrorRate,
      overgenerationRate: metrics.overgenerationRate,
      exactMatch: metrics.exactMatch,
      insertions: metrics.insertions,
      deletions: metrics.deletions,
      substitutions: metrics.substitutions,
      referenceWordCount: metrics.referenceWordCount,
      referenceCharacterCount: metrics.referenceCharacterCount,
      semanticRiskFlags: metrics.semanticRiskFlags,
      linguisticCategory: linguisticCategoryForRecording({ prompt, recording, review }),
    });
  }
  run.status = "completed";
  run.completedRecordings = createdRecordings.length;
  run.failedRecordings = 0;
  run.completedAt = new Date().toISOString();
  return run.id;
}
