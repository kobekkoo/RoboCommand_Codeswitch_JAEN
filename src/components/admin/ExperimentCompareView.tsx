"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, GitCompare, Lightbulb, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/forms";
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
    status: string;
    totalRecordings: number;
    completedRecordings: number;
    failedRecordings: number;
    createdAt: string;
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
  createdAt: string;
  totalRecordings: number;
  completedRecordings: number;
  failedRecordings: number;
};

type CompareRow = {
  recordingId: string;
  reference: string;
  instruction: string;
  baselineRows: EvaluationReportRow[];
  candidateRows: EvaluationReportRow[];
  baselineScore: number;
  candidateScore: number;
};

export function ExperimentCompareView({
  runs,
  baselineId,
  candidateId,
  baselineReport,
  candidateReport,
}: {
  runs: RunOption[];
  baselineId?: string;
  candidateId?: string;
  baselineReport?: EvaluationReport;
  candidateReport?: EvaluationReport;
}) {
  const router = useRouter();
  const compareRows = useMemo(() => buildCompareRows(baselineReport, candidateReport), [baselineReport, candidateReport]);
  const sliceRows = useMemo(() => buildSliceRows(baselineReport, candidateReport), [baselineReport, candidateReport]);
  const riskyRows = useMemo(() => buildRiskQueue(candidateReport), [candidateReport]);
  const scoreDistribution = useMemo(() => buildScoreDistribution(baselineReport, candidateReport), [baselineReport, candidateReport]);
  const modelSliceHeatmap = useMemo(() => buildModelSliceHeatmap(candidateReport), [candidateReport]);
  const regressionRows = useMemo(() => compareRows.filter((row) => row.candidateScore - row.baselineScore > 0.02).slice(0, 5), [compareRows]);
  const recommendation = decisionRecommendation(baselineReport, candidateReport);

  function updateSelection(nextBaselineId = baselineId, nextCandidateId = candidateId) {
    const params = new URLSearchParams();
    if (nextBaselineId) params.set("baseline", nextBaselineId);
    if (nextCandidateId) params.set("candidate", nextCandidateId);
    router.push(`/admin/evaluations/compare?${params.toString()}`);
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compare Experiments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600">No experiments are available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Compare Experiments</h1>
          <p className="text-sm text-zinc-600">Dataset + task + scorer snapshots compared against a baseline experiment.</p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:min-w-[620px] sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Baseline</Label>
            <Select value={baselineId ?? ""} onChange={(event) => updateSelection(event.target.value, candidateId)}>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Candidate</Label>
            <Select value={candidateId ?? ""} onChange={(event) => updateSelection(baselineId, event.target.value)}>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {baselineReport && candidateReport ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <DeltaCard label="MER" baseline={baselineReport.summary.overallMer ?? baselineReport.summary.overallCer} candidate={candidateReport.summary.overallMer ?? candidateReport.summary.overallCer} />
            <DeltaCard label="CER" baseline={baselineReport.summary.overallCer} candidate={candidateReport.summary.overallCer} />
            <DeltaCard label="WER" baseline={baselineReport.summary.overallWer} candidate={candidateReport.summary.overallWer} />
            <DeltaCard label="Failure" baseline={baselineReport.summary.failureRate} candidate={candidateReport.summary.failureRate} percent />
            <DeltaCard label="Hallucination" baseline={baselineReport.summary.overgenerationRate ?? 0} candidate={candidateReport.summary.overgenerationRate ?? 0} percent />
            <DeltaCard label="Latency" baseline={baselineReport.summary.medianLatency} candidate={candidateReport.summary.medianLatency} suffix=" ms" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Badge tone={recommendation.tone}>{recommendation.label}</Badge>
              <p className="text-sm text-zinc-700">{recommendation.copy}</p>
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-3">
            <ScoreDistributionCard distribution={scoreDistribution} />
            <ModelSliceHeatmapCard rows={modelSliceHeatmap} />
            <RegressionQueueCard rows={regressionRows} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-4 w-4" />
                  Slice Regressions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="min-w-full divide-y divide-border text-left text-sm">
                    <thead className="bg-muted text-xs uppercase tracking-normal text-zinc-600">
                      <tr>
                        <th className="px-3 py-2">Slice</th>
                        <th className="px-3 py-2">Baseline MER</th>
                        <th className="px-3 py-2">Candidate MER</th>
                        <th className="px-3 py-2">Delta</th>
                        <th className="px-3 py-2">Rows</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-white">
                      {sliceRows.map((row) => (
                        <tr key={`${row.label}-${row.name}`}>
                          <td className="px-3 py-3">
                            <span className="font-medium">{row.label}</span>
                            <span className="block text-xs text-zinc-500">{row.name}</span>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs">{row.baseline.toFixed(3)}</td>
                          <td className="px-3 py-3 font-mono text-xs">{row.candidate.toFixed(3)}</td>
                          <td className="px-3 py-3">
                            <DeltaBadge delta={row.candidate - row.baseline} />
                          </td>
                          <td className="px-3 py-3">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4" />
                  Hallucination Queue
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {riskyRows.map((row) => (
                  <div key={row.result.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={(row.metric?.semanticRiskFlags?.length ?? 0) > 0 ? "red" : "amber"}>
                        Overgen {percent(row.metric?.overgenerationRate ?? 0)}
                      </Badge>
                      <Badge>{row.model?.displayName ?? "Unknown model"}</Badge>
                    </div>
                    <p className="mt-2">
                      <strong>Human:</strong> {row.recording?.contributorTranscript ?? "(empty)"}
                    </p>
                    <p>
                      <strong>Model:</strong> {row.result.hypothesis ?? row.result.errorMessage ?? "(empty)"}
                    </p>
                  </div>
                ))}
                {riskyRows.length === 0 ? <p className="text-sm text-zinc-600">No high-risk rows in the candidate experiment.</p> : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Row Comparison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {compareRows.map((row) => (
                <details key={row.recordingId} className="rounded-md border border-border p-3 text-sm">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{row.reference || "(empty human transcript)"}</p>
                        <p className="mt-1 text-xs text-zinc-600">{row.instruction}</p>
                      </div>
                      <DeltaBadge delta={row.candidateScore - row.baselineScore} />
                    </div>
                  </summary>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <TraceColumn label="Baseline" rows={row.baselineRows} />
                    <TraceColumn label="Candidate" rows={row.candidateRows} />
                  </div>
                  <audio src={`/api/audio/${row.recordingId}`} controls className="mt-3 w-full" />
                </details>
              ))}
              {compareRows.length === 0 ? <p className="text-sm text-zinc-600">No overlapping recording rows to compare yet.</p> : null}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-zinc-600">Choose two experiments with processed metrics to compare.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeltaCard({
  label,
  baseline,
  candidate,
  percent: isPercent,
  suffix = "",
}: {
  label: string;
  baseline: number;
  candidate: number;
  percent?: boolean;
  suffix?: string;
}) {
  const delta = candidate - baseline;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-zinc-600">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{isPercent ? percent(candidate) : `${candidate.toFixed(3)}${suffix}`}</p>
        <div className="mt-3">
          <DeltaBadge delta={delta} suffix={suffix} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">Baseline {isPercent ? percent(baseline) : `${baseline.toFixed(3)}${suffix}`}</p>
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ delta, suffix = "" }: { delta: number; suffix?: string }) {
  const rounded = Math.abs(delta) < 0.001 ? 0 : delta;
  if (rounded === 0) {
    return (
      <Badge>
        <ArrowRight className="mr-1 h-3 w-3" />
        tie
      </Badge>
    );
  }
  const improved = rounded < 0;
  return (
    <Badge tone={improved ? "green" : "red"}>
      {improved ? <ArrowDown className="mr-1 h-3 w-3" /> : <ArrowUp className="mr-1 h-3 w-3" />}
      {improved ? "improved" : "regressed"} {Math.abs(rounded).toFixed(3)}
      {suffix}
    </Badge>
  );
}

function TraceColumn({ label, rows }: { label: string; rows: EvaluationReportRow[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <h3 className="font-semibold">{label}</h3>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.result.id} className="rounded-md bg-muted p-3">
            <div className="flex flex-wrap gap-2">
              <Badge>{row.model?.displayName ?? "Unknown model"}</Badge>
              <Badge tone={row.result.status === "completed" ? "green" : "red"}>{row.result.status}</Badge>
              {row.metric ? <Badge>MER {(row.metric.mixedErrorRate ?? row.metric.characterErrorRate).toFixed(3)}</Badge> : null}
              {row.result.latencyMs ? <Badge>{row.result.latencyMs} ms</Badge> : null}
            </div>
            <p className="mt-2">{row.result.hypothesis ?? row.result.errorMessage ?? "(empty)"}</p>
            {row.metric ? (
              <p className="mt-2 text-xs text-zinc-600">
                WER {row.metric.wordErrorRate.toFixed(3)} · CER {row.metric.characterErrorRate.toFixed(3)} · Overgen{" "}
                {percent(row.metric.overgenerationRate ?? 0)}
              </p>
            ) : null}
            {row.metric?.scorerRationale ? <p className="mt-2 text-xs text-zinc-600">{row.metric.scorerRationale}</p> : null}
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-zinc-600">Not run for this recording.</p> : null}
      </div>
    </div>
  );
}

function ScoreDistributionCard({
  distribution,
}: {
  distribution: Array<{ bucket: string; baseline: number; candidate: number }>;
}) {
  const maxCount = Math.max(1, ...distribution.flatMap((row) => [row.baseline, row.candidate]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Score Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {distribution.map((row) => (
          <div key={row.bucket} className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <span className="font-medium">{row.bucket}</span>
              <span className="text-xs text-zinc-500">B {row.baseline} / C {row.candidate}</span>
            </div>
            <div className="grid gap-1">
              <div className="h-2 rounded bg-muted">
                <div className="h-2 rounded bg-sky-500" style={{ width: `${(row.baseline / maxCount) * 100}%` }} />
              </div>
              <div className="h-2 rounded bg-muted">
                <div className="h-2 rounded bg-emerald-500" style={{ width: `${(row.candidate / maxCount) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ModelSliceHeatmapCard({ rows }: { rows: Array<{ model: string; slice: string; score: number; count: number }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model By Slice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={`${row.model}-${row.slice}`} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.model}</p>
              <p className="text-xs text-zinc-500">{row.slice} · {row.count} rows</p>
            </div>
            <Badge tone={row.score <= 0.12 ? "green" : row.score <= 0.3 ? "amber" : "red"}>{row.score.toFixed(3)}</Badge>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-zinc-600">No candidate model-slice cells yet.</p> : null}
      </CardContent>
    </Card>
  );
}

function RegressionQueueCard({ rows }: { rows: CompareRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Regression Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.recordingId} className="rounded-md border border-border p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">MER +{(row.candidateScore - row.baselineScore).toFixed(3)}</span>
              <Badge tone="red">regression</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-zinc-700">{row.reference || "(empty human transcript)"}</p>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-zinc-600">No row-level regressions above the threshold.</p> : null}
      </CardContent>
    </Card>
  );
}

function buildCompareRows(baselineReport?: EvaluationReport, candidateReport?: EvaluationReport): CompareRow[] {
  if (!baselineReport || !candidateReport) return [];
  const baseline = groupRowsByRecording(baselineReport.rows);
  const candidate = groupRowsByRecording(candidateReport.rows);
  return [...candidate.entries()]
    .map(([recordingId, candidateRows]) => {
      const baselineRows = baseline.get(recordingId) ?? [];
      const first = candidateRows[0] ?? baselineRows[0];
      return {
        recordingId,
        reference: first?.recording?.contributorTranscript ?? "",
        instruction: first?.prompt?.displayInstruction ?? "",
        baselineRows,
        candidateRows,
        baselineScore: mean(baselineRows.map(primaryScore)),
        candidateScore: mean(candidateRows.map(primaryScore)),
      };
    })
    .sort((a, b) => b.candidateScore - b.baselineScore - (a.candidateScore - a.baselineScore));
}

function buildSliceRows(baselineReport?: EvaluationReport, candidateReport?: EvaluationReport) {
  if (!baselineReport || !candidateReport) return [];
  const baseline = new Map(baselineReport.slices.map((slice) => [`${slice.label}:${slice.name}`, slice]));
  return candidateReport.slices
    .map((candidate) => {
      const base = baseline.get(`${candidate.label}:${candidate.name}`);
      return {
        label: candidate.label,
        name: candidate.name,
        baseline: base?.meanMer ?? base?.meanCer ?? 0,
        candidate: candidate.meanMer ?? candidate.meanCer,
        count: candidate.evaluatedCount,
      };
    })
    .sort((a, b) => b.candidate - b.baseline - (a.candidate - a.baseline))
    .slice(0, 12);
}

function buildRiskQueue(report?: EvaluationReport) {
  if (!report) return [];
  return report.rows
    .filter((row) => row.metric && ((row.metric.overgenerationRate ?? 0) > 0.05 || (row.metric.semanticRiskFlags?.length ?? 0) > 0))
    .sort(
      (a, b) =>
        (b.metric?.semanticRiskFlags?.length ?? 0) - (a.metric?.semanticRiskFlags?.length ?? 0) ||
        (b.metric?.overgenerationRate ?? 0) - (a.metric?.overgenerationRate ?? 0),
    )
    .slice(0, 5);
}

function buildScoreDistribution(baselineReport?: EvaluationReport, candidateReport?: EvaluationReport) {
  const buckets = [
    { label: "0.00-0.10", min: 0, max: 0.1 },
    { label: "0.10-0.25", min: 0.1, max: 0.25 },
    { label: "0.25-0.50", min: 0.25, max: 0.5 },
    { label: "0.50+", min: 0.5, max: Number.POSITIVE_INFINITY },
  ];
  return buckets.map((bucket) => ({
    bucket: bucket.label,
    baseline: countScoresInBucket(baselineReport?.rows ?? [], bucket.min, bucket.max),
    candidate: countScoresInBucket(candidateReport?.rows ?? [], bucket.min, bucket.max),
  }));
}

function buildModelSliceHeatmap(report?: EvaluationReport) {
  if (!report) return [];
  const groups = new Map<string, EvaluationReportRow[]>();
  for (const row of report.rows.filter((candidate) => candidate.metric)) {
    const model = row.model?.displayName ?? "Unknown model";
    const slice = row.metric?.linguisticCategory ?? row.prompt?.language ?? "general";
    groups.set(`${model}:${slice}`, [...(groups.get(`${model}:${slice}`) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const [model, slice] = key.split(":");
      return {
        model: model ?? "Unknown model",
        slice: slice ?? "general",
        score: mean(rows.map(primaryScore)),
        count: rows.length,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function countScoresInBucket(rows: EvaluationReportRow[], min: number, max: number) {
  return rows.filter((row) => {
    if (!row.metric) return false;
    const score = primaryScore(row);
    return score >= min && score < max;
  }).length;
}

function groupRowsByRecording(rows: EvaluationReportRow[]) {
  const groups = new Map<string, EvaluationReportRow[]>();
  for (const row of rows) {
    const recordingId = row.result.recordingId ?? row.recording?.id;
    if (!recordingId) continue;
    groups.set(recordingId, [...(groups.get(recordingId) ?? []), row]);
  }
  return groups;
}

function primaryScore(row: EvaluationReportRow) {
  if (row.result.status === "failed") return 1;
  if (!row.metric) return 1;
  return row.metric.mixedErrorRate ?? row.metric.characterErrorRate;
}

function decisionRecommendation(baseline?: EvaluationReport, candidate?: EvaluationReport) {
  if (!baseline || !candidate) {
    return { label: "select experiments", tone: "neutral" as const, copy: "Choose a baseline and candidate to populate comparison analytics." };
  }
  const baselineScore = baseline.summary.overallMer ?? baseline.summary.overallCer;
  const candidateScore = candidate.summary.overallMer ?? candidate.summary.overallCer;
  const semanticDelta = (candidate.summary.semanticRiskRate ?? 0) - (baseline.summary.semanticRiskRate ?? 0);
  const failureDelta = candidate.summary.failureRate - baseline.summary.failureRate;
  if (candidateScore <= baselineScore * 0.95 && semanticDelta <= 0.01 && failureDelta <= 0.01) {
    return { label: "ship", tone: "green" as const, copy: "Candidate improves the main linguistic-diversity signal without raising risk or failure rate." };
  }
  if (candidateScore > baselineScore * 1.05 || semanticDelta > 0.03 || failureDelta > 0.03) {
    return { label: "iterate", tone: "red" as const, copy: "Candidate has a measurable regression; inspect slice and row queues before using it as the default." };
  }
  return { label: "segment", tone: "amber" as const, copy: "Candidate is close overall; use slice regressions to decide whether it wins on a narrow data segment." };
}

function mean(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
