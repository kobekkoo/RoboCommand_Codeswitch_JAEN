"use client";

import Link from "next/link";
import { Info, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/forms";
import { diffParts } from "@/lib/stt/diff";
import { mixedTokensForMer } from "@/lib/stt/metrics";
import {
  analyzeInvalidInputs,
  extractConfusionPatterns,
  noiseLabel,
  type ConfusionPattern,
  type FailureAnalysisFilters,
  type FailureAnalysisRow,
  type InvalidInputAnalysis,
} from "@/lib/stt/failure-analysis";

type EvaluationReportRow = FailureAnalysisRow & {
  metric?: NonNullable<FailureAnalysisRow["metric"]> & {
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
    medianWer: number;
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

type EvaluationRunOption = {
  id: string;
  name: string;
  status: string;
  totalRecordings: number;
  completedRecordings: number;
  failedRecordings: number;
  createdAt: string;
};

type ThresholdConfig = {
  wer: [number, number, number, number];
  cer: [number, number, number, number];
  mer: [number, number, number, number];
  overgeneration: [number, number, number, number];
  semanticRisk: [number, number, number, number];
  exact: [number, number, number, number];
  latency: [number, number, number, number];
  failure: [number, number, number, number];
};

type ComparisonFilters = {
  category: string;
  language: string;
  model: string;
  sort: "regression" | "risk" | "failure" | "category";
};

type ModelSummary = {
  modelId: string;
  modelName: string;
  provider: string;
  rows: EvaluationReportRow[];
  completedRows: EvaluationReportRow[];
  meanWer: number;
  meanCer: number;
  meanMer: number;
  failureRate: number;
  medianLatency: number;
  overgenerationRate: number;
  semanticRiskRate: number;
};

type ComparisonGroup = {
  recordingId: string;
  humanTranscript: string;
  instruction: string;
  language: string;
  category: string;
  codeSwitchLevel?: string;
  durationBucket: string;
  rows: EvaluationReportRow[];
  byModel: Map<string, EvaluationReportRow>;
};

type HeatmapRow = {
  axis: string;
  value: string;
  cells: Map<string, { score?: number; count: number }>;
};

const defaultThresholds: ThresholdConfig = {
  wer: [0.08, 0.15, 0.3, 0.5],
  cer: [0.04, 0.08, 0.15, 0.3],
  mer: [0.06, 0.12, 0.25, 0.45],
  overgeneration: [0.01, 0.03, 0.08, 0.15],
  semanticRisk: [0.02, 0.05, 0.15, 0.3],
  exact: [0.9, 0.75, 0.5, 0.25],
  latency: [800, 1500, 3000, 6000],
  failure: [0.01, 0.03, 0.08, 0.15],
};

const categoryLabels: Record<string, string> = {
  code_switching: "Code-switching",
  short_utterance: "Short utterance",
  incomplete_audio: "Incomplete audio",
  general: "General",
};

const definitions = {
  wer: "Word error rate: word-level edits divided by contributor manual transcript word count. Lower is better.",
  cer: "Character error rate: character-level edits divided by contributor manual transcript character count after normalization. Lower is better and useful for Japanese.",
  mer: "Mixed error rate: English is compared by word while Japanese/CJK text is compared by character. Lower is better for code-switched clips.",
  overgeneration:
    "Overgeneration rate: inserted mixed tokens divided by the human reference token count. This catches hallucinated or completed speech.",
  semanticRisk:
    "Semantic risk rate: share of rows with action, object, direction, negation, or safety-sensitive changes. Lower is better.",
  exact: "Exact-match rate: share of completed STT outputs whose normalized hypothesis exactly equals the contributor manual transcript.",
  latency: "Median latency: middle observed provider response time in milliseconds.",
  p95: "p95 latency: 95th-percentile provider response time.",
  failure: "Failure rate: share of selected recording/model work items that failed instead of producing a transcript.",
  count: "Recording count: number of accepted recordings selected into this evaluation run.",
};

export function EvaluationMetricsView({ report, runs }: { report: EvaluationReport; runs: EvaluationRunOption[] }) {
  const router = useRouter();
  const initialBaseline = report.rows.find((row) => row.model?.id)?.model?.id ?? "all";
  const [thresholds, setThresholds] = useState<ThresholdConfig>(defaultThresholds);
  const [analysisFilters, setAnalysisFilters] = useState<FailureAnalysisFilters>({});
  const [comparisonFilters, setComparisonFilters] = useState<ComparisonFilters>({
    category: "all",
    language: "all",
    model: "all",
    sort: "regression",
  });
  const [baselineModelId, setBaselineModelId] = useState(initialBaseline);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string>();
  const [confusionRankMode, setConfusionRankMode] = useState<"frequency" | "severity">("frequency");

  const sortedRuns = useMemo(() => [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [runs]);
  const modelSummaries = useMemo(() => buildModelSummaries(report.rows), [report.rows]);
  const modelColumns = useMemo(() => visibleModelColumns(modelSummaries, baselineModelId, comparisonFilters.model), [
    modelSummaries,
    baselineModelId,
    comparisonFilters.model,
  ]);
  const filterOptions = useMemo(() => buildAnalysisFilterOptions(report.rows), [report.rows]);
  const comparisonGroups = useMemo(
    () => buildComparisonGroups(report.rows, comparisonFilters, baselineModelId),
    [report.rows, comparisonFilters, baselineModelId],
  );
  const selectedGroup =
    comparisonGroups.find((group) => group.recordingId === selectedRecordingId) ?? comparisonGroups[0];
  const heatmapRows = useMemo(() => buildHeatmapRows(report.rows, modelSummaries), [report.rows, modelSummaries]);
  const confusionPatterns = useMemo(
    () => extractConfusionPatterns(report.rows, analysisFilters, confusionRankMode),
    [report.rows, analysisFilters, confusionRankMode],
  );
  const invalidInputAnalysis = useMemo(
    () => analyzeInvalidInputs(report.rows, analysisFilters),
    [report.rows, analysisFilters],
  );

  const cards = [
    metricCard("Overall WER", report.summary.overallWer, "wer", thresholds.wer, "lower", definitions.wer, (value) =>
      value.toFixed(3),
    ),
    metricCard("Overall CER", report.summary.overallCer, "cer", thresholds.cer, "lower", definitions.cer, (value) =>
      value.toFixed(3),
    ),
    metricCard("Overall MER", report.summary.overallMer ?? report.summary.overallCer, "mer", thresholds.mer, "lower", definitions.mer, (value) =>
      value.toFixed(3),
    ),
    metricCard(
      "Overgeneration",
      report.summary.overgenerationRate ?? 0,
      "overgeneration",
      thresholds.overgeneration,
      "lower",
      definitions.overgeneration,
      percent,
    ),
    metricCard(
      "Semantic risk",
      report.summary.semanticRiskRate ?? 0,
      "semanticRisk",
      thresholds.semanticRisk,
      "lower",
      definitions.semanticRisk,
      percent,
    ),
    metricCard(
      "Failure rate",
      report.summary.failureRate,
      "failure",
      thresholds.failure,
      "lower",
      definitions.failure,
      percent,
    ),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{report.run.name}</h1>
          <p className="text-sm text-zinc-600">
            Linguistic diversity benchmark: prioritize code-switching, short utterances, and incomplete audio. CER and
            MER are the headline accuracy signals; overgeneration and semantic risk catch hallucinated or meaning-changing
            transcripts.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full min-w-[280px] space-y-2 sm:w-96">
            <Label>Experiment</Label>
            <Select value={report.run.id} onChange={(event) => router.push(`/admin/evaluations/${event.target.value}`)}>
              {sortedRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name} - {run.status} - {run.completedRecordings}/{run.totalRecordings} completed
                </option>
              ))}
            </Select>
          </div>
          <Link href="/api/admin/export/evaluations" className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
            Export evaluation results
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <MetricCard key={card.label} card={card} />
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-600">
              Recordings
              <MetricInfo text={definitions.count} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{report.summary.recordingCount}</p>
            <Badge className="mt-3" tone={report.summary.recordingCount < 3 ? "amber" : "blue"}>
              {report.summary.recordingCount < 3 ? "Tiny sample" : "Sample available"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <ComparisonControls
        modelSummaries={modelSummaries}
        baselineModelId={baselineModelId}
        filters={comparisonFilters}
        filterOptions={filterOptions}
        onBaselineChange={setBaselineModelId}
        onFiltersChange={setComparisonFilters}
      />

      <ModelSummaryGrid summaries={modelSummaries} baselineModelId={baselineModelId} thresholds={thresholds} />

      <ModelSliceHeatmap rows={heatmapRows} models={modelSummaries} />

      <ComparisonTable
        groups={comparisonGroups}
        modelColumns={modelColumns}
        baselineModelId={baselineModelId}
        selectedRecordingId={selectedGroup?.recordingId}
        onSelect={setSelectedRecordingId}
      />

      {selectedGroup ? <RecordingDetailPanel group={selectedGroup} modelColumns={modelColumns} baselineModelId={baselineModelId} /> : null}

      <ThresholdEditor thresholds={thresholds} onChange={setThresholds} />

      <AnalysisFilters options={filterOptions} filters={analysisFilters} onChange={setAnalysisFilters} />

      <ErrorConfusionExplorer
        patterns={confusionPatterns}
        rankMode={confusionRankMode}
        onRankModeChange={setConfusionRankMode}
      />

      <InvalidInputQueue analysis={invalidInputAnalysis} />
    </div>
  );
}

function MetricCard({ card }: { card: ReturnType<typeof metricCard> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-zinc-600">
          {card.label}
          <MetricInfo text={card.definition} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{card.formatted}</p>
        <Badge className="mt-3" tone={toneForSignal(card.signal)}>
          {card.signal}
        </Badge>
      </CardContent>
    </Card>
  );
}

function ComparisonControls({
  modelSummaries,
  baselineModelId,
  filters,
  filterOptions,
  onBaselineChange,
  onFiltersChange,
}: {
  modelSummaries: ModelSummary[];
  baselineModelId: string;
  filters: ComparisonFilters;
  filterOptions: FilterOptions;
  onBaselineChange: (value: string) => void;
  onFiltersChange: (value: ComparisonFilters) => void;
}) {
  const update = (key: keyof ComparisonFilters, value: string) =>
    onFiltersChange({ ...filters, [key]: value } as ComparisonFilters);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparison controls</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FilterSelect
            label="Baseline model"
            value={baselineModelId}
            options={modelSummaries.map((summary) => ({ value: summary.modelId, label: summary.modelName }))}
            onChange={onBaselineChange}
            includeAll={false}
          />
          <FilterSelect
            label="Focus model"
            value={filters.model}
            options={modelSummaries.map((summary) => ({ value: summary.modelId, label: summary.modelName }))}
            onChange={(value) => update("model", value)}
          />
          <FilterSelect
            label="Linguistic category"
            value={filters.category}
            options={filterOptions.categories.map((category) => ({ value: category, label: displayCategory(category) }))}
            onChange={(value) => update("category", value)}
          />
          <FilterSelect
            label="Language"
            value={filters.language}
            options={filterOptions.languages.map((language) => ({ value: language, label: language }))}
            onChange={(value) => update("language", value)}
          />
          <FilterSelect
            label="Sort"
            value={filters.sort}
            options={[
              { value: "regression", label: "Largest regression" },
              { value: "risk", label: "Highest semantic risk" },
              { value: "failure", label: "Provider failures first" },
              { value: "category", label: "Category" },
            ]}
            onChange={(value) => update("sort", value)}
            includeAll={false}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ModelSummaryGrid({
  summaries,
  baselineModelId,
  thresholds,
}: {
  summaries: ModelSummary[];
  baselineModelId: string;
  thresholds: ThresholdConfig;
}) {
  const baseline = summaries.find((summary) => summary.modelId === baselineModelId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-model comparison</CardTitle>
      </CardHeader>
      <CardContent>
        {summaries.length === 0 ? (
          <p className="text-sm text-zinc-600">No model results are available yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {summaries.map((summary) => {
              const delta = baseline && baseline.modelId !== summary.modelId ? summary.meanMer - baseline.meanMer : 0;
              return (
                <div key={summary.modelId} className="rounded-md border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{summary.modelName}</h3>
                      <p className="text-xs text-zinc-500">{summary.provider}</p>
                    </div>
                    {summary.modelId === baselineModelId ? <Badge tone="blue">baseline</Badge> : <DeltaBadge delta={delta} />}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <MiniMetric label="CER" value={summary.meanCer.toFixed(3)} tone={toneForSignal(scoreLower(summary.meanCer, thresholds.cer))} />
                    <MiniMetric label="MER" value={summary.meanMer.toFixed(3)} tone={toneForSignal(scoreLower(summary.meanMer, thresholds.mer))} />
                    <MiniMetric label="Failure" value={percent(summary.failureRate)} tone={toneForSignal(scoreLower(summary.failureRate, thresholds.failure))} />
                    <MiniMetric label="Latency" value={`${Math.round(summary.medianLatency)} ms`} />
                    <MiniMetric label="Overgen" value={percent(summary.overgenerationRate)} tone={toneForSignal(scoreLower(summary.overgenerationRate, thresholds.overgeneration))} />
                    <MiniMetric label="Risk" value={percent(summary.semanticRiskRate)} tone={toneForSignal(scoreLower(summary.semanticRiskRate, thresholds.semanticRisk))} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModelSliceHeatmap({ rows, models }: { rows: HeatmapRow[]; models: ModelSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Model-by-slice heatmap
          <MetricInfo text="X-axis is model; Y-axis is linguistic or data slice. Each cell shows mean primary error, using MER for code-switching and CER otherwise." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-zinc-500">
              <tr>
                <th className="w-44 py-2">Y-axis: slice</th>
                <th className="w-48">Value</th>
                {models.map((model) => (
                  <th key={model.modelId}>X-axis: {model.modelName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.axis}-${row.value}`} className="border-b border-border">
                  <td className="py-2 text-zinc-600">{row.axis}</td>
                  <td className="font-medium">{row.axis === "Linguistic category" ? displayCategory(row.value) : row.value}</td>
                  {models.map((model) => {
                    const cell = row.cells.get(model.modelId);
                    return (
                      <td key={model.modelId} className="py-2 pr-2">
                        <span
                          className="inline-flex min-w-20 justify-center rounded px-2 py-1 text-xs font-medium"
                          style={{ backgroundColor: heatColor(cell?.score), color: cell?.score === undefined ? "#71717a" : "#18181b" }}
                        >
                          {cell?.score === undefined ? "no data" : `${cell.score.toFixed(3)} (${cell.count})`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonTable({
  groups,
  modelColumns,
  baselineModelId,
  selectedRecordingId,
  onSelect,
}: {
  groups: ComparisonGroup[];
  modelColumns: ModelSummary[];
  baselineModelId: string;
  selectedRecordingId?: string;
  onSelect: (recordingId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recording comparison table</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-zinc-500">
              <tr>
                <th className="w-52 py-2">Recording</th>
                <th className="w-40">Category</th>
                <th className="w-52">Human transcript</th>
                {modelColumns.map((model) => (
                  <th key={model.modelId}>{model.modelName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr
                  key={group.recordingId}
                  className={`cursor-pointer border-b border-border hover:bg-muted ${selectedRecordingId === group.recordingId ? "bg-sky-50" : ""}`}
                  onClick={() => onSelect(group.recordingId)}
                >
                  <td className="py-3">
                    <div className="font-medium">{shortId(group.recordingId)}</div>
                    <div className="text-xs text-zinc-500">{group.durationBucket}</div>
                  </td>
                  <td>
                    <Badge>{displayCategory(group.category)}</Badge>
                    {group.codeSwitchLevel ? <Badge className="ml-1">{group.codeSwitchLevel}</Badge> : null}
                  </td>
                  <td className="max-w-72 truncate" title={group.humanTranscript}>
                    {group.humanTranscript || "(empty)"}
                  </td>
                  {modelColumns.map((model) => (
                    <ModelCell
                      key={model.modelId}
                      row={group.byModel.get(model.modelId)}
                      baseline={group.byModel.get(baselineModelId)}
                      isBaseline={model.modelId === baselineModelId}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {groups.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-border bg-muted p-4 text-sm text-zinc-600">
            No rows match the current comparison filters.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ModelCell({ row, baseline, isBaseline }: { row?: EvaluationReportRow; baseline?: EvaluationReportRow; isBaseline: boolean }) {
  if (!row) return <td className="text-zinc-500">not run</td>;
  if (row.result.status === "failed") {
    return (
      <td>
        <Badge tone="red">failed</Badge>
        <div className="mt-1 max-w-60 truncate text-xs text-zinc-500" title={row.result.errorMessage}>
          {row.result.errorMessage}
        </div>
      </td>
    );
  }
  if (!row.metric) return <td className="text-zinc-500">pending</td>;
  const score = primaryScore(row);
  const delta = baseline?.metric && !isBaseline ? score - primaryScore(baseline) : 0;
  return (
    <td>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{score.toFixed(3)}</span>
        {isBaseline ? <Badge tone="blue">base</Badge> : <DeltaBadge delta={delta} row={row} baseline={baseline} />}
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        CER {row.metric.characterErrorRate.toFixed(3)} / MER {(row.metric.mixedErrorRate ?? row.metric.characterErrorRate).toFixed(3)}
      </div>
    </td>
  );
}

function RecordingDetailPanel({
  group,
  modelColumns,
  baselineModelId,
}: {
  group: ComparisonGroup;
  modelColumns: ModelSummary[];
  baselineModelId: string;
}) {
  const firstRecording = group.rows.find((row) => row.recording)?.recording;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trace detail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{displayCategory(group.category)}</Badge>
              <Badge>{group.language}</Badge>
              <Badge>{group.durationBucket}</Badge>
              {group.codeSwitchLevel ? <Badge>{group.codeSwitchLevel}</Badge> : null}
            </div>
            <p>
              <strong>Prompt instruction:</strong> {group.instruction}
            </p>
            <p>
              <strong>Human transcript:</strong> {group.humanTranscript || "(empty)"}
            </p>
          </div>
          {firstRecording ? <audio src={`/api/audio/${firstRecording.id}`} controls className="w-full" /> : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {modelColumns.map((model) => {
            const row = group.byModel.get(model.modelId);
            if (!row) return null;
            const baseline = group.byModel.get(baselineModelId);
            return (
              <div key={model.modelId} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{model.modelName}</h3>
                    <p className="text-xs text-zinc-500">{model.provider}</p>
                  </div>
                  {model.modelId === baselineModelId ? <Badge tone="blue">baseline</Badge> : <DeltaBadge delta={baseline?.metric && row.metric ? primaryScore(row) - primaryScore(baseline) : 0} row={row} baseline={baseline} />}
                </div>
                <p className="mt-3">
                  <strong>Model transcript:</strong> {row.result.hypothesis ?? row.result.errorMessage ?? "(empty)"}
                </p>
                {row.metric ? (
                  <div className="mt-3 space-y-2">
                    <MetricLine row={row} />
                    <div className="rounded-md bg-muted p-3">
                      <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Normalized human-to-model diff</p>
                      <DiffView reference={row.metric.referenceNormalized} hypothesis={row.metric.hypothesisNormalized} />
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="mb-2 text-xs font-medium uppercase text-zinc-500">MER-oriented diff</p>
                      <DiffView
                        reference={mixedTokensForMer(row.metric.referenceNormalized).join(" ")}
                        hypothesis={mixedTokensForMer(row.metric.hypothesisNormalized).join(" ")}
                      />
                    </div>
                    <p className="text-zinc-700">
                      <strong>Scoring rationale:</strong> {scoringRationale(row)}
                    </p>
                    {row.metric.scorerScoresJson ? <ScorerScoreLine scores={row.metric.scorerScoresJson} /> : null}
                  </div>
                ) : null}
                <dl className="mt-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-3">
                  <div>
                    <dt className="uppercase">Status</dt>
                    <dd>{row.result.status}</dd>
                  </div>
                  <div>
                    <dt className="uppercase">Detected language</dt>
                    <dd>{row.result.detectedLanguage ?? "unknown"}</dd>
                  </div>
                  <div>
                    <dt className="uppercase">Latency</dt>
                    <dd>{row.result.latencyMs ? `${row.result.latencyMs} ms` : "n/a"}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricLine({ row }: { row: EvaluationReportRow }) {
  if (!row.metric) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Badge>WER {row.metric.wordErrorRate.toFixed(3)}</Badge>
      <Badge>CER {row.metric.characterErrorRate.toFixed(3)}</Badge>
      <Badge>MER {(row.metric.mixedErrorRate ?? row.metric.characterErrorRate).toFixed(3)}</Badge>
      <Badge>Overgen {percent(row.metric.overgenerationRate ?? 0)}</Badge>
      {(row.metric.semanticRiskFlags ?? []).map((flag) => (
        <Badge key={flag} tone="red">
          {flag.replaceAll("_", " ")}
        </Badge>
      ))}
    </div>
  );
}

function ScorerScoreLine({ scores }: { scores: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(scores).map(([key, value]) => (
        <Badge key={key}>
          {key.replaceAll("_", " ")} {value.toFixed(3)}
        </Badge>
      ))}
    </div>
  );
}

function metricCard(
  label: string,
  value: number,
  key: keyof ThresholdConfig,
  threshold: [number, number, number, number],
  direction: "lower" | "higher",
  definition: string,
  format: (value: number) => string,
) {
  return {
    label,
    value,
    key,
    definition,
    formatted: format(value),
    signal: direction === "lower" ? scoreLower(value, threshold) : scoreHigher(value, threshold),
  };
}

function buildModelSummaries(rows: EvaluationReportRow[]): ModelSummary[] {
  const groups = new Map<string, EvaluationReportRow[]>();
  for (const row of rows) {
    const key = modelKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([modelId, group]) => {
    const completedRows = group.filter((row) => row.metric);
    const latencies = completedRows.map((row) => row.result.latencyMs ?? 0).filter((value) => value > 0);
    const first = group[0];
    return {
      modelId,
      modelName: first?.model?.displayName ?? "Unknown model",
      provider: providerLabel(first?.model?.provider),
      rows: group,
      completedRows,
      meanWer: mean(completedRows.map((row) => row.metric?.wordErrorRate ?? 0)),
      meanCer: mean(completedRows.map((row) => row.metric?.characterErrorRate ?? 0)),
      meanMer: mean(completedRows.map((row) => row.metric?.mixedErrorRate ?? row.metric?.characterErrorRate ?? 0)),
      failureRate: group.length ? group.filter((row) => row.result.status === "failed").length / group.length : 0,
      medianLatency: percentile(latencies, 0.5),
      overgenerationRate: mean(completedRows.map((row) => row.metric?.overgenerationRate ?? 0)),
      semanticRiskRate: completedRows.length
        ? completedRows.filter((row) => (row.metric?.semanticRiskFlags?.length ?? 0) > 0).length / completedRows.length
        : 0,
    };
  });
}

function visibleModelColumns(summaries: ModelSummary[], baselineModelId: string, focusModelId: string) {
  if (focusModelId === "all") return summaries;
  const ids = new Set([baselineModelId, focusModelId]);
  return summaries.filter((summary) => ids.has(summary.modelId));
}

function buildComparisonGroups(rows: EvaluationReportRow[], filters: ComparisonFilters, baselineModelId: string) {
  const filteredBySlice = rows.filter((row) => {
    if (filters.category !== "all" && rowCategory(row) !== filters.category) return false;
    if (filters.language !== "all" && (row.prompt?.language ?? "Unknown") !== filters.language) return false;
    return true;
  });
  const focusedRecordingIds =
    filters.model === "all"
      ? undefined
      : new Set(filteredBySlice.filter((row) => modelKey(row) === filters.model).map(recordingKey));
  const filteredRows = focusedRecordingIds
    ? filteredBySlice.filter((row) => focusedRecordingIds.has(recordingKey(row)))
    : filteredBySlice;
  const groups = new Map<string, ComparisonGroup>();
  for (const row of filteredRows) {
    const key = recordingKey(row);
    const existing =
      groups.get(key) ??
      ({
        recordingId: key,
        humanTranscript: row.recording?.contributorTranscript ?? "",
        instruction: row.prompt?.exactText ?? row.prompt?.displayInstruction ?? "",
        language: row.prompt?.language ?? "Unknown",
        category: rowCategory(row),
        codeSwitchLevel: codeSwitchLevel(row),
        durationBucket: durationBucket(row),
        rows: [],
        byModel: new Map<string, EvaluationReportRow>(),
      } satisfies ComparisonGroup);
    existing.rows.push(row);
    existing.byModel.set(modelKey(row), row);
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => compareGroups(a, b, filters.sort, baselineModelId));
}

function compareGroups(a: ComparisonGroup, b: ComparisonGroup, sort: ComparisonFilters["sort"], baselineModelId: string) {
  if (sort === "category") return displayCategory(a.category).localeCompare(displayCategory(b.category)) || a.recordingId.localeCompare(b.recordingId);
  if (sort === "failure") return Number(hasFailure(b)) - Number(hasFailure(a)) || maxPrimaryScore(b) - maxPrimaryScore(a);
  if (sort === "risk") return groupRiskScore(b) - groupRiskScore(a) || maxPrimaryScore(b) - maxPrimaryScore(a);
  return maxRegressionScore(b, baselineModelId) - maxRegressionScore(a, baselineModelId) || groupRiskScore(b) - groupRiskScore(a);
}

function buildHeatmapRows(rows: EvaluationReportRow[], models: ModelSummary[]) {
  const slices = [
    { axis: "Linguistic category", values: unique(rows.map(rowCategory)) },
    { axis: "Language", values: unique(rows.map((row) => row.prompt?.language ?? "Unknown")) },
    { axis: "Code-switch level", values: unique(rows.map(codeSwitchLevel).filter(Boolean) as string[]) },
    { axis: "Duration bucket", values: unique(rows.map(durationBucket)) },
  ];
  return slices.flatMap((slice) =>
    slice.values.map((value) => {
      const cells = new Map<string, { score?: number; count: number }>();
      for (const model of models) {
        const modelRows = rows.filter((row) => modelKey(row) === model.modelId && sliceValue(row, slice.axis) === value && row.metric);
        cells.set(model.modelId, {
          count: modelRows.length,
          score: modelRows.length ? mean(modelRows.map(primaryScore)) : undefined,
        });
      }
      return { axis: slice.axis, value, cells };
    }),
  );
}

function sliceValue(row: EvaluationReportRow, axis: string) {
  if (axis === "Linguistic category") return rowCategory(row);
  if (axis === "Language") return row.prompt?.language ?? "Unknown";
  if (axis === "Code-switch level") return codeSwitchLevel(row) ?? "Unknown";
  return durationBucket(row);
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

function primaryScore(row: EvaluationReportRow) {
  if (!row.metric) return Number.POSITIVE_INFINITY;
  return rowCategory(row) === "code_switching"
    ? row.metric.mixedErrorRate ?? row.metric.characterErrorRate
    : row.metric.characterErrorRate;
}

function maxPrimaryScore(group: ComparisonGroup) {
  const scores = group.rows.filter((row) => row.metric).map(primaryScore);
  return scores.length ? Math.max(...scores) : 0;
}

function maxRegressionScore(group: ComparisonGroup, baselineModelId: string) {
  const baseline = group.byModel.get(baselineModelId);
  if (!baseline?.metric) return maxPrimaryScore(group);
  const baselineScore = primaryScore(baseline);
  return Math.max(0, ...group.rows.filter((row) => row.metric).map((row) => primaryScore(row) - baselineScore));
}

function groupRiskScore(group: ComparisonGroup) {
  return Math.max(
    0,
    ...group.rows.map((row) => (row.metric?.semanticRiskFlags?.length ?? 0) + (row.metric?.overgenerationRate ?? 0)),
  );
}

function hasFailure(group: ComparisonGroup) {
  return group.rows.some((row) => row.result.status === "failed");
}

function modelKey(row: EvaluationReportRow) {
  return row.model?.id ?? row.model?.displayName ?? "unknown-model";
}

function recordingKey(row: EvaluationReportRow) {
  return row.recording?.id ?? row.result.recordingId ?? row.result.id;
}

function codeSwitchLevel(row: EvaluationReportRow) {
  const level = row.prompt?.slotsJson?.codeSwitchLevel ?? row.prompt?.slotsJson?.code_switch_level;
  if (typeof level === "string" && level.trim()) return level.trim();
  const tag = row.prompt?.tags?.find((item) => item.startsWith("cs-level:"));
  return tag?.slice("cs-level:".length);
}

function durationBucket(row: EvaluationReportRow) {
  const duration = row.recording?.durationMs ?? 0;
  if (duration < 3000) return "0-3 seconds";
  if (duration < 8000) return "3-8 seconds";
  return "8+ seconds";
}

function DeltaBadge({ delta, row, baseline }: { delta: number; row?: EvaluationReportRow; baseline?: EvaluationReportRow }) {
  const label = row || baseline ? deltaLabel(delta, row, baseline) : summaryDeltaLabel(delta);
  return <Badge tone={toneForDelta(label)}>{label}</Badge>;
}

function summaryDeltaLabel(delta: number) {
  if (delta <= -0.02) return "improvement";
  if (delta >= 0.02) return "regression";
  return "tie";
}

function deltaLabel(delta: number, row?: EvaluationReportRow, baseline?: EvaluationReportRow) {
  if (!row?.metric || !baseline?.metric) return "tie";
  const latencyDelta = (row.result.latencyMs ?? 0) - (baseline.result.latencyMs ?? 0);
  if (delta <= -0.02) return latencyDelta > 1000 ? "tradeoff" : "improvement";
  if (delta >= 0.02) return "regression";
  return "tie";
}

function toneForDelta(label: string) {
  if (label === "improvement") return "green";
  if (label === "regression") return "red";
  if (label === "tradeoff") return "amber";
  return "blue";
}

function scoreLower(value: number, thresholds: [number, number, number, number]) {
  if (value <= thresholds[0]) return "Very good";
  if (value <= thresholds[1]) return "Good";
  if (value <= thresholds[2]) return "Fair";
  if (value <= thresholds[3]) return "Weak";
  return "Bad";
}

function scoreHigher(value: number, thresholds: [number, number, number, number]) {
  if (value >= thresholds[0]) return "Very good";
  if (value >= thresholds[1]) return "Good";
  if (value >= thresholds[2]) return "Fair";
  if (value >= thresholds[3]) return "Weak";
  return "Bad";
}

function toneForSignal(signal: string) {
  if (signal === "Very good" || signal === "Good") return "green";
  if (signal === "Fair") return "blue";
  if (signal === "Weak") return "amber";
  return "red";
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

type FilterOptions = {
  models: string[];
  environments: string[];
  noise: string[];
  languages: string[];
  commandTypes: string[];
  categories: string[];
};

function buildAnalysisFilterOptions(rows: EvaluationReportRow[]): FilterOptions {
  const uniqueValues = (values: Array<string | undefined>) =>
    [...new Set(values.map((value) => value || "Unknown"))].sort((a, b) => a.localeCompare(b));
  return {
    models: uniqueValues(rows.map((row) => row.model?.displayName)),
    environments: uniqueValues(rows.map((row) => row.session?.environmentType)),
    noise: uniqueValues(rows.map(noiseLabel)),
    languages: uniqueValues(rows.map((row) => row.prompt?.language)),
    commandTypes: uniqueValues(rows.map((row) => row.prompt?.taskType ?? row.prompt?.commandVariant)),
    categories: uniqueValues(rows.map(rowCategory)),
  };
}

function AnalysisFilters({
  options,
  filters,
  onChange,
}: {
  options: FilterOptions;
  filters: FailureAnalysisFilters;
  onChange: (next: FailureAnalysisFilters) => void;
}) {
  const update = (key: keyof FailureAnalysisFilters, value: string) => {
    onChange({ ...filters, [key]: value === "all" ? undefined : value });
  };
  return (
    <details className="rounded-lg border border-border bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">Failure-analysis filters</summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Model" value={filters.model ?? "all"} options={options.models} onChange={(value) => update("model", value)} />
        <FilterSelect label="Environment" value={filters.environment ?? "all"} options={options.environments} onChange={(value) => update("environment", value)} />
        <FilterSelect label="Noise/SNR" value={filters.noise ?? "all"} options={options.noise} onChange={(value) => update("noise", value)} />
        <FilterSelect label="Language" value={filters.language ?? "all"} options={options.languages} onChange={(value) => update("language", value)} />
        <FilterSelect label="Command type" value={filters.commandType ?? "all"} options={options.commandTypes} onChange={(value) => update("commandType", value)} />
        <FilterSelect label="Hesitation" value={filters.hesitation ?? "all"} options={["yes", "no"]} onChange={(value) => update("hesitation", value)} />
        <FilterSelect label="Self-correction" value={filters.selfCorrection ?? "all"} options={["yes", "no"]} onChange={(value) => update("selfCorrection", value)} />
      </div>
    </details>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  includeAll = true,
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
  includeAll?: boolean;
}) {
  const normalized = options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {includeAll ? <option value="all">All</option> : null}
        {normalized.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ErrorConfusionExplorer({
  patterns,
  rankMode,
  onRankModeChange,
}: {
  patterns: ConfusionPattern[];
  rankMode: "frequency" | "severity";
  onRankModeChange: (mode: "frequency" | "severity") => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = patterns.find((pattern) => pattern.id === selectedId) ?? patterns[0];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Error Confusion Explorer</CardTitle>
          <div className="w-48">
            <Label className="sr-only">Rank mode</Label>
            <Select value={rankMode} onChange={(event) => onRankModeChange(event.target.value as "frequency" | "severity")}>
              <option value="frequency">Frequency rank</option>
              <option value="severity">Severity rank</option>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {patterns.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted p-4 text-sm text-zinc-600">
            No confusion patterns match the current filters. Completed rows with non-matching reference/model text are required.
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-2">Pattern</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Count</th>
                    <th>Samples</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {patterns.slice(0, 20).map((pattern) => (
                    <tr key={pattern.id} className="cursor-pointer border-b border-border hover:bg-muted" onClick={() => setSelectedId(pattern.id)}>
                      <td className="py-2 font-medium">{pattern.label}</td>
                      <td>{pattern.kind}</td>
                      <td>{pattern.category.replace("_", " ")}</td>
                      <td>{pattern.count}</td>
                      <td>
                        {pattern.sampleCount} {pattern.limitedSample ? <Badge tone="amber">limited sample</Badge> : null}
                      </td>
                      <td>
                        <Badge tone={pattern.severity >= 3 ? "red" : pattern.severity === 2 ? "amber" : "blue"}>
                          {pattern.severity}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected ? (
              <div className="rounded-md border border-border bg-muted p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{selected.label}</strong>
                  <Badge>
                    {selected.sampleCount} sample{selected.sampleCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="mt-3 space-y-3">
                  {selected.examples.map((example, index) => (
                    <div key={`${selected.id}-${example.rowId}-${index}`} className="rounded-md border border-border bg-white p-3 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{example.modelName}</Badge>
                        {example.metadata.slice(1, 5).map((item) => (
                          <Badge key={item}>{item}</Badge>
                        ))}
                      </div>
                      <p className="mt-2">
                        <strong>Reference:</strong> {example.reference || "(empty)"}
                      </p>
                      <p>
                        <strong>Model:</strong> {example.hypothesis || "(empty)"}
                      </p>
                      <p className="text-zinc-600">
                        <strong>Metadata:</strong> {example.metadata.join(" / ")}
                      </p>
                      <audio src={`/api/audio/${example.recordingId}`} controls className="mt-2 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InvalidInputQueue({ analysis }: { analysis: InvalidInputAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invalid Input & Hallucination Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <MiniMetric label="Invalid clips" value={String(analysis.invalidCount)} />
          <MiniMetric label="Non-empty transcript rate" value={percent(analysis.nonEmptyTranscriptRate)} />
          <MiniMetric label="Avg inserted words / invalid clip" value={analysis.avgInsertedWordsPerInvalidClip.toFixed(1)} />
          <MiniMetric label="Valid-command prediction rate" value={percent(analysis.validCommandPredictionRate)} />
          <MiniMetric label="False actionable command rate" value={percent(analysis.falseActionableCommandRate)} />
        </div>
        {analysis.queue.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted p-4 text-sm text-zinc-600">
            No invalid-input rows match the current filters. New recordings default to <code>valid_command</code> until they are labeled.
          </div>
        ) : (
          <div className="space-y-3">
            {analysis.queue.map((item) => (
              <div key={item.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={item.severity === "high" ? "red" : item.severity === "medium" ? "amber" : "blue"}>{item.severity}</Badge>
                  <Badge>{item.validity}</Badge>
                  <Badge>{item.modelName}</Badge>
                  <Badge>{item.wordCount} words</Badge>
                  <Badge tone={item.interpretedAsValidCommand ? "red" : "green"}>
                    {item.interpretedAsValidCommand ? "actionable" : "not actionable"}
                  </Badge>
                </div>
                <p className="mt-2">
                  <strong>STT transcript:</strong> {item.transcript || "(empty)"}
                </p>
                {item.matchedActionTerms.length ? (
                  <p>
                    <strong>Matched action terms:</strong> {item.matchedActionTerms.join(", ")}
                  </p>
                ) : null}
                <p className="text-zinc-600">
                  <strong>Metadata:</strong> {item.metadata.join(" / ")}
                </p>
                <audio src={`/api/audio/${item.recordingId}`} controls className="mt-2 w-full" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone?: "neutral" | "green" | "amber" | "red" | "blue" }) {
  return (
    <div className="rounded-md border border-border bg-muted p-3">
      <p className="text-xs uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {tone ? <Badge className="mt-2" tone={tone}>{tone}</Badge> : null}
    </div>
  );
}

function scoringRationale(row: EvaluationReportRow) {
  if (row.result.status === "failed") return `The provider failed before producing a transcript: ${row.result.errorMessage ?? "unknown error"}.`;
  if (!row.metric) return "This item has not produced metrics yet.";
  if (row.metric.scorerRationale) return row.metric.scorerRationale;
  if (row.metric.exactMatch) {
    return "After normalization, the contributor's manual transcript and model transcript match exactly.";
  }
  const edits = row.metric.insertions + row.metric.deletions + row.metric.substitutions;
  const risks = row.metric.semanticRiskFlags?.length
    ? ` Semantic risk flags: ${row.metric.semanticRiskFlags.join(", ")}.`
    : "";
  const languageNote =
    rowCategory(row) === "code_switching"
      ? "MER is the better comparison signal here because the command mixes English words with Japanese/CJK characters."
      : row.prompt?.language?.includes("Japanese")
        ? "CER is usually the safer headline signal for Japanese text because word spacing can be ambiguous."
        : "WER and CER should generally move together for English commands.";
  return `The normalized comparison found ${edits} word-level edit${edits === 1 ? "" : "s"} over ${
    row.metric.referenceWordCount
  } reference word${row.metric.referenceWordCount === 1 ? "" : "s"}. Overgeneration is ${percent(
    row.metric.overgenerationRate ?? 0,
  )}.${risks} ${languageNote}`;
}

function DiffView({ reference, hypothesis }: { reference: string; hypothesis: string }) {
  const parts = diffParts(reference, hypothesis);
  return (
    <div className="flex flex-wrap gap-1 leading-7">
      {parts.map((part, index) => (
        <span
          key={`${part.kind}-${part.value}-${index}`}
          className={
            part.kind === "same"
              ? "rounded bg-white px-1.5 py-0.5"
              : part.kind === "missing"
                ? "rounded bg-red-100 px-1.5 py-0.5 text-red-800 line-through"
                : "rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800"
          }
          title={part.kind === "missing" ? "In human reference, missing from model" : part.kind === "added" ? "Added by model" : "Matched"}
        >
          {part.kind === "added" ? `+${part.value}` : part.kind === "missing" ? `-${part.value}` : part.value}
        </span>
      ))}
    </div>
  );
}

function MetricInfo({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-4 w-4 text-zinc-500" aria-label="Metric definition" />
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-72 -translate-x-1/2 rounded-md border border-border bg-white p-3 text-xs font-normal leading-5 text-zinc-700 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function ThresholdEditor({
  thresholds,
  onChange,
}: {
  thresholds: ThresholdConfig;
  onChange: (next: ThresholdConfig) => void;
}) {
  const rows: Array<{
    key: keyof ThresholdConfig;
    label: string;
    direction: "lower" | "higher";
    units: string;
  }> = [
    { key: "wer", label: "WER", direction: "lower", units: "rate" },
    { key: "cer", label: "CER", direction: "lower", units: "rate" },
    { key: "mer", label: "MER", direction: "lower", units: "rate" },
    { key: "overgeneration", label: "Overgeneration", direction: "lower", units: "rate" },
    { key: "semanticRisk", label: "Semantic risk", direction: "lower", units: "rate" },
    { key: "exact", label: "Exact match", direction: "higher", units: "rate" },
    { key: "latency", label: "Latency", direction: "lower", units: "ms" },
    { key: "failure", label: "Failure", direction: "lower", units: "rate" },
  ];

  function update(key: keyof ThresholdConfig, index: number, value: number) {
    const nextValues = [...thresholds[key]] as [number, number, number, number];
    nextValues[index] = value;
    onChange({ ...thresholds, [key]: nextValues });
  }

  return (
    <details className="rounded-lg border border-border bg-white p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="h-4 w-4" />
        Manual benchmark thresholds
      </summary>
      <div className="mt-4 overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2">Metric</th>
              <th>Direction</th>
              <th>Very good</th>
              <th>Good</th>
              <th>Fair</th>
              <th>Weak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border">
                <td className="py-2 font-medium">{row.label}</td>
                <td>{row.direction === "lower" ? "Lower is better" : "Higher is better"}</td>
                {thresholds[row.key].map((value, index) => (
                  <td key={index} className="py-2 pr-2">
                    <Label className="sr-only">
                      {row.label} {index}
                    </Label>
                    <Input
                      type="number"
                      step={row.units === "ms" ? 100 : 0.01}
                      value={value}
                      onChange={(event) => update(row.key, index, Number(event.target.value))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function heatColor(value?: number) {
  if (value === undefined) return "#f4f4f5";
  if (value <= 0.06) return "#dcfce7";
  if (value <= 0.15) return "#e0f2fe";
  if (value <= 0.3) return "#fef3c7";
  return "#fee2e2";
}

function displayCategory(value: string) {
  return categoryLabels[value] ?? value.replaceAll("_", " ");
}

function providerLabel(value?: string) {
  if (value === "openai") return "OpenAI API";
  if (value === "gemini") return "Google Gemini API";
  if (value === "elevenlabs") return "ElevenLabs API";
  if (value === "deepgram") return "Deepgram API";
  if (value === "mock") return "Local mock";
  return "Unknown provider";
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
}

function shortId(value: string) {
  return value.length > 12 ? value.slice(0, 8) : value;
}
