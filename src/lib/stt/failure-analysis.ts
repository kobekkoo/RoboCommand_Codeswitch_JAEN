import {
  defaultNormalizationProfile,
  type CommandVariant,
  type InputValidity,
  type PromptMode,
  type TaskType,
} from "@/lib/domain";
import { normalizeTranscript } from "@/lib/stt/metrics";

export type AlignmentOp = {
  kind: "match" | "substitution" | "deletion" | "insertion";
  reference?: string;
  hypothesis?: string;
  referenceIndex?: number;
  hypothesisIndex?: number;
};

export type FailureAnalysisRow = {
  result: {
    id: string;
    recordingId?: string;
    status: "pending" | "completed" | "failed";
    hypothesis?: string;
    errorMessage?: string;
    latencyMs?: number;
    detectedLanguage?: string;
    providerResponseJson?: unknown;
  };
  metric?: {
    referenceNormalized: string;
    hypothesisNormalized: string;
    wordErrorRate: number;
    characterErrorRate: number;
    exactMatch: boolean;
    insertions: number;
    deletions: number;
    substitutions: number;
    referenceWordCount: number;
    mixedErrorRate?: number;
    overgenerationRate?: number;
    semanticRiskFlags?: string[];
    linguisticCategory?: string;
  };
  recording?: {
    id: string;
    contributorTranscript: string;
    durationMs?: number;
    clientRms?: number;
    clientPeak?: number;
    silenceWarning?: boolean;
    clippingWarning?: boolean;
    inputValidity?: InputValidity;
  };
  review?: {
    reviewedTranscript?: string;
    commandComplianceScore?: number;
    audioQualityScore?: number;
    semanticAnnotation?: {
      intent: string;
      slotsJson: Record<string, unknown>;
      safetySensitive: boolean;
      urgency: "normal" | "urgent" | "safety_critical";
      requiresClarification: boolean;
    };
    qualityFlags?: string[];
  };
  model?: {
    id?: string;
    displayName?: string;
    provider?: string;
  };
  prompt?: {
    id?: string;
    promptMode?: PromptMode;
    displayInstruction?: string;
    exactText?: string;
    language?: string;
    taskType?: TaskType | string;
    commandVariant?: CommandVariant | string;
    targetIntent?: string;
    slotsJson?: Record<string, unknown>;
    safetySensitive?: boolean;
    tags?: string[];
  };
  session?: {
    id?: string;
    environmentType?: string;
    backgroundNoise?: string;
    microphoneDistance?: string;
    expectedInterruptions?: boolean;
    deviceCategory?: string;
    deviceMetadataJson?: Record<string, unknown>;
  };
};

export type FailureAnalysisFilters = {
  model?: string;
  environment?: string;
  noise?: string;
  language?: string;
  commandType?: string;
  hesitation?: "yes" | "no" | "";
  selfCorrection?: "yes" | "no" | "";
};

export type ConfusionPattern = {
  id: string;
  label: string;
  kind: AlignmentOp["kind"];
  category:
    | "word"
    | "object"
    | "direction"
    | "number"
    | "action"
    | "negation"
    | "safety"
    | "hesitation"
    | "self_correction";
  reference?: string;
  hypothesis?: string;
  count: number;
  sampleCount: number;
  severity: 1 | 2 | 3;
  severityScore: number;
  limitedSample: boolean;
  examples: ConfusionExample[];
};

export type ConfusionExample = {
  rowId: string;
  recordingId: string;
  modelName: string;
  reference: string;
  hypothesis: string;
  metadata: string[];
  op: AlignmentOp;
};

export type ActionableCommandDetection = {
  isActionable: boolean;
  matchedTerms: string[];
};

export type InvalidInputQueueItem = {
  id: string;
  recordingId: string;
  validity: InputValidity;
  modelName: string;
  transcript: string;
  wordCount: number;
  insertedWords: number;
  interpretedAsValidCommand: boolean;
  matchedActionTerms: string[];
  severity: "low" | "medium" | "high";
  metadata: string[];
  row: FailureAnalysisRow;
};

export type InvalidInputAnalysis = {
  invalidCount: number;
  nonEmptyTranscriptRate: number;
  avgInsertedWordsPerInvalidClip: number;
  validCommandPredictionRate: number;
  falseActionableCommandRate: number;
  queue: InvalidInputQueueItem[];
};

export type PriorityRow = {
  key: string;
  runId?: string;
  slice: string;
  name: string;
  conditions: string[];
  sampleCount: number;
  evaluatedCount: number;
  meanWer: number;
  commandAccuracy?: number;
  intentAccuracy?: number;
  failureRate: number;
  severeFailures: number;
  falseActionableCommandRate: number;
  severityWeight: number;
  priorityScore: number;
  recommendedRecordings: number;
  action: string;
  limitedSample: boolean;
  examples: PriorityExample[];
};

