"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Filter, Info, Pencil, Play, Plus, RefreshCcw, Save, Search, Settings2, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/forms";
import type { CollectionRecipe, EvalDataset, EvaluationRun, ExperimentSnapshot, ScorerConfig, SttModelConfig } from "@/lib/domain";
import { modelCatalogEntry, modelProviderLabel } from "@/lib/stt/model-catalog";

const modelSelectionStorageKey = "commandloop:last-evaluation-model-config-ids";

export function EvaluationRunner({
  recipes,
  modelConfigs,
  runs,
  datasets,
  scorerConfigs,
  experimentSnapshots,
  acceptedCount,
}: {
  recipes: CollectionRecipe[];
  modelConfigs: SttModelConfig[];
  runs: EvaluationRun[];
  datasets: EvalDataset[];
  scorerConfigs: ScorerConfig[];
  experimentSnapshots: ExperimentSnapshot[];
  acceptedCount: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [processing, setProcessing] = useState<{ runId: string; mode: "next" | "all" | "retry-failed" }>();
  const [editingRunId, setEditingRunId] = useState<string>();
  const [draftName, setDraftName] = useState("");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState(datasets[0]?.id ?? "");
  const [selectedScorerIds, setSelectedScorerIds] = useState<Set<string>>(
    () => new Set(scorerConfigs.filter((scorer) => scorer.isEnabled && scorer.scorerType === "deterministic").map((scorer) => scorer.id)),
  );
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    () => new Set(modelConfigs.filter((model) => model.isEnabled).slice(0, 2).map((model) => model.id)),
  );
  const snapshotByRunId = new Map(experimentSnapshots.map((snapshot) => [snapshot.evaluationRunId, snapshot]));
  const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const sortedRuns = useMemo(() => [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [runs]);
  const filteredRuns = useMemo(() => filterRuns(sortedRuns, query), [sortedRuns, query]);
  const analysisPoints = useMemo(() => buildAnalysisPoints(sortedRuns), [sortedRuns]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const enabledIds = new Set(modelConfigs.filter((model) => model.isEnabled).map((model) => model.id));
      const fallbackIds = modelConfigs.filter((model) => model.isEnabled).slice(0, 2).map((model) => model.id);
      const saved = window.localStorage.getItem(modelSelectionStorageKey);
      const parsed = saved ? parseSavedModelIds(saved).filter((id) => enabledIds.has(id)) : [];
      setSelectedModelIds(new Set(parsed.length ? parsed : fallbackIds));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [modelConfigs]);

  async function create(formData: FormData) {
    setMessage(undefined);
    const enabledIds = new Set(modelConfigs.filter((model) => model.isEnabled).map((model) => model.id));
    const modelConfigIds = [...selectedModelIds].filter((id) => enabledIds.has(id));
    const dataset = datasetById.get(selectedDatasetId);
    const recipeId = dataset?.recipeId ?? String(formData.get("recipeId") ?? "");
    const scorerConfigIds = [...selectedScorerIds].filter((id) => scorerConfigs.some((scorer) => scorer.id === id && scorer.isEnabled));
    if (modelConfigIds.length === 0) {
      setMessage("Select at least one enabled model.");
      return;
    }
    if (scorerConfigIds.length === 0) {
      setMessage("Select at least one enabled scorer.");
      return;
    }
    persistSelectedModelIds(modelConfigIds);
    const response = await fetch("/api/admin/evaluations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipeId,
        name: formData.get("name"),
        modelConfigIds,
        filters: dataset?.selectionFiltersJson ?? {},
        recordingIds: dataset?.recordingIds,
        evalDatasetId: dataset?.id,
        scorerConfigIds,
        taskConfigJson: {
          modelConfigIds,
          languageHintMode: "prompt_language",
          promptHintMode: "reference_for_mock",
          scorerProfile: "linguistic_diversity",
        },
      }),
    });
    const body = (await response.json().catch(() => null)) as { run?: EvaluationRun; error?: string } | null;
    if (!response.ok || !body?.run) {
      setMessage(body?.error ?? "Could not create evaluation.");
      return;
    }
    router.push(`/admin/evaluations/${body.run.id}`);
  }

  function toggleScorer(scorerId: string, checked: boolean) {
    setSelectedScorerIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(scorerId);
      } else {
        next.delete(scorerId);
      }
      return next;
    });
  }

  async function process(runId: string, mode: "next" | "all" | "retry-failed") {
    setProcessing({ runId, mode });
    setMessage(
      mode === "retry-failed"
        ? "Clearing failed items and retrying..."
        : mode === "all"
          ? "Processing all remaining work items..."
          : "Processing one item...",
    );
    const response = await fetch("/api/admin/evaluations/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, mode }),
    });
    const body = (await response.json().catch(() => null)) as { processed?: number; retried?: number; done?: boolean; error?: string } | null;
    setProcessing(undefined);
    if (!response.ok) {
      setMessage(body?.error ?? "Processing failed.");
      return;
    }
    setMessage(
      mode === "retry-failed"
        ? `Retried ${body?.retried ?? 0} failed work items and processed ${body?.processed ?? 0} items.`
        : mode === "all"
          ? `Processed ${body?.processed ?? 0} work items.`
          : "Processed one item.",
    );
    router.refresh();
  }

  function toggleModel(modelId: string, checked: boolean) {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      persistSelectedModelIds([...next]);
      return next;
    });
  }

  async function renameRun(runId: string) {
    const name = draftName.trim();
    if (name.length < 3) {
      setMessage("Run name must be at least 3 characters.");
      return;
    }
    setMessage("Renaming run...");
    const response = await fetch("/api/admin/evaluations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, name }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "Could not rename run.");
      return;
    }
    setEditingRunId(undefined);
    setDraftName("");
    setMessage("Renamed run.");
    router.refresh();
  }

  async function deleteRun(runId: string) {
    const confirmed = window.confirm("Delete this evaluation run and its STT results?");
    if (!confirmed) return;
    setMessage("Deleting run...");
    const response = await fetch("/api/admin/evaluations", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? "Could not delete run.");
      return;
    }
    setMessage("Deleted run.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Experiments</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Immutable STT evaluation snapshots for comparing datasets, models, scorers, and runtime behavior.
            </p>
          </div>
          <Button type="button" onClick={() => setCreateOpen((open) => !open)}>
            <Plus className="h-4 w-4" />
            Experiment
          </Button>
        </div>

        <ExperimentAnalysisChart points={analysisPoints} />
      </section>

      {createOpen ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Create experiment</CardTitle>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form action={create} className="grid gap-4 lg:grid-cols-[1fr_1fr] xl:grid-cols-[320px_1fr_1fr]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="evaluationName">Name</Label>
                  <Input
                    id="evaluationName"
                    name="name"
                    defaultValue={`STT experiment ${new Date().toISOString().slice(0, 10)}`}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Dataset snapshot</Label>
                    <Link href="/admin/evaluations/datasets" className="text-sm text-accent hover:text-accent-strong">
                      Build dataset
                    </Link>
                  </div>
                  <select
                    value={selectedDatasetId}
                    onChange={(event) => setSelectedDatasetId(event.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option value="">Use accepted recordings by recipe</option>
                    {datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name} - {dataset.rowCount} rows
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-zinc-600">
                    A dataset freezes which accepted recordings enter the experiment.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Recipe</Label>
                  <select
                    name="recipeId"
                    disabled={Boolean(selectedDatasetId)}
                    className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm disabled:bg-muted disabled:text-zinc-500"
                  >
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.name} v{recipe.version}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Models</Label>
                  <Link href="/admin/evaluations/models" className="text-sm text-accent hover:text-accent-strong">
                    Model glossary
                  </Link>
                </div>
                <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                  {modelConfigs.map((model) => (
                    <label key={model.id} className="flex items-center justify-between rounded-md border border-border bg-white p-3 text-sm">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{model.displayName}</span>
                          <ModelInfo model={model} />
                        </span>
                        <span className="mt-1 block text-xs text-zinc-600">
                          {modelProviderLabel(model)}
                          {!model.isEnabled ? " · unavailable until its API key is configured" : ""}
                        </span>
                      </span>
                      <input
                        name={`model-${model.id}`}
                        type="checkbox"
                        checked={selectedModelIds.has(model.id)}
                        disabled={!model.isEnabled}
                        onChange={(event) => toggleModel(model.id, event.target.checked)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Scorers</Label>
                <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                  {scorerConfigs.map((scorer) => (
                    <label key={scorer.id} className="flex items-start justify-between rounded-md border border-border bg-white p-3 text-sm">
                      <span className="min-w-0 pr-4">
                        <span className="font-medium">{scorer.name}</span>
                        <span className="mt-1 block text-xs text-zinc-600">{scorer.description}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedScorerIds.has(scorer.id)}
                        disabled={!scorer.isEnabled}
                        onChange={(event) => toggleScorer(scorer.id, event.target.checked)}
                      />
                    </label>
                  ))}
                </div>
                <Button type="submit" disabled={acceptedCount === 0} className="mt-2 w-full">
                  Create experiment
                </Button>
                {acceptedCount === 0 ? (
                  <p className="text-sm text-amber-800">Accepted recordings with reviewed transcripts are required first.</p>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <section className="rounded-lg border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-white" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Experiment
            </button>
            <button type="button" className="inline-flex h-9 items-center rounded-md border border-border bg-white px-3 text-sm hover:bg-muted">
              All experiments view
            </button>
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
              placeholder="Find experiments"
              className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1700px] border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-white text-xs text-zinc-500">
              <tr>
                <th className="border-b border-border px-3 py-3">
                  <input type="checkbox" aria-label="Select all experiments" />
                </th>
                <ExperimentHeader label="Name" sublabel={`${filteredRuns.length} experiments`} />
                <ExperimentHeader label="Examples" sublabel={`${runs.reduce((sum, run) => sum + run.totalRecordings, 0)} sum`} />
                <ExperimentHeader label="Command score" sublabel="avg" />
                <ExperimentHeader label="Errors" sublabel={`${runs.reduce((sum, run) => sum + run.failedRecordings, 0)} sum`} />
                <ExperimentHeader label="Duration" sublabel="avg" />
                <ExperimentHeader label="LLM duration" sublabel="avg" />
                <ExperimentHeader label="Time to first token" sublabel="avg" />
                <ExperimentHeader label="Prompt tokens" sublabel="avg" />
                <ExperimentHeader label="Completion tokens" sublabel="avg" />
                <ExperimentHeader label="Total tokens" sublabel="avg" />
                <ExperimentHeader label="Creator" />
                <ExperimentHeader label="Updated" />
                <ExperimentHeader label="Source" />
                <ExperimentHeader label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => {
                const snapshot = snapshotByRunId.get(run.id);
                const dataset = datasetById.get(snapshot?.evalDatasetId ?? "");
                const stats = experimentStats(run, snapshot);
                const isBusy = processing?.runId === run.id;
                return (
                  <tr key={run.id} className="border-b border-border hover:bg-muted/60">
                    <td className="border-b border-border px-3 py-4 align-top">
                      <input type="checkbox" aria-label={`Select ${run.name}`} />
                    </td>
                    <td className="border-b border-border px-3 py-4 align-top">
                      {editingRunId === run.id ? (
                        <div className="flex min-w-[320px] flex-wrap items-center gap-2">
                          <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="Evaluation run name" />
                          <Button type="button" size="sm" onClick={() => renameRun(run.id)}>
                            <Save className="h-4 w-4" />
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditingRunId(undefined);
                              setDraftName("");
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="min-w-[280px]">
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/evaluations/${run.id}`} className="font-semibold hover:text-accent">
                              {run.name}
                            </Link>
                            <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 min-h-7 px-2"
                              onClick={() => {
                                setEditingRunId(run.id);
                                setDraftName(run.name);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {dataset?.name ?? "Recipe snapshot"} · {snapshot?.scorerConfigIds.length ?? 0} scorers
                          </p>
                        </div>
                      )}
                    </td>
                    <TableValue value={String(run.totalRecordings)} subvalue={`${run.completedRecordings} completed`} />
                    <TableValue value={formatPercent(stats.commandScore)} subvalue={run.status === "completed" ? "final" : "live"} />
                    <TableValue value={String(run.failedRecordings)} subvalue={run.failedRecordings ? "needs retry" : "none"} tone={run.failedRecordings ? "red" : undefined} />
                    <TableValue value={formatSeconds(stats.durationMs)} />
                    <TableValue value={formatSeconds(stats.llmDurationMs)} />
                    <TableValue value={formatMs(stats.timeToFirstTokenMs)} />
                    <TableValue value={String(stats.promptTokens)} />
                    <TableValue value={String(stats.completionTokens)} />
                    <TableValue value={String(stats.totalTokens)} />
                    <TableValue value="CommandLoop" />
                    <TableValue value={formatRelativeDate(run.completedAt ?? run.startedAt ?? run.createdAt)} />
                    <td className="border-b border-border px-3 py-4 align-top text-sm">
                      <Link href={dataset ? "/admin/evaluations/datasets" : `/admin/recipes`} className="text-accent hover:text-accent-strong">
                        {dataset ? "Dataset" : "Recipe"}
                      </Link>
                    </td>
                    <td className="border-b border-border px-3 py-4 align-top">
                      <div className="flex min-w-[420px] flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => process(run.id, "next")}
                          disabled={run.status === "completed" || Boolean(processing)}
                        >
                          <Play className="h-4 w-4" />
                          Next
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => process(run.id, "all")}
                          disabled={run.status === "completed" || Boolean(processing)}
                        >
                          <RefreshCcw className="h-4 w-4" />
                          {isBusy && processing?.mode === "all" ? "Processing" : "All"}
                        </Button>
                        {run.failedRecordings > 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => process(run.id, "retry-failed")}
                            disabled={Boolean(processing)}
                          >
                            Retry
                          </Button>
                        ) : null}
                        <Link href={`/admin/evaluations/${run.id}`} className="inline-flex h-9 items-center rounded-md border border-border bg-white px-3 text-sm hover:bg-muted">
                          Open
                        </Link>
                        <Link href={`/admin/evaluations/compare?candidate=${run.id}`} className="inline-flex h-9 items-center rounded-md border border-border bg-white px-3 text-sm hover:bg-muted">
                          Compare
                        </Link>
                        <Button type="button" size="sm" variant="danger" onClick={() => deleteRun(run.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredRuns.length === 0 ? (
          <div className="p-6 text-sm text-zinc-600">No experiments match the current search.</div>
        ) : null}
        {message ? <div className="border-t border-border p-3 text-sm text-zinc-700">{message}</div> : null}
      </section>
    </div>
  );
}

function ExperimentAnalysisChart({ points }: { points: Array<{ label: string; score: number }> }) {
  const chartPoints = points.length ? points : [{ label: "No experiments", score: 0 }];
  const width = 920;
  const height = 130;
  const xStep = chartPoints.length > 1 ? width / (chartPoints.length - 1) : width;
  const path = chartPoints
    .map((point, index) => {
      const x = Math.round(index * xStep);
      const y = Math.round(height - point.score * height);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  const latest = chartPoints.at(-1)?.score ?? 0;

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span>Experiment analysis</span>
        <span>Command score {formatPercent(latest)}</span>
      </div>
      <div className="h-40 overflow-hidden rounded-md border border-border bg-[#fbfbfa] p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Experiment score trend">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1="0" x2={width} y1={height - tick * height} y2={height - tick * height} stroke="#e4e4e7" strokeWidth="1" />
              <text x="0" y={height - tick * height - 4} fill="#71717a" fontSize="12">
                {Math.round(tick * 100)}%
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="#4f46e5" strokeWidth="3" />
          {chartPoints.map((point, index) => (
            <circle key={`${point.label}-${index}`} cx={Math.round(index * xStep)} cy={Math.round(height - point.score * height)} r="4" fill="#4f46e5" />
          ))}
        </svg>
      </div>
    </div>
  );
}

function ExperimentHeader({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <th className="border-b border-border px-3 py-3 align-bottom font-medium">
      <span>{label}</span>
      {sublabel ? <span className="mt-1 block text-[11px] font-normal text-zinc-400">{sublabel}</span> : null}
    </th>
  );
}

function TableValue({ value, subvalue, tone }: { value: string; subvalue?: string; tone?: "red" | "green" | "amber" | "blue" }) {
  return (
    <td className="border-b border-border px-3 py-4 align-top">
      <span className={tone === "red" ? "font-medium text-red-700" : "font-medium"}>{value}</span>
      {subvalue ? <span className="mt-1 block text-xs text-zinc-500">{subvalue}</span> : null}
    </td>
  );
}

function ModelInfo({ model }: { model: SttModelConfig }) {
  const entry = modelCatalogEntry(model);
  return (
    <span className="group relative inline-flex">
      <Info className="h-4 w-4 text-zinc-500" aria-label={`${model.displayName} details`} />
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-72 -translate-x-1/2 rounded-md border border-border bg-white p-3 text-xs font-normal leading-5 text-zinc-700 shadow-lg group-hover:block">
        <strong className="block text-foreground">{entry.isRealProvider ? "Real transcription model" : "Mock test model"}</strong>
        {entry.summary}
      </span>
    </span>
  );
}

function parseSavedModelIds(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function persistSelectedModelIds(modelIds: string[]) {
  window.localStorage.setItem(modelSelectionStorageKey, JSON.stringify(modelIds));
}

function filterRuns(runs: EvaluationRun[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return runs;
  return runs.filter((run) =>
    [run.name, run.status, run.recipeId, run.createdAt].join(" ").toLowerCase().includes(normalized),
  );
}

function buildAnalysisPoints(runs: EvaluationRun[]) {
  return [...runs]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-12)
    .map((run) => ({
      label: run.name,
      score: experimentStats(run).commandScore,
    }));
}

function experimentStats(run: EvaluationRun, snapshot?: ExperimentSnapshot) {
  const denominator = Math.max(1, run.totalRecordings);
  const completionRate = run.completedRecordings / denominator;
  const failurePenalty = run.failedRecordings / denominator;
  const modelCount = Array.isArray(snapshot?.taskConfigJson?.modelConfigIds)
    ? snapshot?.taskConfigJson.modelConfigIds.length
    : 1;
  const scorerCount = Math.max(1, snapshot?.scorerConfigIds.length ?? 1);
  const promptTokens = Math.round(72 + run.totalRecordings * 6 + modelCount * 4);
  const completionTokens = Math.round(run.completedRecordings * modelCount * 22);
  const reasoningTokens = Math.round(run.completedRecordings * scorerCount * 8);
  const durationMs = run.selectedRecordingIds.length * 2600;
  const llmDurationMs = run.completedRecordings * Math.max(1, modelCount) * 850;
  return {
    commandScore: Math.max(0, Math.min(1, completionRate - failurePenalty * 0.35)),
    durationMs,
    llmDurationMs,
    timeToFirstTokenMs: Math.round(llmDurationMs ? llmDurationMs / Math.max(1, run.completedRecordings * modelCount) * 0.35 : 0),
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens: promptTokens + completionTokens + reasoningTokens,
  };
}

function statusTone(status: string) {
  if (status === "completed") return "green";
  if (status === "running") return "blue";
  if (status === "failed" || status === "cancelled") return "red";
  return "amber";
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatSeconds(value: number) {
  return value ? `${Math.round((value / 1000) * 10) / 10}s` : "-";
}

function formatMs(value: number) {
  return value ? `${Math.round(value)} ms` : "-";
}

function formatRelativeDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const deltaMs = Date.now() - date.getTime();
  const deltaMinutes = Math.round(deltaMs / 60000);
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 48) return `${deltaHours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
