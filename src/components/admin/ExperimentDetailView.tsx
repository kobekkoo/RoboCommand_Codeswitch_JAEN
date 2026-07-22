"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Filter, GitCompare, LayoutPanelLeft, Search, Settings2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/forms";
import type { FailureAnalysisRow } from "@/lib/stt/failure-analysis";

type EvaluationReportRow = FailureAnalysisRow & {
  metric?: FailureAnalysisRow["metric"] & {
    mixedErrorRate?: number;
    overgenerationRate?: number;
    semanticRiskFlags?: string[];
    linguisticCategory?: string;
    scorerScoresJson?: Record<string, number>;
    scorerRationale?: string;
  };
};

type EvaluationReport = {
  run: {
    id: string;
    name: string;
    status?: string;
    totalRecordings?: number;
    completedRecordings?: number;
    failedRecordings?: number;
    createdAt?: string;
    completedAt?: string;
  };
  summary: {
    overallWer: number;
    overallCer: number;
    overallMer?: number;
    overgenerationRate?: number;
    semanticRiskRate?: number;
    exactMatchRate: number;
    medianLatency: number;
    p95Latency: number;
    failureRate: number;
    recordingCount: number;
  };
  slices: Array<{
    label: string;
    name: string;
    evaluatedCount: number;
    meanWer: number;
    meanCer: number;
    meanMer?: number;
    meanOvergeneration?: number;
    semanticRiskRate?: number;
    exactMatchRate: number;
    failureRate: number;
    medianLatency: number;
    tinySample: boolean;
  }>;
  rows: EvaluationReportRow[];
};

type RunOption = {
  id: string;
  name: string;
  status: string;
  totalRecordings: number;
  completedRecordings: number;
  failedRecordings: number;
  createdAt: string;
};

type ExperimentTableRow = {
  key: string;
  row: EvaluationReportRow;
  rowName: string;
  input: string;
  output: string;
  humanTranscript: string;
  tags: string[];
  classification: string;
  commandScore?: number;
  wer?: number;
  cer?: number;
  mer?: number;
  overgeneration?: number;
  semanticRiskFlags: string[];
  scorerScores: Record<string, number>;
  timeToFirstTokenMs?: number;
  promptTokens: number;
  completionTokens: number;
  completionReasoningTokens: number;
  durationMs?: number;
  llmDurationMs?: number;
  status: string;
  error?: string;
  modelName: string;
  modelProvider: string;
};

type AggregateStats = {
  commandScore?: number;
  errors: number;
  timeToFirstTokenMs?: number;
  promptTokens: number;
  completionTokens: number;
  completionReasoningTokens: number;
  durationMs?: number;
  llmDurationMs?: number;
  rowCount: number;
};

const categoryLabels: Record<string, string> = {
  code_switching: "Code-switching",
  short_utterance: "Short utterance",
  incomplete_audio: "Incomplete audio",
  general: "General",
};

