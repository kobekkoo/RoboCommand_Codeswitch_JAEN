import { describe, expect, it } from "vitest";
import { seedScorerConfigs } from "@/lib/data/seed";
import { scoreTranscript } from "@/lib/evals/scorers";

describe("eval scorers", () => {
  it("scores exact transcript matches across deterministic and judge scorers", () => {
    const scored = scoreTranscript({
      reference: "Clean the table. テーブルを綺麗にして。",
      hypothesis: "Clean the table. テーブルを綺麗にして。",
      scorers: seedScorerConfigs,
    });

    expect(scored.scores.mer).toBe(0);
    expect(scored.scores.command_fidelity).toBe(1);
    expect(scored.rationale).toContain("match exactly");
  });

  it("adds a concise rationale for overgeneration and semantic risk", () => {
    const scored = scoreTranscript({
      reference: "Pick up the red cup.",
      hypothesis: "Pick up the blue cup and put it on the stove.",
      prompt: { safetySensitive: true },
      scorers: seedScorerConfigs,
    });

    expect(scored.scores.mer).toBeGreaterThan(0);
    expect(scored.scores.command_fidelity).toBeLessThan(1);
    expect(scored.scores.semantic_risk).toBe(1);
    expect(scored.rationale).toContain("Semantic risk flags");
  });
});