export type PriorityExample = {
  rowId: string;
  recordingId: string;
  modelName: string;
  reference: string;
  hypothesis: string;
  metadata: string[];
  severity: 1 | 2 | 3;
};

export const DEFAULT_TARGET_SAMPLE_COUNT = 50;

const directionWords = new Set([
  "left",
  "right",
  "forward",
  "back",
  "backward",
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
  "clockwise",
  "counterclockwise",
  "反対",
  "左",
  "右",
  "前",
  "後ろ",
  "上",
  "下",
]);

const numberWords = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "single",
  "double",
  "triple",
  "first",
  "second",
  "third",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
]);

const objectWords = new Set([
  "cup",
  "mug",
  "mat",
  "bottle",
  "table",
  "chair",
  "door",
  "drawer",
  "shelf",
  "remote",
  "key",
  "cart",
  "bed",
  "tray",
  "spill",
  "towel",
  "cabinet",
  "medicine",
  "pill",
  "iv",
  "monitor",
  "patient",
  "robot",
  "sofa",
  "couch",
  "ボトル",
  "テーブル",
  "椅子",
  "ドア",
  "棚",
  "鍵",
  "患者",
]);

const actionTerms = [
  "pick",
  "grab",
  "take",
  "bring",
  "move",
  "go",
  "walk",
  "navigate",
  "open",
  "close",
  "stop",
  "turn",
  "place",
  "put",
  "pour",
  "clean",
  "wipe",
  "search",
  "find",
  "locate",
  "hand",
  "give",
  "carry",
  "deliver",
  "push",
  "pull",
  "lift",
  "lower",
  "hold",
  "fetch",
];

const japaneseActionTerms = [
  "持って",
  "運んで",
  "取って",
  "拾って",
  "置いて",
  "開けて",
  "閉めて",
  "止まって",
  "止めて",
  "曲がって",
  "探して",
  "掃除",
  "拭いて",
];

const safetyWords = new Set([
  "stop",
  "pause",
  "halt",
  "emergency",
  "danger",
  "hazard",
  "hot",
  "sharp",
  "fall",
  "fragile",
  "patient",
  "iv",
  "bed",
  "medicine",
  "safety",
  "危険",
  "止まって",
  "患者",
]);

const negationWords = new Set(["no", "not", "don't", "dont", "never", "without", "stop", "cancel", "やめて", "ない"]);

export function tokenizeForAlignment(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return /\s/.test(trimmed) ? trimmed.split(/\s+/) : [...trimmed];
}

export function alignTokens(reference: string[], hypothesis: string[]): AlignmentOp[] {
  const rows = reference.length + 1;
  const cols = hypothesis.length + 1;
  const dp = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

  for (let i = 0; i < rows; i += 1) dp[i]![0] = i;
  for (let j = 0; j < cols; j += 1) dp[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dp[i]![j] =
        reference[i - 1] === hypothesis[j - 1]
          ? dp[i - 1]![j - 1]!
          : Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + 1);
    }
  }

  const ops: AlignmentOp[] = [];
  let i = reference.length;
  let j = hypothesis.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && reference[i - 1] === hypothesis[j - 1]) {
      ops.push({
        kind: "match",
        reference: reference[i - 1],
        hypothesis: hypothesis[j - 1],
        referenceIndex: i - 1,
        hypothesisIndex: j - 1,
      });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + 1) {
      ops.push({
        kind: "substitution",
        reference: reference[i - 1],
        hypothesis: hypothesis[j - 1],
        referenceIndex: i - 1,
        hypothesisIndex: j - 1,
      });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      ops.push({
        kind: "deletion",
        reference: reference[i - 1],
        referenceIndex: i - 1,
      });
      i -= 1;
    } else {
      ops.push({
        kind: "insertion",
        hypothesis: hypothesis[j - 1],
        hypothesisIndex: j - 1,
      });
      j -= 1;
    }
  }

  return ops.reverse();
}