export function ExperimentDetailView({
  report,
  runs,
  comparisonReport,
  comparisonRunId,
}: {
  report: EvaluationReport;
  runs: RunOption[];
  comparisonReport?: EvaluationReport;
  comparisonRunId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [diffEnabled, setDiffEnabled] = useState(Boolean(comparisonReport));
  const baseRows = useMemo(() => buildExperimentRows(report.rows), [report.rows]);
  const comparisonRows = useMemo(() => (comparisonReport ? buildExperimentRows(comparisonReport.rows) : []), [comparisonReport]);
  const comparisonByKey = useMemo(() => new Map(comparisonRows.map((row) => [row.key, row])), [comparisonRows]);
  const filteredRows = useMemo(() => filterRows(baseRows, query), [baseRows, query]);
  const baseStats = useMemo(() => aggregateRows(baseRows), [baseRows]);
  const comparisonStats = useMemo(() => aggregateRows(comparisonRows), [comparisonRows]);
  const scorerDistribution = useMemo(() => buildScorerDistribution(baseRows), [baseRows]);
  const comparisonOptions = runs.filter((run) => run.id !== report.run.id);
  const activeComparison = comparisonReport && diffEnabled ? comparisonReport : undefined;

  function selectComparison(runId: string) {
    const params = new URLSearchParams();
    if (runId) params.set("compare", runId);
    setDiffEnabled(Boolean(runId));
    router.push(`/admin/evaluations/${report.run.id}${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function selectExperiment(runId: string) {
    router.push(`/admin/evaluations/${runId}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-900" />
            <Select
              value={report.run.id}
              onChange={(event) => selectExperiment(event.target.value)}
              className="h-9 w-auto min-w-[260px] border-transparent bg-transparent px-1 text-xl font-semibold focus:border-border"
            >
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name}
                </option>
              ))}
            </Select>
            <Badge tone={statusTone(report.run.status)}>{report.run.status ?? "experiment"}</Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Row-level STT traces, transcript metrics, scorer outputs, and runtime/cost proxies for robot command evaluation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm">
            Diff
            <input
              type="checkbox"
              className="accent-accent"
              checked={diffEnabled}
              disabled={!comparisonReport}
              onChange={(event) => setDiffEnabled(event.target.checked)}
            />
          </label>
          <Link href="/admin/evaluations/compare" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm hover:bg-muted">
            <GitCompare className="h-4 w-4" />
            Compare
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <aside className="space-y-4 rounded-lg border border-border bg-white p-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-700">Comparisons</h2>
              {comparisonReport ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-foreground"
                  onClick={() => selectComparison("")}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              ) : null}
            </div>
            <Select value={comparisonRunId ?? ""} onChange={(event) => selectComparison(event.target.value)} className="h-9 text-sm">
              <option value="">+ Add comparisons</option>
              {comparisonOptions.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name}
                </option>
              ))}
            </Select>
            {comparisonReport ? (
              <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-violet-900">
                  <span className="h-2 w-2 rounded-full bg-violet-600" />
                  {comparisonReport.run.name}
                </div>
                <p className="mt-1 text-xs text-violet-800">Purple values in the table are from this comparison experiment.</p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Choose another experiment to show side-by-side output and metric deltas.</p>
            )}
          </section>

          <SidebarSection title="Dataset">
            <p>{report.summary.recordingCount} unique recordings</p>
            <p>{baseRows.length} model-result rows</p>
          </SidebarSection>

          <SidebarSection title="Scorers and distribution">
            {scorerDistribution.length ? (
              <div className="space-y-2">
                {scorerDistribution.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span>{item.label}</span>
                      <span>{formatPercent(item.value)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-zinc-700" style={{ width: `${Math.min(100, Math.max(0, item.value * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No scorer outputs yet.</p>
            )}
          </SidebarSection>

          <SidebarSection title="Metadata">
            <pre className="max-h-52 overflow-auto rounded-md bg-muted p-3 text-xs leading-5 text-zinc-700">
              {formatYamlLike({
                experiment: report.run.name,
                status: report.run.status,
                rows: baseRows.length,
                created_at: report.run.createdAt,
                completed_at: report.run.completedAt,
                median_latency_ms: Math.round(report.summary.medianLatency),
                p95_latency_ms: Math.round(report.summary.p95Latency),
              })}
            </pre>
          </SidebarSection>
        </aside>

        <section className="min-w-0 rounded-lg border border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-muted px-3 text-sm font-medium">
                <LayoutPanelLeft className="h-4 w-4 text-violet-600" />
                Details
              </button>
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm hover:bg-muted">
                All experiment rows view
              </button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setQuery("")}>
                Reset
              </Button>
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm hover:bg-muted">
                <Filter className="h-4 w-4" />
                Filter
              </button>
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm hover:bg-muted">
                <Settings2 className="h-4 w-4" />
                Display
              </button>
              <Link href="/api/admin/export/evaluations" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white hover:bg-muted" title="Download CSV">
                <Download className="h-4 w-4" />
              </Link>
            </div>
            <label className="relative min-w-[260px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find experiment rows"
                className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[2400px] border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white text-xs text-zinc-500">
                <tr>
                  <th className="border-b border-border px-3 py-3">
                    <input type="checkbox" aria-label="Select all rows" />
                  </th>
                  <ColumnHeader label="Name" sublabel={`${filteredRows.length} rows`} />
                  <ColumnHeader label="Input" />
                  <ColumnHeader label="Output" />
                  <ColumnHeader label="Human transcript" />
                  <ColumnHeader label="Tags" />
                  <ColumnHeader label="Classification" />
                  <MetricColumnHeader label="Command score" value={baseStats.commandScore} comparison={activeComparison ? comparisonStats.commandScore : undefined} format={formatPercent} />
                  <MetricColumnHeader label="WER" value={report.summary.overallWer} comparison={activeComparison?.summary.overallWer} format={formatRate} lowerIsBetter />
                  <MetricColumnHeader label="CER" value={report.summary.overallCer} comparison={activeComparison?.summary.overallCer} format={formatRate} lowerIsBetter />
                  <MetricColumnHeader label="MER" value={report.summary.overallMer ?? report.summary.overallCer} comparison={activeComparison ? comparisonReport?.summary.overallMer ?? comparisonReport?.summary.overallCer : undefined} format={formatRate} lowerIsBetter />
                  <ColumnHeader label="Scorer outputs" />
                  <MetricColumnHeader label="Time to first token" value={baseStats.timeToFirstTokenMs} comparison={activeComparison ? comparisonStats.timeToFirstTokenMs : undefined} format={formatMs} aggregate="AVG" lowerIsBetter />
                  <MetricColumnHeader label="Prompt tokens" value={baseStats.promptTokens} comparison={activeComparison ? comparisonStats.promptTokens : undefined} format={formatInteger} aggregate="SUM" />
                  <MetricColumnHeader label="Completion tokens" value={baseStats.completionTokens} comparison={activeComparison ? comparisonStats.completionTokens : undefined} format={formatInteger} aggregate="SUM" />
                  <MetricColumnHeader label="Completion reasoning tokens" value={baseStats.completionReasoningTokens} comparison={activeComparison ? comparisonStats.completionReasoningTokens : undefined} format={formatInteger} aggregate="SUM" />
                  <MetricColumnHeader label="Duration" value={baseStats.durationMs} comparison={activeComparison ? comparisonStats.durationMs : undefined} format={formatSeconds} aggregate="SUM" lowerIsBetter />
                  <MetricColumnHeader label="LLM duration" value={baseStats.llmDurationMs} comparison={activeComparison ? comparisonStats.llmDurationMs : undefined} format={formatSeconds} aggregate="SUM" lowerIsBetter />
                  <ColumnHeader label="Status / error" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => {
                  const comparison = diffEnabled ? comparisonByKey.get(row.key) : undefined;
                  return <ExperimentRowView key={row.key} row={row} comparison={comparison} rowNumber={index + 1} />;
                })}
              </tbody>
            </table>
          </div>
          {filteredRows.length === 0 ? (
            <div className="border-t border-border p-6 text-sm text-zinc-600">No rows match the current search.</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4 text-sm text-zinc-600 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function ColumnHeader({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <th className="border-b border-border px-3 py-3 align-bottom font-medium">
      <span>{label}</span>
      {sublabel ? <span className="mt-1 block text-[11px] font-normal text-zinc-400">{sublabel}</span> : null}
    </th>
  );
}

function MetricColumnHeader({
  label,
  value,
  comparison,
  format,
  aggregate = "AVG",
  lowerIsBetter = false,
}: {
  label: string;
  value?: number;
  comparison?: number;
  format: (value: number) => string;
  aggregate?: "AVG" | "SUM";
  lowerIsBetter?: boolean;
}) {
  const delta = value !== undefined && comparison !== undefined ? comparison - value : undefined;
  const goodDelta = delta !== undefined && (lowerIsBetter ? delta < 0 : delta > 0);
  return (
    <th className="border-b border-border px-3 py-3 align-bottom font-medium">
      <span>{label}</span>
      <span className="mt-1 block text-base font-semibold text-foreground">
        {value === undefined ? "-" : format(value)} <span className="text-[11px] font-normal text-zinc-400">{aggregate}</span>
      </span>
      {comparison !== undefined ? (
        <span className="mt-1 block text-sm font-medium text-violet-700">
          {format(comparison)}
          {delta !== undefined ? (
            <span className={goodDelta ? "ml-1 text-emerald-700" : "ml-1 text-red-700"}>
              {delta >= 0 ? "+" : ""}
              {format(delta)}
            </span>
          ) : null}
        </span>
      ) : null}
    </th>
  );
}

function ExperimentRowView({
  row,
  comparison,
  rowNumber,
}: {
  row: ExperimentTableRow;
  comparison?: ExperimentTableRow;
  rowNumber: number;
}) {
  return (
    <tr className="group border-b border-border hover:bg-muted/60">
      <td className="border-b border-border px-3 py-4 align-top">
        <input type="checkbox" aria-label={`Select row ${rowNumber}`} />
      </td>
      <td className="border-b border-border px-3 py-4 align-top">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">{rowNumber}</span>
          <span className="font-medium">{row.rowName}</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{row.modelName}</p>
        {comparison ? <ComparisonLine value={comparison.rowName} /> : null}
      </td>
      <TextCell value={row.input} comparison={comparison?.input} />
      <TextCell value={row.output || "(empty)"} comparison={comparison?.output} strong />
      <TextCell value={row.humanTranscript || "(empty)"} comparison={comparison?.humanTranscript} />
      <td className="border-b border-border px-3 py-4 align-top">
        <div className="flex max-w-52 flex-wrap gap-1">
          {row.tags.slice(0, 4).map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
          {row.tags.length === 0 ? <span className="text-zinc-400">-</span> : null}
        </div>
        {comparison ? <ComparisonLine value={comparison.tags.slice(0, 3).join(", ") || "-"} /> : null}
      </td>
      <td className="border-b border-border px-3 py-4 align-top">
        <Badge>{row.classification}</Badge>
        <p className="mt-1 text-xs text-zinc-500">{row.modelProvider}</p>
        {comparison ? <ComparisonLine value={comparison.classification} /> : null}
      </td>
      <MetricCell value={row.commandScore} comparison={comparison?.commandScore} format={formatPercent} />
      <MetricCell value={row.wer} comparison={comparison?.wer} format={formatRate} lowerIsBetter />
      <MetricCell value={row.cer} comparison={comparison?.cer} format={formatRate} lowerIsBetter />
      <MetricCell value={row.mer} comparison={comparison?.mer} format={formatRate} lowerIsBetter />
      <td className="border-b border-border px-3 py-4 align-top">
        <ScorerScorePills scores={row.scorerScores} riskFlags={row.semanticRiskFlags} overgeneration={row.overgeneration} />
        {comparison ? (
          <div className="mt-2 text-violet-700">
            <ScorerScorePills scores={comparison.scorerScores} riskFlags={comparison.semanticRiskFlags} overgeneration={comparison.overgeneration} compact />
          </div>
        ) : null}
      </td>
      <MetricCell value={row.timeToFirstTokenMs} comparison={comparison?.timeToFirstTokenMs} format={formatMs} lowerIsBetter />
      <MetricCell value={row.promptTokens} comparison={comparison?.promptTokens} format={formatInteger} />
      <MetricCell value={row.completionTokens} comparison={comparison?.completionTokens} format={formatInteger} />
      <MetricCell value={row.completionReasoningTokens} comparison={comparison?.completionReasoningTokens} format={formatInteger} />
      <MetricCell value={row.durationMs} comparison={comparison?.durationMs} format={formatSeconds} lowerIsBetter />
      <MetricCell value={row.llmDurationMs} comparison={comparison?.llmDurationMs} format={formatSeconds} lowerIsBetter />
      <td className="border-b border-border px-3 py-4 align-top">
        <Badge tone={row.status === "failed" ? "red" : row.status === "completed" ? "green" : "amber"}>{row.status}</Badge>
        {row.error ? <p className="mt-1 max-w-56 text-xs text-red-700">{row.error}</p> : null}
        {comparison ? <ComparisonLine value={comparison.status} /> : null}
      </td>
    </tr>
  );
}

function TextCell({ value, comparison, strong = false }: { value: string; comparison?: string; strong?: boolean }) {
  return (
    <td className="border-b border-border px-3 py-4 align-top">
      <p className={`max-w-72 whitespace-pre-wrap leading-5 ${strong ? "font-medium text-foreground" : "text-zinc-700"}`}>{value}</p>
      {comparison !== undefined ? <ComparisonLine value={comparison || "(empty)"} /> : null}
    </td>
  );
}

function MetricCell({
  value,
  comparison,
  format,
  lowerIsBetter = false,
}: {
  value?: number;
  comparison?: number;
  format: (value: number) => string;
  lowerIsBetter?: boolean;
}) {
  const delta = value !== undefined && comparison !== undefined ? comparison - value : undefined;
  const goodDelta = delta !== undefined && (lowerIsBetter ? delta < 0 : delta > 0);
  return (
    <td className="border-b border-border px-3 py-4 align-top font-mono text-sm">
      <span>{value === undefined ? "-" : format(value)}</span>
      {comparison !== undefined ? (
        <div className="mt-1 text-violet-700">
          {format(comparison)}
          {delta !== undefined ? (
            <span className={goodDelta ? "ml-1 text-emerald-700" : "ml-1 text-red-700"}>
              {delta >= 0 ? "+" : ""}
              {format(delta)}
            </span>
          ) : null}
        </div>
      ) : null}
    </td>
  );
}

function ComparisonLine({ value }: { value: string }) {
  return (
    <p className="mt-1 max-w-72 whitespace-pre-wrap text-xs font-medium leading-5 text-violet-700">
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-600" />
      {value}
    </p>
  );
}

function ScorerScorePills({
  scores,
  riskFlags,
  overgeneration,
  compact = false,
}: {
  scores: Record<string, number>;
  riskFlags: string[];
  overgeneration?: number;
  compact?: boolean;
}) {
  const entries = Object.entries(scores);
  return (
    <div className="flex max-w-64 flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <Badge key={key} className={compact ? "border-violet-200 bg-violet-50 text-violet-800" : undefined}>
          {labelize(key)} {formatRate(value)}
        </Badge>
      ))}
      {overgeneration !== undefined ? <Badge>Overgen {formatPercent(overgeneration)}</Badge> : null}
      {riskFlags.map((flag) => (
        <Badge key={flag} tone="red">
          {labelize(flag)}
        </Badge>
      ))}
      {entries.length === 0 && riskFlags.length === 0 && overgeneration === undefined ? <span className="text-xs text-zinc-400">-</span> : null}
    </div>
  );
}

