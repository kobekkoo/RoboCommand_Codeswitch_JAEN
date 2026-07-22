import { describe, expect, it } from "vitest";
import {
  alignTokens,
  analyzeInvalidInputs,
  buildCollectionPriorityRows,
  coverageGapWeight,
  demoFailureAnalysisRows,
  detectActionableCommand,
  extractConfusionPatterns,
  priorityScore,
  type FailureAnalysisRow,
} from "@/lib/stt/failure-analysis";

describe("failure analysis", () => {
  it("aligns tokens and extracts object substitutions", () => {
    const ops = alignTokens("pick up the red mug".split(" "), "pick up the red mat".split(" "));
    expect(ops).toContainEqual({
      kind: "substitution",
      reference: "mug",
      hypothesis: "mat",
      referenceIndex: 4,
      hypothesisIndex: 4,
    });

    const patterns = extractConfusionPatterns(demoFailureAnalysisRows());
    expect(patterns.some((pattern) => pattern.category === "object" && pattern.label.includes("mug -> mat"))).toBe(true);
  });

  it("classifies direction, number, object, and safety failures", () => {
    const patterns = extractConfusionPatterns(demoFailureAnalysisRows());
    expect(patterns.some((pattern) => pattern.category === "direction" && pattern.label.includes("left -> right"))).toBe(true);
    expect(patterns.some((pattern) => pattern.category === "number" && pattern.label.includes("two -> three"))).toBe(true);
    expect(patterns.some((pattern) => pattern.category === "object" && pattern.label.includes("mug -> mat"))).toBe(true);
    expect(patterns.some((pattern) => pattern.category === "safety")).toBe(true);
  });

  it("detects false actionable commands on invalid input", () => {
    expect(detectActionableCommand("pick up the metal tray").isActionable).toBe(true);
    expect(detectActionableCommand("music and static in the background").isActionable).toBe(false);

    const invalid = analyzeInvalidInputs(demoFailureAnalysisRows());
    expect(invalid.invalidCount).toBe(2);
    expect(invalid.falseActionableCommandRate).toBe(0.5);
    expect(invalid.queue[0]?.severity).toBe("high");
  });

  it("calculates priority score and coverage gap", () => {
    expect(coverageGapWeight(5, 50)).toBeGreaterThan(coverageGapWeight(80, 50));
    expect(priorityScore({ failureRate: 0.5, severityWeight: 3, sampleCount: 5, targetSampleCount: 50 })).toBeGreaterThan(
      priorityScore({ failureRate: 0.5, severityWeight: 1, sampleCount: 80, targetSampleCount: 50 }),
    );
  });

  it("creates priority rows for slice combinations", () => {
    const base = demoFailureAnalysisRows().find((row) => row.result.id === "result_demo_self_correction");
    const noisyCorrection: FailureAnalysisRow = {
      ...base!,
      session: {
        ...base!.session,
        environmentType: "Indoor, loud",
        backgroundNoise: "machinery noise",
      },
    };
    const priorities = buildCollectionPriorityRows([noisyCorrection], { targetSampleCount: 50 });
    expect(priorities.some((priority) => priority.name === "Hesitation + self-correction + noise")).toBe(true);
  });

  it("handles missing metadata and empty evaluation datasets", () => {
    expect(extractConfusionPatterns([])).toEqual([]);
    expect(analyzeInvalidInputs([]).invalidCount).toBe(0);
    expect(buildCollectionPriorityRows([])).toEqual([]);

    const minimal: FailureAnalysisRow = {
      result: {
        id: "minimal",
        status: "completed",
        hypothesis: "open the door",
      },
    };
    expect(extractConfusionPatterns([minimal]).length).toBeGreaterThan(0);
    expect(buildCollectionPriorityRows([minimal]).length).toBeGreaterThan(0);
  });
});