export function extractConfusionPatterns(
  rows: FailureAnalysisRow[],
  filters: FailureAnalysisFilters = {},
  rankMode: "frequency" | "severity" = "frequency",
) {
  const patterns = new Map<string, ConfusionPattern & { recordingIds: Set<string> }>();

  for (const row of rows.filter((candidate) => matchesFailureFilters(candidate, filters))) {
    const { reference, hypothesis } = normalizedPair(row);
    const ops = alignTokens(tokenizeForAlignment(reference), tokenizeForAlignment(hypothesis));
    for (const op of ops) {
      if (op.kind === "match") continue;
      addPattern(patterns, row, op, categoryForOp(op, row));
      if (hasHesitation(row)) addPattern(patterns, row, op, "hesitation");
      if (hasSelfCorrection(row)) addPattern(patterns, row, op, "self_correction");
    }
  }

  return [...patterns.values()]
    .map(({ recordingIds, ...pattern }) => ({
      ...pattern,
      sampleCount: recordingIds.size,
      limitedSample: recordingIds.size < 10,
      severityScore: pattern.count * pattern.severity,
    }))
    .sort((a, b) =>
      rankMode === "severity"
        ? b.severityScore - a.severityScore || b.count - a.count || b.sampleCount - a.sampleCount
        : b.count - a.count || b.sampleCount - a.sampleCount || b.severityScore - a.severityScore,
    );
}

function addPattern(
  patterns: Map<string, ConfusionPattern & { recordingIds: Set<string> }>,
  row: FailureAnalysisRow,
  op: AlignmentOp,
  category: ConfusionPattern["category"],
) {
  const id = `${category}:${op.kind}:${op.reference ?? ""}:${op.hypothesis ?? ""}`;
  const severity = severityForCategory(category);
  const existing =
    patterns.get(id) ??
    ({
      id,
      label: labelForPattern(category, op),
      kind: op.kind,
      category,
      reference: op.reference,
      hypothesis: op.hypothesis,
      count: 0,
      sampleCount: 0,
      severity,
      severityScore: 0,
      limitedSample: true,
      examples: [],
      recordingIds: new Set<string>(),
    } satisfies ConfusionPattern & { recordingIds: Set<string> });
  existing.count += 1;
  existing.recordingIds.add(recordingId(row));
  if (existing.examples.length < 8) {
    const { reference, hypothesis } = normalizedPair(row);
    existing.examples.push({
      rowId: row.result.id,
      recordingId: recordingId(row),
      modelName: row.model?.displayName ?? "Unknown model",
      reference,
      hypothesis,
      metadata: metadataSummary(row),
      op,
    });
  }
  patterns.set(id, existing);
}

function labelForPattern(category: ConfusionPattern["category"], op: AlignmentOp) {
  const categoryLabel = {
    word: "Word",
    object: "Object",
    direction: "Direction",
    number: "Number/quantity",
    action: "Action",
    negation: "Negation",
    safety: "Safety",
    hesitation: "After hesitation",
    self_correction: "After self-correction",
  }[category];
  if (op.kind === "substitution") return `${categoryLabel} substitution: ${displayToken(op.reference)} -> ${displayToken(op.hypothesis)}`;
  if (op.kind === "deletion") return `${categoryLabel} deletion: ${displayToken(op.reference)}`;
  if (op.kind === "insertion") return `${categoryLabel} insertion: ${displayToken(op.hypothesis)}`;
  return categoryLabel;
}

function categoryForOp(op: AlignmentOp, row: FailureAnalysisRow): ConfusionPattern["category"] {
  const tokens = [op.reference, op.hypothesis].filter((token): token is string => Boolean(token)).map(cleanToken);
  if (tokens.some((token) => safetyWords.has(token)) || row.prompt?.safetySensitive) return "safety";
  if (tokens.some((token) => negationWords.has(token))) return "negation";
  if (tokens.some((token) => directionWords.has(token))) return "direction";
  if (tokens.some(isNumberToken)) return "number";
  if (tokens.some((token) => objectWords.has(token)) || tokens.some((token) => promptSlots(row).has(token))) return "object";
  if (tokens.some((token) => actionTerms.includes(token)) || tokens.some((token) => japaneseActionTerms.includes(token))) {
    return "action";
  }
  return "word";
}

function severityForCategory(category: ConfusionPattern["category"]): 1 | 2 | 3 {
  if (category === "safety" || category === "action" || category === "negation") return 3;
  if (category === "object" || category === "direction" || category === "number") return 2;
  return 1;
}

function promptSlots(row: FailureAnalysisRow) {
  const slotTokens = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      tokenizeForAlignment(normalizeTranscript(value, defaultNormalizationProfile)).forEach((token) =>
        slotTokens.add(cleanToken(token)),
      );
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(row.prompt?.slotsJson);
  return slotTokens;
}

export function matchesFailureFilters(row: FailureAnalysisRow, filters: FailureAnalysisFilters) {
  if (!matchesValue(row.model?.displayName, filters.model)) return false;
  if (!matchesValue(row.session?.environmentType, filters.environment)) return false;
  if (!matchesValue(noiseLabel(row), filters.noise)) return false;
  if (!matchesValue(row.prompt?.language, filters.language)) return false;
  if (!matchesValue(commandTypeLabel(row), filters.commandType)) return false;
  if (filters.hesitation === "yes" && !hasHesitation(row)) return false;
  if (filters.hesitation === "no" && hasHesitation(row)) return false;
  if (filters.selfCorrection === "yes" && !hasSelfCorrection(row)) return false;
  if (filters.selfCorrection === "no" && hasSelfCorrection(row)) return false;
  return true;
}

