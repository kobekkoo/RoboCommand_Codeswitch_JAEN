import { describe, expect, it } from "vitest";
import { defaultNormalizationProfile } from "@/lib/domain";
import {
  calculateTranscriptMetrics,
  mixedTokensForMer,
  normalizeTranscript,
  normalizeTranscriptForComparison,
} from "@/lib/stt/metrics";

describe("transcript normalization and metrics", () => {
  it("normalizes Unicode width, case, punctuation, and whitespace", () => {
    expect(normalizeTranscript("  ＨＥＬＬＯ   “Cup”  ", defaultNormalizationProfile)).toBe('hello "cup"');
  });

  it("calculates WER for substitutions and deletions", () => {
    const metrics = calculateTranscriptMetrics("pick up the red cup", "pick the blue cup", defaultNormalizationProfile);
    expect(metrics.referenceWordCount).toBe(5);
    expect(metrics.deletions + metrics.substitutions + metrics.insertions).toBeGreaterThan(0);
    expect(metrics.wordErrorRate).toBeCloseTo(0.4);
  });

  it("calculates CER for mixed English and Japanese text", () => {
    const metrics = calculateTranscriptMetrics("赤い cup を pick up して", "青い cup を pick up して", defaultNormalizationProfile);
    expect(metrics.referenceCharacterCount).toBeGreaterThan(0);
    expect(metrics.characterErrorRate).toBeGreaterThan(0);
    expect(metrics.characterErrorRate).toBeLessThan(0.2);
  });

  it("normalizes punctuation and safe Japanese orthographic variants for scoring", () => {
    expect(normalizeTranscriptForComparison("あおいボトルを持って来て。", defaultNormalizationProfile)).toBe(
      "青いボトルを持ってきて",
    );
    const metrics = calculateTranscriptMetrics("青いボトルを持ってきて", "あおいボトルを持って来て。", defaultNormalizationProfile);
    expect(metrics.exactMatch).toBe(true);
    expect(metrics.wordErrorRate).toBe(0);
    expect(metrics.characterErrorRate).toBe(0);
    expect(metrics.mixedErrorRate).toBe(0);
  });

  it("does not normalize meaning-changing Japanese words into a match", () => {
    const metrics = calculateTranscriptMetrics("青いボトルを持ってきて", "赤いボトルを持ってきて", defaultNormalizationProfile);
    expect(metrics.exactMatch).toBe(false);
    expect(metrics.characterErrorRate).toBeGreaterThan(0);
    expect(metrics.semanticRiskFlags).toContain("color");
  });

  it("tokenizes mixed English and Japanese text for MER", () => {
    const normalized = normalizeTranscriptForComparison("Clean the table. テーブルを綺麗にして。", defaultNormalizationProfile);
    expect(mixedTokensForMer(normalized)).toEqual([
      "clean",
      "the",
      "table",
      "テ",
      "ー",
      "ブ",
      "ル",
      "を",
      "綺",
      "麗",
      "に",
      "し",
      "て",
    ]);
  });

  it("captures overgeneration without treating punctuation as a semantic miss", () => {
    const metrics = calculateTranscriptMetrics(
      "青いボトルを持ってきて。",
      "あおいボトルを持って来て、お願いします。",
      defaultNormalizationProfile,
    );
    expect(metrics.mixedErrorRate).toBeGreaterThan(0);
    expect(metrics.overgenerationRate).toBeGreaterThan(0);
    expect(metrics.semanticRiskFlags).not.toContain("color");
  });

  it("handles empty references without divide-by-zero", () => {
    const emptyBoth = calculateTranscriptMetrics("", "", defaultNormalizationProfile);
    const emptyReference = calculateTranscriptMetrics("", "hello", defaultNormalizationProfile);
    expect(emptyBoth.wordErrorRate).toBe(0);
    expect(emptyBoth.characterErrorRate).toBe(0);
    expect(emptyReference.wordErrorRate).toBe(1);
    expect(emptyReference.characterErrorRate).toBe(1);
  });
});
