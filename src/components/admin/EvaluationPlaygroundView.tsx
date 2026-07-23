"use client";

import type * as React from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Clock,
  Columns3,
  Download,
  FileText,
  FlaskConical,
  Hash,
  Info,
  Languages,
  ListFilter,
  LoaderCircle,
  PauseCircle,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { ScorerConfigModal } from "@/components/admin/ScorerConfigModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/forms";
import type { EvalDataset, PlaygroundResult, PlaygroundScorerOutput, PlaygroundSession, ScorerConfig, ScorerType, SttModelConfig } from "@/lib/domain";
import { modelCatalogEntry, modelProviderLabel } from "@/lib/stt/model-catalog";

type OutputTableRow = {
  rowKey: string;
  recordingId?: string;
  inputText?: string;
  instruction?: string;
  humanTranscript?: string;
  metadataJson?: Record<string, unknown>;
  isDraft?: boolean;
  resultsByModel: Map<string, PlaygroundResult>;
};

type OutputUndoSnapshot = {
  latestSession?: PlaygroundSession;
  draftRows: OutputTableRow[];
};

const modelSelectionOrderStorageKey = "commandloop:playground-model-order";
const modelColumnOrderStorageKey = "commandloop:playground-output-model-order";

export function EvaluationPlaygroundView({
  datasets,
  modelConfigs,
  scorerConfigs,
  playgroundSessions,
}: {
  datasets: EvalDataset[];
  modelConfigs: SttModelConfig[];
  scorerConfigs: ScorerConfig[];
  playgroundSessions: PlaygroundSession[];
}) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const outputUndoStackRef = useRef<OutputUndoSnapshot[]>([]);
  const draftRowCounterRef = useRef(0);
  const enabledModels = useMemo(() => modelConfigs.filter((model) => model.isEnabled), [modelConfigs]);
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [sampleSize, setSampleSize] = useState(3);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set(enabledModels.slice(0, 2).map((model) => model.id)));
  const [localScorers, setLocalScorers] = useState<ScorerConfig[]>([]);
  const [selectedScorerIds, setSelectedScorerIds] = useState<Set<string>>(
    () => new Set(scorerConfigs.filter((scorer) => scorer.isEnabled && scorer.scorerType === "deterministic").map((scorer) => scorer.id)),
  );
  const [latestSession, setLatestSession] = useState<PlaygroundSession | undefined>(playgroundSessions[0]);
  const [message, setMessage] = useState<string>();
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [showExperimentModal, setShowExperimentModal] = useState(false);
  const [showScorerMenu, setShowScorerMenu] = useState(false);
  const [showScorerModal, setShowScorerModal] = useState(false);
  const [scorerSearch, setScorerSearch] = useState("");
  const [rowView, setRowView] = useState("all");
  const [outputFilter, setOutputFilter] = useState("");
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);
  const [showMetricInfo, setShowMetricInfo] = useState(false);
  const [modelSelectionOrder, setModelSelectionOrder] = useState<string[]>(() => modelConfigs.map((model) => model.id));
  const [modelColumnOrder, setModelColumnOrder] = useState<string[]>(() => playgroundSessions[0]?.modelConfigIds ?? []);
  const [visibleModelColumnIds, setVisibleModelColumnIds] = useState<Set<string>>(() => new Set(playgroundSessions[0]?.modelConfigIds ?? []));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ input: 360 });
  const [outputRowHeight, setOutputRowHeight] = useState(280);
  const [draftOutputRows, setDraftOutputRows] = useState<OutputTableRow[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const [promoting, setPromoting] = useState(false);
  const availableScorers = useMemo(() => mergeScorers(scorerConfigs, localScorers), [localScorers, scorerConfigs]);
  const activeDataset = datasets.find((dataset) => dataset.id === datasetId);
  const orderedModelConfigs = useMemo(() => orderModelsByIds(modelConfigs, modelSelectionOrder), [modelConfigs, modelSelectionOrder]);
  const selectedModels = orderedModelConfigs.filter((model) => selectedModelIds.has(model.id));
  const selectedModelConfigIds = useMemo(() => selectedModels.map((model) => model.id), [selectedModels]);
  const selectedScorers = availableScorers.filter((scorer) => selectedScorerIds.has(scorer.id));
  const latestRows = useMemo(() => [...groupResultsByRow(latestSession?.resultsJson ?? []), ...draftOutputRows], [draftOutputRows, latestSession]);
  const orderedModels = useMemo(
    () => (latestSession ? orderedSessionModels(latestSession, modelConfigs, modelColumnOrder).filter((model) => visibleModelColumnIds.has(model.id)) : []),
    [latestSession, modelColumnOrder, modelConfigs, visibleModelColumnIds],
  );
  const filteredRows = useMemo(() => filterOutputRows(latestRows, rowView, outputFilter), [latestRows, outputFilter, rowView]);
  const filteredScorers = useMemo(() => {
    const needle = scorerSearch.trim().toLowerCase();
    return availableScorers.filter((scorer) =>
      needle ? `${scorer.name} ${scorer.description} ${scorer.metricKeys.join(" ")}`.toLowerCase().includes(needle) : true,
    );
  }, [availableScorers, scorerSearch]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setProgressPct((current) => Math.min(92, current + 7));
    }, 700);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setModelSelectionOrder(readStoredOrder(modelSelectionOrderStorageKey, modelConfigs.map((model) => model.id)));
      setModelColumnOrder(readStoredOrder(modelColumnOrderStorageKey, latestSession?.modelConfigIds ?? []));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [latestSession?.id, latestSession?.modelConfigIds, modelConfigs]);

  const persistPlaygroundSession = useCallback(async (session: PlaygroundSession) => {
    const response = await fetch(`/api/admin/evaluations/playground/${session.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resultsJson: session.resultsJson,
        sampleRecordingIds: session.sampleRecordingIds,
        modelConfigIds: session.modelConfigIds,
      }),
    });
    const body = (await response.json().catch(() => null)) as { session?: PlaygroundSession; error?: string } | null;
    if (!response.ok || !body?.session) {
      setMessage(body?.error ?? "Could not update playground rows.");
      return undefined;
    }
    return body.session;
  }, []);

  const rememberOutputState = useCallback(() => {
    outputUndoStackRef.current = [...outputUndoStackRef.current.slice(-19), { latestSession: cloneSession(latestSession), draftRows: cloneOutputRows(draftOutputRows) }];
    setUndoDepth(outputUndoStackRef.current.length);
  }, [draftOutputRows, latestSession]);

  const undoLastOutputAction = useCallback(async () => {
    const snapshot = outputUndoStackRef.current.at(-1);
    if (!snapshot) return;
    outputUndoStackRef.current = outputUndoStackRef.current.slice(0, -1);
    setUndoDepth(outputUndoStackRef.current.length);
    setLatestSession(snapshot.latestSession);
    setDraftOutputRows(cloneOutputRows(snapshot.draftRows));
    if (snapshot.latestSession) {
      const persisted = await persistPlaygroundSession(snapshot.latestSession);
      if (persisted) setLatestSession(persisted);
    }
    setMessage("Undid the last output table action.");
  }, [persistPlaygroundSession]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
      if (isEditableEventTarget(event.target) || outputUndoStackRef.current.length === 0) return;
      event.preventDefault();
      void undoLastOutputAction();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoLastOutputAction, undoDepth]);

  async function runPreview() {
    setMessage(undefined);
    if (!datasetId) {
      setMessage("Create or select a dataset first.");
      return;
    }
    if (selectedModelIds.size === 0) {
      setMessage("Select at least one enabled model.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setProgressPct(5);
    setRunning(true);
    const response = await fetch("/api/admin/evaluations/playground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        evalDatasetId: datasetId,
        sampleSize,
        modelConfigIds: selectedModelConfigIds,
        scorerConfigIds: [...selectedScorerIds],
        taskConfigJson: {
          modelConfigIds: selectedModelConfigIds,
          languageHintMode: "prompt_language",
          promptHintMode: "reference_for_mock",
          scorerProfile: "linguistic_diversity",
          outputType: "transcript_with_scores",
        },
      }),
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return undefined;
      throw error;
    });

    setRunning(false);
    abortRef.current = null;
    if (!response) {
      setMessage("Preview stopped before completion.");
      return;
    }
    const body = (await response.json().catch(() => null)) as { session?: PlaygroundSession; error?: string } | null;
    if (!response.ok || !body?.session) {
      setProgressPct(0);
      setMessage(body?.error ?? "Could not run playground preview.");
      return;
    }
    const session = body.session;
    const outputOrder = reconcileModelOrder(selectedModelConfigIds, session.modelConfigIds);
    const orderedSession = { ...session, modelConfigIds: outputOrder };
    setProgressPct(100);
    setLatestSession(orderedSession);
    setDraftOutputRows([]);
    outputUndoStackRef.current = [];
    setUndoDepth(0);
    setModelColumnOrder(outputOrder);
    storeOrder(modelColumnOrderStorageKey, outputOrder);
    setVisibleModelColumnIds((current) => reconcileVisibleModelColumns(current, outputOrder));
    setMessage(
      selectedScorerIds.size
        ? "Preview complete. Review row outputs and scorer traces below."
        : "STT-only preview complete. Review transcripts below or add scorers before saving a scored experiment.",
    );
    router.refresh();
  }

  async function stopPreview() {
    abortRef.current?.abort();
    if (latestSession?.id) {
      await fetch(`/api/admin/evaluations/playground/${latestSession.id}`, { method: "POST" }).catch(() => undefined);
    }
    setRunning(false);
  }

  async function promote(formData: FormData) {
    if (!latestSession) return;
    setPromoting(true);
    setMessage("Saving experiment...");
    const response = await fetch("/api/admin/evaluations/playground", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "promote",
        playgroundSessionId: latestSession.id,
        name: formData.get("experimentName"),
      }),
    });
    const body = (await response.json().catch(() => null)) as { run?: { id: string }; error?: string } | null;
    setPromoting(false);
    if (!response.ok || !body?.run) {
      setMessage(body?.error ?? "Could not save experiment.");
      return;
    }
    router.push(`/admin/evaluations/${body.run.id}`);
  }

  function chooseScorersForMe() {
    const recommended = availableScorers
      .filter((scorer) => scorer.isEnabled && ["deterministic", "llm_judge"].includes(scorer.scorerType))
      .slice(0, 4)
      .map((scorer) => scorer.id);
    setSelectedScorerIds(new Set(recommended));
    setShowScorerMenu(false);
  }

  function upsertScorer(scorer: ScorerConfig) {
    setLocalScorers((current) => {
      const exists = current.some((candidate) => candidate.id === scorer.id);
      return exists ? current.map((candidate) => (candidate.id === scorer.id ? scorer : candidate)) : [scorer, ...current];
    });
    setSelectedScorerIds((current) => new Set([...current, scorer.id]));
    setMessage(`${scorer.name} saved and selected.`);
  }

  function moveModelColumn(modelId: string, direction: -1 | 1) {
    setModelColumnOrder((current) => {
      const next = moveId(current.length ? current : latestSession?.modelConfigIds ?? [], modelId, direction);
      storeOrder(modelColumnOrderStorageKey, next);
      syncModelSelectionOrder(next);
      void persistLatestSessionModelOrder(next);
      return next;
    });
  }

  function moveModelSelection(modelId: string, direction: -1 | 1) {
    setModelSelectionOrder((current) => {
      const next = moveId(reconcileModelOrder(current, modelConfigs.map((model) => model.id)), modelId, direction);
      storeOrder(modelSelectionOrderStorageKey, next);
      const nextColumnOrder = latestSession ? reconcileModelOrder(next, latestSession.modelConfigIds) : next;
      setModelColumnOrder(nextColumnOrder);
      storeOrder(modelColumnOrderStorageKey, nextColumnOrder);
      void persistLatestSessionModelOrder(nextColumnOrder);
      return next;
    });
  }

  function syncModelSelectionOrder(activeOrder: string[]) {
    setModelSelectionOrder((current) => {
      const next = mergePreferredModelOrder(current, activeOrder, modelConfigs.map((model) => model.id));
      storeOrder(modelSelectionOrderStorageKey, next);
      return next;
    });
  }

  async function persistLatestSessionModelOrder(order: string[]) {
    if (!latestSession) return;
    const nextModelConfigIds = reconcileModelOrder(order, latestSession.modelConfigIds);
    const nextSession = { ...latestSession, modelConfigIds: nextModelConfigIds };
    setLatestSession(nextSession);
    const persisted = await persistPlaygroundSession(nextSession);
    if (persisted) setLatestSession(persisted);
  }

  function setColumnWidth(columnId: string, width: number) {
    setColumnWidths((current) => ({ ...current, [columnId]: width }));
  }

  function setAllModelColumnWidths(width: number) {
    if (!latestSession) return;
    setColumnWidths((current) => ({
      ...current,
      ...Object.fromEntries(latestSession.modelConfigIds.map((id) => [id, width])),
    }));
  }

  function addOutputRow() {
    rememberOutputState();
    draftRowCounterRef.current += 1;
    const rowKey = `draft-row-${Date.now()}-${draftRowCounterRef.current}`;
    setDraftOutputRows((current) => [
      ...current,
      {
        rowKey,
        recordingId: rowKey,
        inputText: "",
        humanTranscript: "",
        metadataJson: {},
        isDraft: true,
        resultsByModel: new Map(),
      },
    ]);
    setMessage("Draft row added to the output table.");
  }

  async function deleteOutputRow(row: OutputTableRow) {
    rememberOutputState();
    if (row.isDraft) {
      setDraftOutputRows((current) => current.filter((candidate) => candidate.rowKey !== row.rowKey));
      setMessage("Draft row deleted.");
      return;
    }
    if (!latestSession) return;
    const nextSession: PlaygroundSession = {
      ...latestSession,
      sampleRecordingIds: latestSession.sampleRecordingIds.filter((id) => id !== (row.recordingId ?? row.rowKey)),
      resultsJson: latestSession.resultsJson.filter((result) => (result.rowId ?? result.recordingId) !== row.rowKey),
    };
    setLatestSession(nextSession);
    const persisted = await persistPlaygroundSession(nextSession);
    if (persisted) setLatestSession(persisted);
    setMessage("Row deleted from this playground session.");
  }

  function updateDraftOutputRow(rowKey: string, patch: Partial<Pick<OutputTableRow, "inputText" | "humanTranscript">>) {
    setDraftOutputRows((current) => current.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)));
  }

  function downloadCsv() {
    if (!latestSession) return;
    const csv = outputRowsToCsv(filteredRows, orderedModels);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${latestSession.name || "playground-preview"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Playground</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Prototype STT tasks and scorers on a small dataset sample before creating an immutable experiment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Button type="button" variant="secondary" onClick={() => setShowScorerMenu((current) => !current)}>
              <Plus className="h-4 w-4" />
              Scorer
            </Button>
            {showScorerMenu ? (
              <div className="absolute right-0 top-12 z-30 w-80 rounded-md border border-border bg-white p-2 shadow-lg">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <Input value={scorerSearch} onChange={(event) => setScorerSearch(event.target.value)} className="pl-9" placeholder="Search scorers" />
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto border-y border-border py-1">
                  {filteredScorers.map((scorer) => (
                    <label key={scorer.id} className="flex items-start justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block font-medium">{scorer.name}</span>
                        <span className="block truncate text-xs text-zinc-600">{scorer.metricKeys.join(", ")}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedScorerIds.has(scorer.id)}
                        disabled={!scorer.isEnabled}
                        onChange={(event) => {
                          const next = new Set(selectedScorerIds);
                          if (event.target.checked) next.add(scorer.id);
                          else next.delete(scorer.id);
                          setSelectedScorerIds(next);
                        }}
                      />
                    </label>
                  ))}
                  {filteredScorers.length === 0 ? <p className="px-2 py-3 text-sm text-zinc-600">No scorers match that search.</p> : null}
                </div>
                <button type="button" onClick={chooseScorersForMe} className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
                  Choose scorers for me
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowScorerMenu(false);
                    setShowScorerModal(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  Create custom scorer
                </button>
              </div>
            ) : null}
          </div>
          {running ? (
            <>
              <Button type="button" disabled className="relative min-w-36 overflow-hidden">
                <span className="relative z-10 inline-flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Run {progressPct}%
                </span>
                <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                  <span className="block h-full bg-white transition-all" style={{ width: `${progressPct}%` }} />
                </span>
              </Button>
              <Button type="button" variant="secondary" onClick={stopPreview}>
                <PauseCircle className="h-4 w-4" />
                Stop
              </Button>
            </>
          ) : (
            <Button type="button" onClick={runPreview} disabled={datasets.length === 0}>
              <Play className="h-4 w-4" />
              Run
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => setShowExperimentModal(true)} disabled={!latestSession || running}>
            <Save className="h-4 w-4" />
            Save as experiment
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Base task
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <Label>Dataset</Label>
              <Select value={datasetId} onChange={(event) => setDatasetId(event.target.value)}>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name} - {dataset.rowCount} rows
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Sample size
                <InfoTooltip text="The number of dataset rows pulled into this quick preview. It does not change the saved dataset; total preview work equals sample size times selected models." />
              </Label>
              <Input type="number" min={1} max={10} value={sampleSize} onChange={(event) => setSampleSize(Number(event.target.value))} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-md border border-border bg-white">
              <div className="border-b border-border px-4 py-3 text-sm font-medium">Task prompt and context</div>
              <div className="space-y-3 p-4">
                <div className="rounded-md border border-border bg-muted p-3">
                  <p className="text-xs uppercase tracking-normal text-zinc-500">System</p>
                  <p className="mt-2 text-sm">
                    Transcribe robotics voice-command audio verbatim. Preserve code-switching, short utterances, false starts, and incomplete speech.
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted p-3">
                  <p className="text-xs uppercase tracking-normal text-zinc-500">User row template</p>
                  <p className="mt-2 font-mono text-sm">{"{{audio}} + {{instruction}} + {{metadata}}"}</p>
                </div>
                <Textarea
                  className="min-h-28"
                  readOnly
                  value={`Scorer variables available downstream:
{{instruction}}
{{human_transcript}}
{{model_transcript}}
{{language}}
{{tags}}
{{metadata}}`}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Picker
                title="Models"
                items={orderedModelConfigs}
                selectedIds={selectedModelIds}
                setSelectedIds={setSelectedModelIds}
                renderItem={renderModelItem}
                onMoveItem={moveModelSelection}
                orderLabel={(item) => (selectedModelIds.has(item.id) ? `${selectedModelConfigIds.indexOf(item.id) + 1}` : undefined)}
              />
              <Picker title="Scorers" items={availableScorers} selectedIds={selectedScorerIds} setSelectedIds={setSelectedScorerIds} renderItem={renderScorerItem} />
            </div>
          </div>

          {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Output table</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {latestSession ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{latestSession.name ?? "Playground session"}</h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    {latestSession.sampleRecordingIds.length} sampled rows · {latestSession.modelConfigIds.length} models ·{" "}
                    {latestSession.scorerConfigIds.length ? `${latestSession.scorerConfigIds.length} scorers` : "STT only"}
                  </p>
                </div>
                {latestSession.promotedEvaluationRunId ? <Badge tone="green">Saved as experiment</Badge> : <Badge>Preview only</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Button type="button" variant="secondary" onClick={() => setShowMetricInfo((current) => !current)}>
                    <Info className="h-4 w-4" />
                    Transcript Core Metrics
                  </Button>
                  {showMetricInfo ? <MetricInfoPopover /> : null}
                </div>
                <Select className="w-44" value={rowView} onChange={(event) => setRowView(event.target.value)}>
                  <option value="all">All rows view</option>
                  <option value="completed">Completed rows</option>
                  <option value="failed">Failed rows</option>
                </Select>
                <div className="relative min-w-60 flex-1">
                  <ListFilter className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <Input value={outputFilter} onChange={(event) => setOutputFilter(event.target.value)} className="pl-9" placeholder="Filter output rows" />
                </div>
                <div className="relative">
                  <Button type="button" variant="secondary" onClick={() => setShowDisplayMenu((current) => !current)}>
                    <Columns3 className="h-4 w-4" />
                    Display
                  </Button>
                  {showDisplayMenu ? (
                    <div className="absolute right-0 top-12 z-30 w-80 rounded-md border border-border bg-white p-2 shadow-lg">
                      <div className="border-b border-border px-2 pb-3">
                        <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">Sizing</p>
                        <div className="mt-3 space-y-3">
                          <RangeControl
                            label="Row height"
                            value={outputRowHeight}
                            min={180}
                            max={560}
                            step={20}
                            onChange={setOutputRowHeight}
                            valueLabel={`${outputRowHeight}px`}
                          />
                          <RangeControl
                            label="Input column"
                            value={columnWidths.input ?? 360}
                            min={260}
                            max={620}
                            step={20}
                            onChange={(width) => setColumnWidth("input", width)}
                            valueLabel={`${columnWidths.input ?? 360}px`}
                          />
                          <RangeControl
                            label="Model columns"
                            value={orderedModels[0] ? columnWidths[orderedModels[0].id] ?? 360 : 360}
                            min={260}
                            max={620}
                            step={20}
                            onChange={setAllModelColumnWidths}
                            valueLabel="all"
                            disabled={orderedModels.length === 0}
                          />
                        </div>
                      </div>
                      <label className="flex items-center justify-between rounded-md px-2 py-2 text-sm">
                        <span>Input / reference</span>
                        <input type="checkbox" checked disabled />
                      </label>
                      {orderedSessionModels(latestSession, modelConfigs, modelColumnOrder).map((model) => (
                        <label key={model.id} className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted">
                          <span className="truncate">{model.displayName}</span>
                          <input
                            type="checkbox"
                            checked={visibleModelColumnIds.has(model.id)}
                            onChange={(event) => {
                              const next = new Set(visibleModelColumnIds);
                              if (event.target.checked) next.add(model.id);
                              else next.delete(model.id);
                              setVisibleModelColumnIds(next);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button type="button" variant="secondary" onClick={downloadCsv}>
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
                <Button type="button" variant="secondary" onClick={undoLastOutputAction} disabled={undoDepth === 0}>
                  <Undo2 className="h-4 w-4" />
                  Undo
                </Button>
                <Button type="button" variant="secondary" onClick={addOutputRow}>
                  <Plus className="h-4 w-4" />
                  Add row
                </Button>
              </div>
              <div className="max-h-[72vh] overflow-auto rounded-md border border-border">
                <table className="min-w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-muted text-xs uppercase tracking-normal text-zinc-600">
                    <tr>
                      <th className="sticky left-0 top-0 z-30 bg-muted px-3 py-2 shadow-[inset_0_-1px_0_var(--border)]" style={{ minWidth: columnWidths.input ?? 360, width: columnWidths.input ?? 360 }}>
                        <ColumnHeader
                          title="Input / reference"
                          width={columnWidths.input ?? 360}
                          onWidthChange={(width) => setColumnWidth("input", width)}
                        />
                      </th>
                      {orderedModels.map((model) => (
                        <th key={model.id} className="sticky top-0 z-20 bg-muted px-3 py-2 shadow-[inset_0_-1px_0_var(--border)]" style={{ minWidth: columnWidths[model.id] ?? 360, width: columnWidths[model.id] ?? 360 }}>
                          <ColumnHeader
                            title={model.displayName}
                            width={columnWidths[model.id] ?? 360}
                            onWidthChange={(width) => setColumnWidth(model.id, width)}
                            onMoveLeft={() => moveModelColumn(model.id, -1)}
                            onMoveRight={() => moveModelColumn(model.id, 1)}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-white">
                    {filteredRows.map((row) => (
                      <tr key={row.rowKey} className="align-top">
                        <td className="sticky left-0 z-10 bg-white px-3 py-3 shadow-[inset_-1px_0_0_var(--border)]" style={{ maxWidth: columnWidths.input ?? 360, width: columnWidths.input ?? 360, height: outputRowHeight }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              {row.isDraft ? <Badge tone="amber">Draft row</Badge> : null}
                              {row.isDraft ? (
                                <div className="mt-2 space-y-2">
                                  <Label>Input / reference</Label>
                                  <Textarea
                                    className="min-h-20 resize-y"
                                    value={row.inputText ?? ""}
                                    onChange={(event) => updateDraftOutputRow(row.rowKey, { inputText: event.target.value })}
                                  />
                                  <Label>Human transcript</Label>
                                  <Textarea
                                    className="min-h-20 resize-y"
                                    value={row.humanTranscript ?? ""}
                                    onChange={(event) => updateDraftOutputRow(row.rowKey, { humanTranscript: event.target.value })}
                                  />
                                </div>
                              ) : (
                                <>
                                  <p className="font-medium">{row.inputText || row.instruction || "Dataset row"}</p>
                                  <p className="mt-2 text-xs text-zinc-500">Human transcript</p>
                                  <p className="mt-1 text-sm">{row.humanTranscript || "-"}</p>
                                </>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void deleteOutputRow(row)}
                              className="shrink-0 rounded-md border border-border bg-white p-2 text-zinc-600 hover:bg-muted hover:text-danger"
                              aria-label="Delete row"
                              title="Delete row"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {!row.isDraft && row.recordingId && !row.recordingId.startsWith("import-row") && !row.recordingId.startsWith("manual-row") ? (
                            <audio src={`/api/audio/${row.recordingId}`} controls className="mt-3 w-full" />
                          ) : !row.isDraft && typeof row.metadataJson?.audioUrl === "string" ? (
                            <audio src={row.metadataJson.audioUrl} controls className="mt-3 w-full" />
                          ) : (
                            <p className="mt-3 text-xs text-zinc-500">{row.isDraft ? "Draft rows are local until added to a dataset and rerun." : "Text-only row"}</p>
                          )}
                        </td>
                        {orderedModels.map((model) => {
                          const result = row.resultsByModel.get(model.id);
                          return (
                            <td key={`${row.rowKey}-${model.id}`} className="px-3 py-3" style={{ maxWidth: columnWidths[model.id] ?? 360, width: columnWidths[model.id] ?? 360, height: outputRowHeight }}>
                              {result ? <ResultCell result={result} /> : <span className="text-zinc-500">Not run</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRows.length === 0 ? <p className="p-4 text-sm text-zinc-600">No rows match this view.</p> : null}
              </div>
            </>
          ) : datasets.length ? (
            <EmptyPlaygroundState selectedModels={selectedModels} selectedScorers={selectedScorers} />
          ) : (
            <p className="text-sm text-amber-800">Create a dataset before using the playground.</p>
          )}
        </CardContent>
      </Card>

      {showExperimentModal && latestSession ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
          <form action={promote} className="w-full max-w-xl rounded-lg border border-border bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Create experiment</h2>
                <p className="mt-1 text-sm text-zinc-600">Save this playground configuration as an immutable evaluation run.</p>
              </div>
              <button type="button" onClick={() => setShowExperimentModal(false)} className="rounded-md p-2 hover:bg-muted" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="experimentName">Experiment name</Label>
                <Input id="experimentName" name="experimentName" defaultValue={`STT playground experiment ${new Date().toISOString().slice(0, 10)}`} />
              </div>
              <SummaryRow label="Dataset" value={activeDataset?.name ?? latestSession.evalDatasetId ?? "Dataset snapshot"} />
              <SummaryRow label="Models" value={sessionModels(latestSession, modelConfigs).map((model) => model.displayName).join(", ")} />
              <SummaryRow
                label="Scorers"
                value={selectedScorers.map((scorer) => scorer.name).join(", ") || (latestSession.scorerConfigIds.length ? `${latestSession.scorerConfigIds.length} scorers` : "None - STT only")}
              />
              <div className="rounded-md border border-border bg-muted p-3 text-sm text-zinc-700">
                The formal experiment reuses the sampled rows from this preview. If no scorers are selected, it stores transcript outputs only.
                For full-dataset processing, create an experiment from the Experiments page.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="secondary" onClick={() => setShowExperimentModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={promoting}>
                <Save className="h-4 w-4" />
                {promoting ? "Saving..." : "Create"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {showScorerModal ? <ScorerConfigModal onClose={() => setShowScorerModal(false)} onSaved={upsertScorer} /> : null}
    </div>
  );
}

function mergeScorers(serverScorers: ScorerConfig[], localScorers: ScorerConfig[]) {
  const byId = new Map(serverScorers.map((scorer) => [scorer.id, scorer]));
  for (const scorer of localScorers) byId.set(scorer.id, scorer);
  return [...byId.values()];
}

function readStoredOrder(key: string, fallback: string[]) {
  if (typeof window === "undefined") return fallback;
  const saved = window.localStorage.getItem(key);
  if (!saved) return fallback;
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return fallback;
    return reconcileModelOrder(parsed.filter((value): value is string => typeof value === "string"), fallback);
  } catch {
    return fallback;
  }
}

function storeOrder(key: string, order: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(order));
}

function mergePreferredModelOrder(current: string[], activeOrder: string[], allIds: string[]) {
  const activeSet = new Set(activeOrder);
  const next = [
    ...activeOrder,
    ...current.filter((id) => !activeSet.has(id)),
  ];
  return reconcileModelOrder(next, allIds);
}

function cloneSession(session?: PlaygroundSession) {
  if (!session) return undefined;
  return {
    ...session,
    sampleRecordingIds: [...session.sampleRecordingIds],
    modelConfigIds: [...session.modelConfigIds],
    scorerConfigIds: [...session.scorerConfigIds],
    taskConfigJson: { ...session.taskConfigJson },
    resultsJson: session.resultsJson.map(clonePlaygroundResult),
  };
}

function clonePlaygroundResult(result: PlaygroundResult): PlaygroundResult {
  return {
    ...result,
    scores: { ...result.scores },
    tags: result.tags ? [...result.tags] : undefined,
    metadataJson: result.metadataJson ? { ...result.metadataJson } : undefined,
    scorerOutputs: result.scorerOutputs?.map((output) => ({
      ...output,
      metricKeys: [...output.metricKeys],
      scores: { ...output.scores },
    })),
  };
}

function cloneOutputRows(rows: OutputTableRow[]) {
  return rows.map((row) => ({
    ...row,
    metadataJson: row.metadataJson ? { ...row.metadataJson } : undefined,
    resultsByModel: new Map(row.resultsByModel),
  }));
}

function isEditableEventTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function reconcileModelOrder(current: string[], activeIds: string[]) {
  const kept = current.filter((id) => activeIds.includes(id));
  return [...kept, ...activeIds.filter((id) => !kept.includes(id))];
}

function orderModelsByIds(models: SttModelConfig[], order: string[]) {
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  return [...models].sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

function moveId(ids: string[], id: string, direction: -1 | 1) {
  const next = [...ids];
  const index = next.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function reconcileVisibleModelColumns(current: Set<string>, activeIds: string[]) {
  const kept = [...current].filter((id) => activeIds.includes(id));
  return new Set(kept.length ? kept : activeIds);
}

function MetricInfoPopover() {
  return (
    <div className="absolute left-0 top-12 z-30 w-[26rem] rounded-md border border-border bg-white p-4 text-sm shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Transcript Core Metrics</p>
          <p className="mt-1 text-xs leading-5 text-zinc-600">Deterministic transcript scores. They do not use model reasoning or chain-of-thought.</p>
        </div>
        <Link href="/admin/evaluations/metrics-glossary" className="shrink-0 text-xs font-medium text-accent hover:text-accent-strong">
          Glossary
        </Link>
      </div>
      <dl className="mt-3 grid gap-2">
        {metricDefinitions.map((item) => (
          <div key={item.key} className="grid grid-cols-[4.5rem_1fr] gap-2">
            <dt className="font-medium">{item.key}</dt>
            <dd className="text-xs leading-5 text-zinc-600">{item.short}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Picker<T extends { id: string; isEnabled?: boolean }>({
  title,
  items,
  selectedIds,
  setSelectedIds,
  renderItem,
  onMoveItem,
  orderLabel,
}: {
  title: string;
  items: T[];
  selectedIds: Set<string>;
  setSelectedIds: (value: Set<string>) => void;
  renderItem: (item: T) => React.ReactNode;
  onMoveItem?: (id: string, direction: -1 | 1) => void;
  orderLabel?: (item: T) => string | undefined;
}) {
  return (
    <div className="rounded-md border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge>{selectedIds.size} selected</Badge>
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {items.map((item, index) => {
          const label = orderLabel?.(item);
          return (
            <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
              <label className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedIds.has(item.id)}
                  disabled={item.isEnabled === false}
                  onChange={(event) => {
                    const next = new Set(selectedIds);
                    if (event.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    setSelectedIds(next);
                  }}
                />
                <span className="min-w-0">
                  {label ? <span className="mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded bg-zinc-900 px-1.5 text-[11px] font-semibold text-white">{label}</span> : null}
                  {renderItem(item)}
                </span>
              </label>
              {onMoveItem ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMoveItem(item.id, -1)}
                    disabled={index === 0}
                    className="rounded p-1 hover:bg-white disabled:opacity-40"
                    aria-label={`Move ${item.id} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveItem(item.id, 1)}
                    disabled={index === items.length - 1}
                    className="rounded p-1 hover:bg-white disabled:opacity-40"
                    aria-label={`Move ${item.id} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  valueLabel,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  valueLabel: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="text-xs text-zinc-500">{valueLabel}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}

function renderModelItem(model: SttModelConfig) {
  const entry = modelCatalogEntry(model);
  return (
    <>
      <span className="flex items-center gap-2 font-medium">
        {model.displayName}
        <InfoTooltip text={entry.summary} />
      </span>
      <span className="mt-1 block text-xs text-zinc-600">
        {modelProviderLabel(model)}
        {!model.isEnabled ? " · API key needed" : ""}
      </span>
    </>
  );
}

function renderScorerItem(scorer: ScorerConfig) {
  return (
    <>
      <span className="font-medium">{scorer.name}</span>
      <span className="mt-1 block text-xs text-zinc-600">{scorer.metricKeys.join(", ")}</span>
    </>
  );
}

function ResultCell({ result }: { result: PlaygroundResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <Badge tone={result.status === "completed" ? "green" : "red"}>{result.status}</Badge>
        <ResultMetaIndicators result={result} />
      </div>
      <div>
        <p className="text-xs uppercase tracking-normal text-zinc-500">Model transcript</p>
        <p className="mt-1 whitespace-pre-wrap">{result.hypothesis ?? result.errorMessage ?? "-"}</p>
      </div>
      <ScorerOutputs result={result} />
      <div>
        <p className="flex items-center gap-1 text-xs uppercase tracking-normal text-zinc-500">
          Provider trace
          <InfoTooltip text="Provider trace is run metadata such as status, latency, language, and provider failure information. It is not chain-of-thought or a model score explanation." />
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-600">{providerTrace(result)}</p>
      </div>
    </div>
  );
}

function ResultMetaIndicators({ result }: { result: PlaygroundResult }) {
  const transcript = result.hypothesis ?? "";
  const tokenCount = estimateTokenCount(transcript);
  const charCount = transcript.length;
  return (
    <div className="flex flex-wrap justify-end gap-2 text-xs text-zinc-500">
      <span className="inline-flex items-center gap-1" title="Time to populate this model output">
        <Clock className="h-3.5 w-3.5" />
        {result.latencyMs ? `${formatLatency(result.latencyMs)}` : "n/a"}
      </span>
      <span className="inline-flex items-center gap-1" title="Estimated transcript tokens for comparison">
        <Hash className="h-3.5 w-3.5" />
        {tokenCount}
      </span>
      <span className="inline-flex items-center gap-1" title="Transcript characters">
        <FileText className="h-3.5 w-3.5" />
        {charCount}
      </span>
      {result.detectedLanguage ? (
        <span className="inline-flex items-center gap-1" title="Detected language from provider">
          <Languages className="h-3.5 w-3.5" />
          {result.detectedLanguage}
        </span>
      ) : null}
    </div>
  );
}

function ScorerOutputs({ result }: { result: PlaygroundResult }) {
  const outputs = result.scorerOutputs ?? [];
  if (result.status === "failed") return <p className="text-xs text-zinc-500">No scorer output</p>;
  if (outputs.length === 0) {
    return (
      <div className="grid gap-1">
        {Object.entries(result.scores).map(([key, value]) => (
          <span key={key} className="text-xs">
            <span className="text-zinc-500">{scoreLabel(key)}</span> {value.toFixed(3)}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {outputs.map((output) => (
        <div key={output.scorerId} className="rounded-md border border-border bg-muted p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{output.scorerName}</span>
            <Badge tone={scorerTone(output.scorerType)}>{output.scorerType.replace("_", " ")}</Badge>
            {output.passed !== undefined ? <Badge tone={output.passed ? "green" : "red"}>{output.passed ? "pass" : "below threshold"}</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(output.scores).map(([key, value]) => (
              <span key={`${output.scorerId}-${key}`} className="text-xs">
                <span className="text-zinc-500">{scoreLabel(key)}</span> {value.toFixed(3)}
              </span>
            ))}
          </div>
          {shouldShowScorerRationale(output) ? (
            <div className="mt-2 rounded border border-border bg-white p-2">
              <p className="text-[11px] uppercase tracking-normal text-zinc-500">Concise scorer rationale</p>
              <p className="mt-1 text-xs leading-5 text-zinc-600">{output.rationale}</p>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function EmptyPlaygroundState({
  selectedModels,
  selectedScorers,
}: {
  selectedModels: SttModelConfig[];
  selectedScorers: ScorerConfig[];
}) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center">
      <Settings2 className="mx-auto h-8 w-8 text-zinc-500" />
      <h2 className="mt-3 font-semibold">No preview has been run yet</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Current setup: {selectedModels.length} model{selectedModels.length === 1 ? "" : "s"} and{" "}
        {selectedScorers.length ? `${selectedScorers.length} scorer${selectedScorers.length === 1 ? "" : "s"}` : "no scorers (STT only)"}.
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-normal text-zinc-500">{label}</p>
      <p className="mt-1 text-sm">{value || "-"}</p>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-4 w-4 text-zinc-500" aria-label={text} />
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-80 -translate-x-1/2 rounded-md border border-border bg-white p-3 text-xs font-normal leading-5 text-zinc-700 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function ColumnHeader({
  title,
  width,
  onWidthChange,
  onMoveLeft,
  onMoveRight,
}: {
  title: string;
  width: number;
  onWidthChange: (width: number) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}) {
  return (
    <div className="space-y-2 normal-case">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">{title}</span>
        {onMoveLeft && onMoveRight ? (
          <span className="flex items-center gap-1">
            <button type="button" onClick={onMoveLeft} className="rounded p-1 hover:bg-white" aria-label={`Move ${title} left`}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onMoveRight} className="rounded p-1 hover:bg-white" aria-label={`Move ${title} right`}>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : null}
      </div>
      <input
        type="range"
        min={260}
        max={620}
        step={20}
        value={width}
        onChange={(event) => onWidthChange(Number(event.target.value))}
        className="w-full"
        aria-label={`Resize ${title}`}
      />
    </div>
  );
}

function groupResultsByRow(results: PlaygroundResult[]) {
  const rows = new Map<string, OutputTableRow>();
  for (const result of results) {
    const rowKey = result.rowId ?? result.recordingId;
    const row =
      rows.get(rowKey) ??
      {
        rowKey,
        recordingId: result.recordingId,
        inputText: result.inputText,
        instruction: result.instruction,
        humanTranscript: result.humanTranscript,
        metadataJson: result.metadataJson,
        resultsByModel: new Map<string, PlaygroundResult>(),
      };
    row.resultsByModel.set(result.modelConfigId, result);
    rows.set(rowKey, row);
  }
  return [...rows.values()];
}

function sessionModels(session: PlaygroundSession, models: SttModelConfig[]) {
  const byId = new Map(models.map((model) => [model.id, model]));
  return session.modelConfigIds
    .map((id) => byId.get(id))
    .filter((model): model is SttModelConfig => Boolean(model));
}

function orderedSessionModels(session: PlaygroundSession, models: SttModelConfig[], modelColumnOrder: string[]) {
  const baseModels = sessionModels(session, models);
  const order = modelColumnOrder.length ? modelColumnOrder : session.modelConfigIds;
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  return [...baseModels].sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

function filterOutputRows(rows: ReturnType<typeof groupResultsByRow>, rowView: string, query: string) {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    const results = [...row.resultsByModel.values()];
    if (rowView === "completed" && !results.some((result) => result.status === "completed")) return false;
    if (rowView === "failed" && !results.some((result) => result.status === "failed")) return false;
    if (!needle) return true;
    return [
      row.inputText,
      row.instruction,
      row.humanTranscript,
      ...results.flatMap((result) => [result.modelName, result.hypothesis, result.errorMessage, result.rationale]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function outputRowsToCsv(rows: ReturnType<typeof groupResultsByRow>, models: SttModelConfig[]) {
  const headers = ["row_id", "input", "human_transcript", ...models.flatMap((model) => [`${model.displayName} transcript`, `${model.displayName} status`, `${model.displayName} latency_ms`])];
  const lines = rows.map((row) => {
    const values = [
      row.rowKey,
      row.inputText || row.instruction || "",
      row.humanTranscript || "",
      ...models.flatMap((model) => {
        const result = row.resultsByModel.get(model.id);
        return [result?.hypothesis ?? result?.errorMessage ?? "", result?.status ?? "not_run", result?.latencyMs ? String(result.latencyMs) : ""];
      }),
    ];
    return values.map(csvEscape).join(",");
  });
  return [headers.map(csvEscape).join(","), ...lines].join("\n");
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

const metricDefinitions = [
  { key: "WER", short: "Word-level errors divided by human reference words. Lower is better." },
  { key: "CER", short: "Character-level errors divided by human reference characters. Useful for Japanese text." },
  { key: "MER", short: "Mixed English-word and CJK-token error rate for code-switched commands." },
  { key: "Exact", short: "Whether normalized model text exactly matches the normalized human reference." },
  { key: "Overgen", short: "Extra inserted tokens divided by reference length; catches hallucinated speech." },
  { key: "Semantic", short: "Flags edits that may change action, object, direction, negation, or safety meaning." },
];

function providerTrace(result: PlaygroundResult) {
  if (result.status === "failed") {
    return result.errorMessage ? `Provider failed before scoring: ${result.errorMessage}` : "Provider failed before scoring.";
  }
  const parts = [
    `Provider returned ${result.modelName}`,
    result.latencyMs ? `in ${formatLatency(result.latencyMs)}` : undefined,
    result.detectedLanguage ? `with detected language ${result.detectedLanguage}` : undefined,
  ].filter(Boolean);
  return result.scorerOutputs?.length
    ? `${parts.join(" ")}. Scorers were applied after the transcript was received.`
    : `${parts.join(" ")}. No scorer was selected for this preview.`;
}

function shouldShowScorerRationale(output: PlaygroundScorerOutput) {
  return output.scorerType !== "deterministic" && Boolean(output.rationale?.trim());
}

function formatLatency(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function estimateTokenCount(text: string) {
  if (!text.trim()) return 0;
  const latinWords = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3040-\u30ff\u3400-\u9fff]/g)?.length ?? 0;
  const remainingChars = text.replace(/[A-Za-z0-9\s'"’.,!?;:()[\]{}<>/_-]+/g, "").length - cjkChars;
  return Math.max(1, latinWords + Math.ceil(cjkChars / 2) + Math.max(0, Math.ceil(remainingChars / 4)));
}

function scorerTone(type: ScorerType) {
  if (type === "llm_judge") return "blue";
  if (type === "human_review") return "amber";
  return "green";
}

function scoreLabel(key: string) {
  const labels: Record<string, string> = {
    wer: "WER",
    cer: "CER",
    mer: "MER",
    exact_match: "Exact match",
    overgeneration: "Overgeneration",
    semantic_risk: "Semantic risk",
    command_fidelity: "Command fidelity",
    reviewer_validation: "Reviewer validation",
  };
  return labels[key] ?? key.replaceAll("_", " ");
}
