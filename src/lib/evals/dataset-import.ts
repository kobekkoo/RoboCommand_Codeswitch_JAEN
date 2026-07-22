import type { EvalDatasetRow } from "@/lib/domain";

export const importColumnRoles = [
  "input",
  "audio",
  "human_transcript",
  "expected",
  "tags",
  "metadata",
  "id",
  "do_not_import",
] as const;

export type ImportColumnRole = (typeof importColumnRoles)[number];

export type ParsedDatasetImport = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export function parseDatasetImport(content: string, fileName: string): ParsedDatasetImport {
  const trimmed = content.trim();
  if (!trimmed) return { headers: [], rows: [] };
  if (fileName.toLowerCase().endsWith(".json")) return parseJsonImport(trimmed);
  return parseCsvImport(trimmed);
}

export function inferColumnRole(header: string): ImportColumnRole {
  const normalized = header.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (["id", "row_id", "recording_id"].includes(normalized)) return "id";
  if (["audio", "audio_url", "audio_path", "storage_path", "recording"].includes(normalized)) return "audio";
  if (["human_transcript", "reference", "manual_transcript", "reviewed_transcript", "transcript"].includes(normalized)) return "human_transcript";
  if (["expected", "expected_text", "target", "gold"].includes(normalized)) return "expected";
  if (["tags", "tag"].includes(normalized)) return "tags";
  if (["metadata", "meta", "json"].includes(normalized)) return "metadata";
  if (["input", "prompt", "instruction", "display_instruction"].includes(normalized)) return "input";
  return "do_not_import";
}

export function buildDatasetRowsFromImport(input: {
  parsedRows: Array<Record<string, string>>;
  roles: Record<string, ImportColumnRole>;
}): EvalDatasetRow[] {
  return input.parsedRows
    .map((row, index) => {
      const id = valueForRole(row, input.roles, "id") || `import-row-${index + 1}`;
      const inputText = valueForRole(row, input.roles, "input");
      const humanTranscript = valueForRole(row, input.roles, "human_transcript") || inputText;
      const audio = valueForRole(row, input.roles, "audio");
      const expectedText = valueForRole(row, input.roles, "expected");
      return {
        id,
        source: "import",
        inputText,
        audioStoragePath: audio && !looksLikeUrl(audio) ? audio : undefined,
        audioUrl: audio && looksLikeUrl(audio) ? audio : undefined,
        humanTranscript,
        expectedText: expectedText || undefined,
        tags: parseTags(valueForRole(row, input.roles, "tags")),
        metadataJson: parseMetadata(valueForRole(row, input.roles, "metadata")),
        rowOrder: index,
      } satisfies EvalDatasetRow;
    })
    .filter((row) => row.inputText.trim() && row.humanTranscript.trim());
}

function parseJsonImport(content: string): ParsedDatasetImport {
  const parsed = JSON.parse(content) as unknown;
  const rows = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { rows?: unknown })?.rows) ? (parsed as { rows: unknown[] }).rows : [];
  const objects = rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
  const headers = [...new Set(objects.flatMap((row) => Object.keys(row)))];
  return {
    headers,
    rows: objects.map((row) =>
      Object.fromEntries(headers.map((header) => [header, stringifyCell(row[header])])),
    ),
  };
}

function parseCsvImport(content: string): ParsedDatasetImport {
  const rows = parseCsvRows(content);
  const headers = rows[0] ?? [];
  return {
    headers,
    rows: rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))),
  };
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function valueForRole(row: Record<string, string>, roles: Record<string, ImportColumnRole>, role: ImportColumnRole) {
  const key = Object.entries(roles).find(([, candidate]) => candidate === role)?.[0];
  return key ? row[key]?.trim() ?? "" : "";
}

function parseTags(value: string) {
  return value
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseMetadata(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };
  } catch {
    return { note: value };
  }
}

function stringifyCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
