import { defaultNormalizationProfile } from "@/lib/domain";
import { normalizeTranscriptForComparison } from "@/lib/stt/metrics";

export type DiffPart = {
  kind: "same" | "missing" | "added";
  value: string;
};

type DiffToken = {
  value: string;
  comparison: string;
};

export function diffParts(reference: string, hypothesis: string): DiffPart[] {
  const referenceTokens = tokensForDiff(reference).map(toDiffToken);
  const hypothesisTokens = tokensForDiff(hypothesis).map(toDiffToken);
  const rows = referenceTokens.length + 1;
  const cols = hypothesisTokens.length + 1;
  const dp = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

  for (let i = 0; i < rows; i += 1) dp[i]![0] = i;
  for (let j = 0; j < cols; j += 1) dp[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dp[i]![j] =
        referenceTokens[i - 1]?.comparison === hypothesisTokens[j - 1]?.comparison
          ? dp[i - 1]![j - 1]!
          : Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + 1);
    }
  }

  const parts: DiffPart[] = [];
  let i = referenceTokens.length;
  let j = hypothesisTokens.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && referenceTokens[i - 1]?.comparison === hypothesisTokens[j - 1]?.comparison) {
      parts.push({ kind: "same", value: referenceTokens[i - 1]!.value });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + 1) {
      parts.push({ kind: "added", value: hypothesisTokens[j - 1]!.value });
      parts.push({ kind: "missing", value: referenceTokens[i - 1]!.value });
      i -= 1;
      j -= 1;
    } else if (j > 0 && dp[i]![j] === dp[i]![j - 1]! + 1) {
      parts.push({ kind: "added", value: hypothesisTokens[j - 1]!.value });
      j -= 1;
    } else if (i > 0) {
      parts.push({ kind: "missing", value: referenceTokens[i - 1]!.value });
      i -= 1;
    }
  }

  const ordered = parts.reverse();
  return ordered.length ? ordered : [{ kind: "same", value: "(empty)" }];
}

export function tokensForDiff(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed.match(/\S+/gu) ?? [];
}

function toDiffToken(value: string): DiffToken {
  return {
    value,
    comparison: normalizeTranscriptForComparison(value, defaultNormalizationProfile),
  };
}