function matchesValue(actual: string | undefined, expected: string | undefined) {
  if (!expected || expected === "all") return true;
  return (actual ?? "Unknown") === expected;
}

export function analyzeInvalidInputs(rows: FailureAnalysisRow[], filters: FailureAnalysisFilters = {}): InvalidInputAnalysis {
  const invalidRows = rows.filter((row) => matchesFailureFilters(row, filters) && inputValidity(row) !== "valid_command");
  const queue = invalidRows.map((row) => {
    const transcript = row.result.hypothesis ?? "";
    const wordCount = tokenizeForAlignment(normalizeTranscript(transcript, defaultNormalizationProfile)).length;
    const detection = detectActionableCommand(transcript, row.review?.semanticAnnotation);
    const insertedWords = row.metric?.insertions ?? wordCount;
    const severity: InvalidInputQueueItem["severity"] = detection.isActionable ? "high" : wordCount > 0 ? "medium" : "low";
    return {
      id: row.result.id,
      recordingId: recordingId(row),
      validity: inputValidity(row),
      modelName: row.model?.displayName ?? "Unknown model",
      transcript,
      wordCount,
      insertedWords,
      interpretedAsValidCommand: detection.isActionable,
      matchedActionTerms: detection.matchedTerms,
      severity,
      metadata: metadataSummary(row),
      row,
    };
  });
  const nonEmptyCount = queue.filter((item) => item.wordCount > 0).length;
  const falseActionableCount = queue.filter((item) => item.interpretedAsValidCommand).length;
  return {
    invalidCount: queue.length,
    nonEmptyTranscriptRate: queue.length ? nonEmptyCount / queue.length : 0,
    avgInsertedWordsPerInvalidClip: queue.length
      ? queue.reduce((sum, item) => sum + item.insertedWords, 0) / queue.length
      : 0,
    validCommandPredictionRate: queue.length ? falseActionableCount / queue.length : 0,
    falseActionableCommandRate: queue.length ? falseActionableCount / queue.length : 0,
    queue: queue.sort((a, b) => severityOrder(b.severity) - severityOrder(a.severity) || b.wordCount - a.wordCount),
  };
}