function buildExperimentRows(rows: EvaluationReportRow[]) {
  return rows.map((row, index): ExperimentTableRow => {
    const input = row.prompt?.displayInstruction ?? row.prompt?.exactText ?? row.recording?.contributorTranscript ?? "";
    const humanTranscript = row.review?.reviewedTranscript ?? row.recording?.contributorTranscript ?? "";
    const output = row.result.hypothesis ?? "";
    const classification = displayCategory(rowCategory(row));
    const metric = row.metric;
    const primaryError = metric ? (rowCategory(row) === "code_switching" ? metric.mixedErrorRate ?? metric.characterErrorRate : metric.characterErrorRate) : undefined;
    const llmDurationMs = row.result.latencyMs;
    const key = `${recordingKey(row)}::${modelKey(row)}`;
    return {
      key,
      row,
      rowName: "eval",
      input,
      output,
      humanTranscript,
      tags: unique([...(row.prompt?.tags ?? []), ...(row.review?.qualityFlags ?? [])]),
      classification,
      commandScore: primaryError === undefined ? undefined : Math.max(0, 1 - primaryError),
      wer: metric?.wordErrorRate,
      cer: metric?.characterErrorRate,
      mer: metric?.mixedErrorRate ?? metric?.characterErrorRate,
      overgeneration: metric?.overgenerationRate,
      semanticRiskFlags: metric?.semanticRiskFlags ?? [],
      scorerScores: metric?.scorerScoresJson ?? {},
      timeToFirstTokenMs: llmDurationMs === undefined ? undefined : Math.round(llmDurationMs * 0.35),
      promptTokens: estimateTokens(`${input} ${humanTranscript}`),
      completionTokens: estimateTokens(output),
      completionReasoningTokens: estimateTokens(metric?.scorerRationale ?? ""),
      durationMs: row.recording?.durationMs,
      llmDurationMs,
      status: row.result.status,
      error: row.result.errorMessage,
      modelName: row.model?.displayName ?? `Model ${index + 1}`,
      modelProvider: providerLabel(row.model?.provider),
    };
  });
}

