import {
  defaultNormalizationProfile,
  type CommandPrompt,
  type EvaluationMetric,
  type NormalizationProfile,
  type ScorerConfig,
} from "@/lib/domain";
import { getEnv } from "@/lib/env";
import { calculateTranscriptMetrics } from "@/lib/stt/metrics";

export type ScoredTranscript = {
  metric: Omit<EvaluationMetric, "id" | "sttResultId">;
  scores: Record<string, number>;
  rationale: string;
};

export function scoreTranscript(input: {
  reference: string;
  hypothesis: string;
  prompt?: Pick<CommandPrompt, "safetySensitive">;
  scorers: ScorerConfig[];
  normalizationProfile?: NormalizationProfile;
}) {
  const metrics = calculateTranscriptMetrics(input.reference, input.hypothesis, input.normalizationProfile ?? defaultNormalizationProfile, {
    safetySensitive: input.prompt?.safetySensitive,
  });
  const scores: Record<string, number> = {};
  for (const scorer of input.scorers.filter((candidate) => candidate.isEnabled)) {
    if (scorer.scorerType === "deterministic") {
      scores.wer = metrics.wordErrorRate;
      scores.cer = metrics.characterErrorRate;
      scores.mer = metrics.mixedErrorRate;
      scores.exact_match = metrics.exactMatch ? 1 : 0;
      scores.overgeneration = metrics.overgenerationRate;
      scores.semantic_risk = metrics.semanticRiskFlags.length ? 1 : 0;
    } else if (scorer.scorerType === "llm_judge") {
      scores.command_fidelity = commandFidelityScore(metrics);
    } else if (scorer.scorerType === "human_review") {
      scores.reviewer_validation = 0;
    }
  }

  return {
    metric: {
      referenceNormalized: metrics.referenceNormalized,
      hypothesisNormalized: metrics.hypothesisNormalized,
      wordErrorRate: metrics.wordErrorRate,
      characterErrorRate: metrics.characterErrorRate,
      exactMatch: metrics.exactMatch,
      insertions: metrics.insertions,
      deletions: metrics.deletions,
      substitutions: metrics.substitutions,
      referenceWordCount: metrics.referenceWordCount,
      referenceCharacterCount: metrics.referenceCharacterCount,
      mixedErrorRate: metrics.mixedErrorRate,
      overgenerationRate: metrics.overgenerationRate,
      semanticRiskFlags: metrics.semanticRiskFlags,
      scorerScoresJson: scores,
      scorerRationale: scorerRationale(metrics),
    },
    scores,
    rationale: scorerRationale(metrics),
  } satisfies ScoredTranscript;
}

export async function scoreTranscriptWithOptionalJudge(input: {
  reference: string;
  hypothesis: string;
  prompt?: Pick<CommandPrompt, "displayInstruction" | "exactText" | "language" | "taskType" | "commandVariant" | "targetIntent" | "slotsJson" | "safetySensitive">;
  scorers: ScorerConfig[];
  normalizationProfile?: NormalizationProfile;
}) {
  const scored = scoreTranscript(input);
  const judgeScorer = input.scorers.find((scorer) => scorer.isEnabled && scorer.scorerType === "llm_judge");
  const apiKey = getEnv().OPENAI_API_KEY;
  if (!judgeScorer || !apiKey || process.env.NODE_ENV === "test") return scored;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: judgeScorer.judgeModel ?? "gpt-4o-mini",
        temperature: 0,
        max_tokens: 180,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You score speech-to-text command fidelity for robotics data. Return JSON only with score, rationale, and semantic_risk_flags. The rationale must be concise and user-facing.",
          },
          {
            role: "user",
            content: JSON.stringify({
              rubric: judgeScorer.rubricText,
              instruction: input.prompt?.displayInstruction,
              expectedText: input.prompt?.exactText,
              language: input.prompt?.language,
              taskType: input.prompt?.taskType,
              commandVariant: input.prompt?.commandVariant,
              targetIntent: input.prompt?.targetIntent,
              slots: input.prompt?.slotsJson,
              safetySensitive: input.prompt?.safetySensitive,
              humanTranscript: input.reference,
              modelTranscript: input.hypothesis,
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Judge request failed with ${response.status}`);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Judge response was empty.");
    const parsed = JSON.parse(content) as { score?: unknown; rationale?: unknown; semantic_risk_flags?: unknown };
    const score = clamp01(typeof parsed.score === "number" ? parsed.score : Number(parsed.score));
    const rationale = typeof parsed.rationale === "string" && parsed.rationale.trim() ? parsed.rationale.trim() : scored.rationale;
    const flags = Array.isArray(parsed.semantic_risk_flags)
      ? parsed.semantic_risk_flags.filter((flag): flag is string => typeof flag === "string" && Boolean(flag.trim()))
      : scored.metric.semanticRiskFlags;
    scored.scores.command_fidelity = score;
    scored.metric.semanticRiskFlags = flags;
    scored.metric.scorerScoresJson = scored.scores;
    scored.metric.scorerRationale = rationale;
    scored.rationale = rationale;
  } catch (error) {
    const fallback = error instanceof Error ? error.message : "Judge scorer unavailable.";
    scored.metric.scorerRationale = `${scored.rationale} Judge fallback used because the LLM scorer was unavailable: ${fallback}`;
    scored.rationale = scored.metric.scorerRationale;
  }
  return scored;
}

function commandFidelityScore(metrics: ReturnType<typeof calculateTranscriptMetrics>) {
  if (metrics.exactMatch) return 1;
  const semanticPenalty = metrics.semanticRiskFlags.length ? 0.35 : 0;
  const safetyPenalty = metrics.semanticRiskFlags.includes("safety_sensitive") ? 0.25 : 0;
  const errorPenalty = Math.min(0.35, (metrics.mixedErrorRate || metrics.characterErrorRate) * 0.6);
  const overgenerationPenalty = Math.min(0.15, metrics.overgenerationRate * 0.5);
  return Math.max(0, Number((1 - semanticPenalty - safetyPenalty - errorPenalty - overgenerationPenalty).toFixed(3)));
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function scorerRationale(metrics: ReturnType<typeof calculateTranscriptMetrics>) {
  if (metrics.exactMatch) return "The normalized human transcript and model transcript match exactly.";
  const risks = metrics.semanticRiskFlags.length
    ? ` Semantic risk flags: ${metrics.semanticRiskFlags.join(", ")}.`
    : " No semantic risk flags were detected.";
  return `Compared against the contributor's manual transcript: WER ${metrics.wordErrorRate.toFixed(3)}, CER ${metrics.characterErrorRate.toFixed(
    3,
  )}, MER ${metrics.mixedErrorRate.toFixed(3)}, overgeneration ${metrics.overgenerationRate.toFixed(3)}.${risks}`;
}