function severityOrder(value: InvalidInputQueueItem["severity"]) {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

export function detectActionableCommand(
  text: string,
  annotation?: NonNullable<FailureAnalysisRow["review"]>["semanticAnnotation"],
): ActionableCommandDetection {
  const normalized = normalizeTranscript(text, defaultNormalizationProfile);
  const matchedTerms = new Set<string>();
  for (const term of actionTerms) {
    const expression = new RegExp(`\\b${escapeRegExp(term)}(?:\\b|ing\\b|ed\\b|s\\b)`, "i");
    if (expression.test(normalized)) matchedTerms.add(term);
  }
  for (const term of japaneseActionTerms) {
    if (normalized.includes(term)) matchedTerms.add(term);
  }
  const intent = typeof annotation?.intent === "string" ? annotation.intent.toLocaleLowerCase("en-US") : "";
  if (intent && actionTerms.some((term) => intent.includes(term))) matchedTerms.add(intent);
  return {
    isActionable: matchedTerms.size > 0,
    matchedTerms: [...matchedTerms],
  };
}

export function buildCollectionPriorityRows(
  rows: FailureAnalysisRow[],
  options: { runId?: string; targetSampleCount?: number; filters?: FailureAnalysisFilters } = {},
) {
  const target = options.targetSampleCount ?? DEFAULT_TARGET_SAMPLE_COUNT;
  const groups = new Map<string, { slice: string; name: string; conditions: string[]; rows: FailureAnalysisRow[] }>();
  const sourceRows = rows.filter((row) => matchesFailureFilters(row, options.filters ?? {}));

  const add = (slice: string, name: string | undefined, conditions: string[], row: FailureAnalysisRow) => {
    const safeName = name || "Unknown";
    const key = `${slice}:${safeName}`;
    const group = groups.get(key) ?? { slice, name: safeName, conditions, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  };

  for (const row of sourceRows) {
    add("Environment", row.session?.environmentType, [`Environment = ${row.session?.environmentType ?? "Unknown"}`], row);
    add("Noise/SNR", noiseLabel(row), [`Noise/SNR = ${noiseLabel(row)}`], row);
    add("Language", row.prompt?.language, [`Language = ${row.prompt?.language ?? "Unknown"}`], row);
    const codeSwitchLevel = codeSwitchLevelLabel(row);
    if (codeSwitchLevel) {
      add("Code-switch level", codeSwitchLevel, [`Code-switch level = ${codeSwitchLevel}`], row);
    }
    add("Command type", commandTypeLabel(row), [`Command type = ${commandTypeLabel(row)}`], row);
    add("Hesitation", hasHesitation(row) ? "Hesitation present" : "No hesitation", [
      `Hesitation = ${hasHesitation(row) ? "present" : "absent"}`,
    ], row);
    add("Self-correction", hasSelfCorrection(row) ? "Self-correction present" : "No self-correction", [
      `Self-correction = ${hasSelfCorrection(row) ? "present" : "absent"}`,
    ], row);
    add("Multi-step", isMultiStep(row) ? "Multi-step" : "Single-step", [
      `Multi-step = ${isMultiStep(row) ? "yes" : "no"}`,
    ], row);
    add("Safety-sensitive", isSafetySensitive(row) ? "Safety-sensitive" : "Not safety-sensitive", [
      `Safety-sensitive = ${isSafetySensitive(row) ? "yes" : "no"}`,
    ], row);
    add("Distance/microphone", row.session?.microphoneDistance, [
      `Microphone distance = ${row.session?.microphoneDistance ?? "Unknown"}`,
    ], row);

    if (hasHesitation(row) && hasSelfCorrection(row)) {
      add("Combination", "Hesitation + self-correction", ["Hesitation = present", "Self-correction = present"], row);
    }
    if (hasHesitation(row) && isNoisy(row)) {
      add("Combination", "Hesitation + noise", ["Hesitation = present", `Noise/SNR = ${noiseLabel(row)}`], row);
    }
    if (hasSelfCorrection(row) && isNoisy(row)) {
      add("Combination", "Self-correction + noise", ["Self-correction = present", `Noise/SNR = ${noiseLabel(row)}`], row);
    }
    if (hasHesitation(row) && hasSelfCorrection(row) && isNoisy(row)) {
      add("Combination", "Hesitation + self-correction + noise", [
        "Hesitation = present",
        "Self-correction = present",
        `Noise/SNR = ${noiseLabel(row)}`,
      ], row);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => priorityFromGroup(key, group.slice, group.name, group.conditions, group.rows, target, options.runId))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.failureRate - a.failureRate || b.sampleCount - a.sampleCount)
    .slice(0, 24);
}

function priorityFromGroup(
  key: string,
  slice: string,
  name: string,
  conditions: string[],
  rows: FailureAnalysisRow[],
  target: number,
  runId?: string,
): PriorityRow {
  const sampleCount = new Set(rows.map(recordingId)).size || rows.length;
  const evaluated = rows.filter((row) => row.metric);
  const severities = rows.map(rowSeverity);
  const severeFailures = severities.filter((severity) => severity >= 3).length;
  const invalid = analyzeInvalidInputs(rows);
  const failureRows = rows.filter((row, index) => isFailure(row) || severities[index]! >= 3);
  const failureRate = rows.length ? failureRows.length / rows.length : 0;
  const severityWeight = rows.length ? Math.max(1, Math.max(...severities)) : 1;
  const score = priorityScore({ failureRate, severityWeight, sampleCount, targetSampleCount: target });
  const recommendedRecordings = recommendedRecordingsForSlice(sampleCount, target, severityWeight);
  const commandScores = rows
    .map((row) => row.review?.commandComplianceScore)
    .filter((score): score is number => typeof score === "number")
    .map((score) => score / 5);
  const intentMatches = rows
    .map((row) =>
      row.review?.semanticAnnotation?.intent && row.prompt?.targetIntent
        ? normalizeTranscript(row.review.semanticAnnotation.intent, defaultNormalizationProfile) ===
          normalizeTranscript(row.prompt.targetIntent, defaultNormalizationProfile)
        : undefined,
    )
    .filter((value): value is boolean => value !== undefined);

  return {
    key,
    runId,
    slice,
    name,
    conditions,
    sampleCount,
    evaluatedCount: evaluated.length,
    meanWer: mean(evaluated.map((row) => row.metric?.wordErrorRate ?? 0)),
    commandAccuracy: commandScores.length ? mean(commandScores) : undefined,
    intentAccuracy: intentMatches.length ? intentMatches.filter(Boolean).length / intentMatches.length : undefined,
    failureRate,
    severeFailures,
    falseActionableCommandRate: invalid.falseActionableCommandRate,
    severityWeight,
    priorityScore: score,
    recommendedRecordings,
    action: actionForPriority(failureRate, severityWeight, recommendedRecordings),
    limitedSample: sampleCount < 10,
    examples: rows.slice(0, 8).map((row) => {
      const { reference, hypothesis } = normalizedPair(row);
      return {
        rowId: row.result.id,
        recordingId: recordingId(row),
        modelName: row.model?.displayName ?? "Unknown model",
        reference,
        hypothesis,
        metadata: metadataSummary(row),
        severity: rowSeverity(row),
      };
    }),
  };
}

export function coverageGapWeight(sampleCount: number, targetSampleCount = DEFAULT_TARGET_SAMPLE_COUNT) {
  if (targetSampleCount <= 0) return 1;
  if (sampleCount >= targetSampleCount) return 0.25;
  return 1 + (targetSampleCount - sampleCount) / targetSampleCount;
}

export function priorityScore(input: {
  failureRate: number;
  severityWeight: number;
  sampleCount: number;
  targetSampleCount?: number;
}) {
  return input.failureRate * input.severityWeight * coverageGapWeight(input.sampleCount, input.targetSampleCount);
}

export function recommendedRecordingsForSlice(
  sampleCount: number,
  targetSampleCount = DEFAULT_TARGET_SAMPLE_COUNT,
  severityWeight = 1,
) {
  const adjustedTarget =
    severityWeight >= 3 ? Math.ceil(targetSampleCount * 1.5) : severityWeight >= 2 ? Math.ceil(targetSampleCount * 1.2) : targetSampleCount;
  return Math.max(0, adjustedTarget - sampleCount);
}

function actionForPriority(failureRate: number, severityWeight: number, recommendedRecordings: number) {
  if (severityWeight >= 3 && failureRate > 0) return "Collect targeted safety/false-actionable coverage and inspect examples first.";
  if (failureRate >= 0.3) return "Create a focused follow-up recipe for this slice.";
  if (recommendedRecordings > 0) return "Top up coverage before treating the signal as stable.";
  return "Monitor; no immediate collection top-up needed.";
}

function isFailure(row: FailureAnalysisRow) {
  if (row.result.status === "failed") return true;
  if (!row.metric) return false;
  return (
    row.metric.wordErrorRate >= 0.25 ||
    row.metric.characterErrorRate >= 0.15 ||
    (row.metric.mixedErrorRate ?? 0) >= 0.2 ||
    (row.metric.overgenerationRate ?? 0) >= 0.15 ||
    (row.metric.semanticRiskFlags?.length ?? 0) > 0
  );
}

function rowSeverity(row: FailureAnalysisRow): 1 | 2 | 3 {
  if (inputValidity(row) !== "valid_command" && detectActionableCommand(row.result.hypothesis ?? "").isActionable) return 3;
  if ((row.metric?.semanticRiskFlags?.length ?? 0) > 0) return 3;
  if (row.result.status === "failed") return isSafetySensitive(row) ? 3 : 2;
  const { reference, hypothesis } = normalizedPair(row);
  const ops = alignTokens(tokenizeForAlignment(reference), tokenizeForAlignment(hypothesis)).filter((op) => op.kind !== "match");
  const maxSeverity = ops.reduce((max, op) => Math.max(max, severityForCategory(categoryForOp(op, row))), 1);
  return Math.min(3, maxSeverity) as 1 | 2 | 3;
}

export function noiseLabel(row: FailureAnalysisRow) {
  const validity = inputValidity(row);
  if (validity === "silence" || row.recording?.silenceWarning) return "Silence";
  if (row.recording?.clippingWarning || (row.recording?.clientPeak ?? 0) > 0.97) return "Clipped/high peak";
  if ((row.recording?.clientRms ?? 1) < 0.02) return "Low signal";
  if (validity === "music") return "Music";
  const raw = `${row.session?.backgroundNoise ?? ""} ${row.session?.environmentType ?? ""}`.toLocaleLowerCase("en-US");
  if (!raw.trim()) return "Unknown";
  if (raw.includes("machine") || raw.includes("machinery")) return "Machinery noise";
  if (raw.includes("music")) return "Music";
  if (raw.includes("traffic") || raw.includes("crowd") || raw.includes("conversation") || raw.includes("loud")) {
    return "Background noise";
  }
  if (raw.includes("moderate") || raw.includes("fan") || raw.includes("noise")) return "Background noise";
  if (raw.includes("quiet") || raw.includes("none")) return "Quiet";
  return "Unknown";
}

function isNoisy(row: FailureAnalysisRow) {
  return ["Background noise", "Machinery noise", "Music", "Clipped/high peak", "Low signal"].includes(noiseLabel(row));
}

export function hasHesitation(row: FailureAnalysisRow) {
  const variant = row.prompt?.commandVariant?.toLocaleLowerCase("en-US") ?? "";
  const tags = (row.prompt?.tags ?? []).join(" ").toLocaleLowerCase("en-US");
  const text = `${row.recording?.contributorTranscript ?? ""} ${row.result.hypothesis ?? ""} ${
    row.prompt?.displayInstruction ?? ""
  }`.toLocaleLowerCase("en-US");
  return (
    variant.includes("hesitant") ||
    tags.includes("hesitation") ||
    /\b(um+|uh+|er+|ah+|えっと|あの)\b/i.test(text)
  );
}

export function hasSelfCorrection(row: FailureAnalysisRow) {
  const variant = row.prompt?.commandVariant?.toLocaleLowerCase("en-US") ?? "";
  const mode = row.prompt?.promptMode;
  const tags = (row.prompt?.tags ?? []).join(" ").toLocaleLowerCase("en-US");
  const text = `${row.recording?.contributorTranscript ?? ""} ${row.result.hypothesis ?? ""} ${
    row.prompt?.displayInstruction ?? ""
  }`.toLocaleLowerCase("en-US");
  return (
    variant.includes("self-correct") ||
    mode === "self_correction" ||
    tags.includes("self-correction") ||
    /\b(actually|i mean|sorry|correction|rather|no,|not the|やっぱり|ではなく)\b/i.test(text)
  );
}

function isMultiStep(row: FailureAnalysisRow) {
  const text = `${row.prompt?.promptMode ?? ""} ${row.prompt?.taskType ?? ""} ${row.prompt?.commandVariant ?? ""} ${
    row.prompt?.tags?.join(" ") ?? ""
  }`.toLocaleLowerCase("en-US");
  return text.includes("multi");
}

function isSafetySensitive(row: FailureAnalysisRow) {
  const text = `${row.prompt?.taskType ?? ""} ${row.prompt?.commandVariant ?? ""} ${row.prompt?.targetIntent ?? ""} ${
    row.prompt?.tags?.join(" ") ?? ""
  }`.toLocaleLowerCase("en-US");
  return Boolean(row.prompt?.safetySensitive || text.includes("safety") || text.includes("stop") || text.includes("pause"));
}

export function inputValidity(row: FailureAnalysisRow): InputValidity {
  return row.recording?.inputValidity ?? "valid_command";
}

function commandTypeLabel(row: FailureAnalysisRow) {
  return row.prompt?.taskType ?? row.prompt?.commandVariant ?? "Unknown";
}

function codeSwitchLevelLabel(row: FailureAnalysisRow) {
  const level = row.prompt?.slotsJson?.codeSwitchLevel ?? row.prompt?.slotsJson?.code_switch_level;
  if (typeof level === "string" && level.trim()) return level.trim();
  const tag = row.prompt?.tags?.find((item) => item.startsWith("cs-level:"));
  return tag?.slice("cs-level:".length);
}

function metadataSummary(row: FailureAnalysisRow) {
  const codeSwitchLevel = codeSwitchLevelLabel(row);
  return [
    row.model?.displayName ?? "Unknown model",
    row.prompt?.language ?? "Unknown language",
    ...(codeSwitchLevel ? [`code_switch_level=${codeSwitchLevel}`] : []),
    commandTypeLabel(row),
    row.prompt?.commandVariant ?? "Unknown variant",
    row.session?.environmentType ?? "Unknown environment",
    noiseLabel(row),
    row.session?.microphoneDistance ?? "Unknown mic distance",
    `input_validity=${inputValidity(row)}`,
  ];
}

function normalizedPair(row: FailureAnalysisRow) {
  const reference =
    row.metric?.referenceNormalized ??
    normalizeTranscript(row.recording?.contributorTranscript ?? row.review?.reviewedTranscript ?? "", defaultNormalizationProfile);
  const hypothesis = row.metric?.hypothesisNormalized ?? normalizeTranscript(row.result.hypothesis ?? "", defaultNormalizationProfile);
  return { reference, hypothesis };
}

function recordingId(row: FailureAnalysisRow) {
  return row.recording?.id ?? row.result.recordingId ?? row.result.id;
}

function cleanToken(token: string) {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLocaleLowerCase("en-US");
}

function displayToken(token: string | undefined) {
  if (!token) return "";
  return cleanToken(token) || token;
}

function isNumberToken(token: string) {
  return /^\d+$/.test(token) || numberWords.has(token);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function demoFailureAnalysisRows(): FailureAnalysisRow[] {
  const base = {
    model: { id: "model_demo", displayName: "Demo Whisper" },
    session: {
      environmentType: "Indoor, quiet",
      backgroundNoise: "none",
      microphoneDistance: "Near: under 30 cm",
      expectedInterruptions: false,
    },
  } satisfies Partial<FailureAnalysisRow>;
  return [
    demoRow("demo_red_mug", "Pick up the red mug.", "pick up the red mat", {
      ...base,
      prompt: {
        language: "English",
        taskType: "Pick up",
        commandVariant: "Canonical",
        displayInstruction: "Ask the robot to pick up the red mug.",
        targetIntent: "pick_up_object",
        slotsJson: { object: "red mug" },
      },
    }),
    demoRow("demo_direction", "Turn left at the doorway.", "turn right at the doorway", {
      ...base,
      prompt: {
        language: "English",
        taskType: "Navigate",
        commandVariant: "Canonical",
        displayInstruction: "Ask the robot to turn left at the doorway.",
        targetIntent: "navigate_turn_left",
      },
    }),
    demoRow("demo_number", "Bring two towels to the cart.", "bring three towels to the cart", {
      ...base,
      prompt: {
        language: "English",
        taskType: "Hand over",
        commandVariant: "Canonical",
        displayInstruction: "Ask for two towels.",
        targetIntent: "bring_quantity",
        slotsJson: { object: "towels", quantity: "two" },
      },
    }),
    demoRow("demo_self_correction", "Um bring the red mug, actually the blue bottle.", "um bring the red mug the bottle", {
      ...base,
      prompt: {
        language: "English",
        promptMode: "self_correction",
        taskType: "Pick up",
        commandVariant: "Self-corrected",
        displayInstruction: "Ask naturally, including one correction.",
        targetIntent: "pick_up_object",
      },
    }),
    demoRow("demo_machinery", "", "pick up the metal tray", {
      ...base,
      session: {
        environmentType: "Indoor, loud",
        backgroundNoise: "machinery noise",
        microphoneDistance: "Far: over 100 cm",
        expectedInterruptions: true,
      },
      recording: {
        id: "recording_demo_machinery",
        contributorTranscript: "",
        inputValidity: "background_noise",
        clientRms: 0.22,
      },
      prompt: {
        language: "English",
        taskType: "Safety intervention",
        commandVariant: "Safety-sensitive",
        displayInstruction: "Invalid background machinery noise fixture.",
        targetIntent: "invalid_input",
        safetySensitive: true,
      },
    }),
    demoRow("demo_silence", "", "", {
      ...base,
      recording: {
        id: "recording_demo_silence",
        contributorTranscript: "",
        inputValidity: "silence",
        silenceWarning: true,
        clientRms: 0.001,
      },
      prompt: {
        language: "English",
        taskType: "Stop or pause",
        commandVariant: "Safety-sensitive",
        displayInstruction: "Invalid silence fixture.",
        targetIntent: "invalid_input",
        safetySensitive: true,
      },
    }),
  ];
}

function demoRow(
  id: string,
  reference: string,
  hypothesis: string,
  overrides: Partial<FailureAnalysisRow>,
): FailureAnalysisRow {
  const referenceNormalized = normalizeTranscript(reference, defaultNormalizationProfile);
  const hypothesisNormalized = normalizeTranscript(hypothesis, defaultNormalizationProfile);
  const referenceTokens = tokenizeForAlignment(referenceNormalized);
  const edits = alignTokens(referenceTokens, tokenizeForAlignment(hypothesisNormalized)).filter((op) => op.kind !== "match");
  return {
    result: {
      id: `result_${id}`,
      recordingId: `recording_${id}`,
      status: "completed",
      hypothesis,
      latencyMs: 420,
    },
    metric: {
      referenceNormalized,
      hypothesisNormalized,
      wordErrorRate: referenceTokens.length ? edits.length / referenceTokens.length : edits.length ? 1 : 0,
      characterErrorRate: referenceNormalized === hypothesisNormalized ? 0 : 0.1,
      exactMatch: referenceNormalized === hypothesisNormalized,
      insertions: edits.filter((op) => op.kind === "insertion").length,
      deletions: edits.filter((op) => op.kind === "deletion").length,
      substitutions: edits.filter((op) => op.kind === "substitution").length,
      referenceWordCount: referenceTokens.length,
    },
    review: {
      reviewedTranscript: reference,
      commandComplianceScore: 5,
      audioQualityScore: 4,
    },
    model: { id: "model_demo", displayName: "Demo Whisper" },
    prompt: {
      language: "English",
      taskType: "Pick up",
      commandVariant: "Canonical",
      displayInstruction: "Demo prompt",
      targetIntent: "demo",
    },
    session: {
      environmentType: "Indoor, quiet",
      backgroundNoise: "none",
      microphoneDistance: "Near: under 30 cm",
      expectedInterruptions: false,
    },
    ...overrides,
    recording: {
      id: `recording_${id}`,
      contributorTranscript: reference,
      inputValidity: "valid_command",
      durationMs: 2500,
      ...overrides.recording,
    },
  };
}
