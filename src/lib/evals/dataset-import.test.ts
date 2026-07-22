import { describe, expect, it } from "vitest";
import { buildDatasetRowsFromImport, inferColumnRole, parseDatasetImport } from "@/lib/evals/dataset-import";

describe("dataset import helpers", () => {
  it("parses CSV and infers CommandLoop column roles", () => {
    const parsed = parseDatasetImport(
      `input,manual_transcript,tags,metadata
"Say clean the table","Clean the table. テーブルを綺麗にして。","code-switch;short","{""language"":""English-Japanese""}"`,
      "rows.csv",
    );
    const roles = Object.fromEntries(parsed.headers.map((header) => [header, inferColumnRole(header)]));
    const rows = buildDatasetRowsFromImport({ parsedRows: parsed.rows, roles });

    expect(parsed.headers).toEqual(["input", "manual_transcript", "tags", "metadata"]);
    expect(roles.manual_transcript).toBe("human_transcript");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      inputText: "Say clean the table",
      humanTranscript: "Clean the table. テーブルを綺麗にして。",
      tags: ["code-switch", "short"],
      metadataJson: { language: "English-Japanese" },
    });
  });

  it("parses JSON arrays into importable rows", () => {
    const parsed = parseDatasetImport(
      JSON.stringify([
        {
          id: "row-a",
          instruction: "Ask for the blue bottle",
          reference: "青いボトルを持ってきて",
          expected: "青いボトルを持ってきて",
        },
      ]),
      "rows.json",
    );
    const roles = Object.fromEntries(parsed.headers.map((header) => [header, inferColumnRole(header)]));
    const rows = buildDatasetRowsFromImport({ parsedRows: parsed.rows, roles });

    expect(rows[0]?.id).toBe("row-a");
    expect(rows[0]?.inputText).toBe("Ask for the blue bottle");
    expect(rows[0]?.humanTranscript).toBe("青いボトルを持ってきて");
    expect(rows[0]?.expectedText).toBe("青いボトルを持ってきて");
  });
});
