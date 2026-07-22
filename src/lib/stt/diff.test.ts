import { describe, expect, it } from "vitest";
import { diffParts, tokensForDiff } from "@/lib/stt/diff";

describe("transcript diff tokenization", () => {
  it("keeps Japanese no-space phrases as phrase tokens instead of splitting kana characters", () => {
    expect(tokensForDiff("テーブルをきれいにして。")).toEqual(["テーブルをきれいにして。"]);
  });

  it("diffs mixed English/Japanese references against Japanese-only hypotheses at phrase granularity", () => {
    const parts = diffParts("Clean the table. テーブルを綺麗にして。", "テーブルをきれいにして。");

    expect(parts).toEqual([
      { kind: "missing", value: "Clean" },
      { kind: "missing", value: "the" },
      { kind: "missing", value: "table." },
      { kind: "same", value: "テーブルを綺麗にして。" },
    ]);
    expect(parts.some((part) => part.value === "き")).toBe(false);
  });

  it("does not flag punctuation-only or safe Japanese orthographic differences", () => {
    expect(diffParts("青いボトルを持ってきて", "あおいボトルを持って来て。")).toEqual([
      { kind: "same", value: "青いボトルを持ってきて" },
    ]);
  });

  it("still flags meaning-changing Japanese substitutions", () => {
    expect(diffParts("青いボトルを持ってきて", "赤いボトルを持ってきて")).toEqual([
      { kind: "missing", value: "青いボトルを持ってきて" },
      { kind: "added", value: "赤いボトルを持ってきて" },
    ]);
  });
});