function filterRows(rows: ExperimentTableRow[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) =>
    [row.input, row.output, row.humanTranscript, row.classification, row.modelName, row.status, row.tags.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function aggregateRows(rows: ExperimentTableRow[]): AggregateStats {
  const completed = rows.filter((row) => row.status === "completed");
  return {
    commandScore: mean(completed.map((row) => row.commandScore).filter(isNumber)),
    errors: rows.filter((row) => row.status === "failed").length,
    timeToFirstTokenMs: mean(completed.map((row) => row.timeToFirstTokenMs).filter(isNumber)),
    promptTokens: sum(rows.map((row) => row.promptTokens)),
    completionTokens: sum(rows.map((row) => row.completionTokens)),
    completionReasoningTokens: sum(rows.map((row) => row.completionReasoningTokens)),
    durationMs: sum(rows.map((row) => row.durationMs).filter(isNumber)),
    llmDurationMs: sum(rows.map((row) => row.llmDurationMs).filter(isNumber)),
    rowCount: rows.length,
  };
}

function buildScorerDistribution(rows: ExperimentTableRow[]) {
  const completed = rows.filter((row) => row.commandScore !== undefined);
  return [
    { label: "Command score", value: mean(completed.map((row) => row.commandScore).filter(isNumber)) ?? 0 },
    { label: "Exact match", value: mean(rows.map((row) => (row.row.metric?.exactMatch ? 1 : 0))) ?? 0 },
    { label: "Failure-free", value: rows.length ? 1 - rows.filter((row) => row.status === "failed").length / rows.length : 0 },
  ].filter((item) => Number.isFinite(item.value));
}

function rowCategory(row: EvaluationReportRow) {
  if (row.metric?.linguisticCategory) return row.metric.linguisticCategory;
  if (
    row.prompt?.commandVariant === "Interrupted" ||
    row.prompt?.tags?.some((tag) => tag.includes("incomplete") || tag.includes("interrupted")) ||
    row.review?.qualityFlags?.includes("Incomplete command")
  ) {
    return "incomplete_audio";
  }
  if (row.prompt?.promptMode === "code_switching" || row.prompt?.language === "English-Japanese" || row.prompt?.tags?.some((tag) => tag.includes("code-switch"))) {
    return "code_switching";
  }
  if ((row.recording?.durationMs ?? Number.POSITIVE_INFINITY) <= 3000 || row.prompt?.tags?.some((tag) => tag.includes("short"))) {
    return "short_utterance";
  }
  return "general";
}

function modelKey(row: EvaluationReportRow) {
  return row.model?.id ?? row.model?.displayName ?? "unknown-model";
}

function recordingKey(row: EvaluationReportRow) {
  return row.recording?.id ?? row.result.recordingId ?? row.result.id;
}

function displayCategory(category: string) {
  return categoryLabels[category] ?? labelize(category);
}

function providerLabel(provider?: string) {
  if (!provider) return "Unknown provider";
  if (provider === "openai") return "OpenAI";
  if (provider === "deepgram") return "Deepgram";
  if (provider === "elevenlabs") return "ElevenLabs";
  if (provider === "gemini") return "Gemini";
  if (provider === "mock") return "Mock";
  return labelize(provider);
}

function statusTone(status?: string) {
  if (status === "completed") return "green";
  if (status === "running") return "blue";
  if (status === "failed" || status === "cancelled") return "red";
  return "amber";
}

function estimateTokens(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const cjk = trimmed.match(/[\u3040-\u30ff\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords = trimmed.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g)?.length ?? 0;
  const otherChars = trimmed.replace(/[\u3040-\u30ff\u3400-\u9fff]/g, "").replace(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g, "").trim().length;
  return latinWords + cjk + Math.ceil(otherChars / 4);
}

function formatYamlLike(value: Record<string, unknown>) {
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${item ?? "null"}`)
    .join("\n");
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatRate(value: number) {
  return value.toFixed(3);
}

function formatInteger(value: number) {
  return String(Math.round(value));
}

function formatMs(value: number) {
  return `${Math.round(value)} ms`;
}

function formatSeconds(value: number) {
  return `${Math.round((value / 1000) * 10) / 10}s`;
}

function labelize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function mean(values: number[]) {
  return values.length ? sum(values) / values.length : undefined;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
