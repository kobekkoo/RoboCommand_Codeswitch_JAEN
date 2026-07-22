"use client";

import type * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Database, FileJson, Filter, Info, Plus, Save, Search, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/forms";
import { MAX_AUDIO_FILE_BYTES, supportedAudioMimeTypes } from "@/lib/constants";
import {
  buildDatasetRowsFromImport,
  inferColumnRole,
  parseDatasetImport,
  type ImportColumnRole,
  importColumnRoles,
} from "@/lib/evals/dataset-import";
import type {
  CollectionRecipe,
  CommandPrompt,
  EvalDataset,
  EvalDatasetRow,
  LinguisticDiversityCategory,
  QualityReview,
  Recording,
  RecordingSession,
} from "@/lib/domain";

type DatasetSource = "recordings" | "import" | "manual";

type RecordingCandidateRow = {
  recording: Recording;
  prompt?: CommandPrompt;
  review?: QualityReview;
  session?: RecordingSession;
  category: LinguisticDiversityCategory;
  durationBucket: string;
};

const categoryLabels: Record<LinguisticDiversityCategory, string> = {
  code_switching: "Code-switching",
  short_utterance: "Short utterance",
  incomplete_audio: "Incomplete audio",
  general: "General",
};

const roleLabels: Record<ImportColumnRole, string> = {
  input: "Input / instruction",
  audio: "Audio URL or path",
  human_transcript: "Human transcript",
  expected: "Expected text",
  tags: "Tags",
  metadata: "Metadata JSON",
  id: "ID",
  do_not_import: "Do not import",
};

const manualAudioAccept = supportedAudioMimeTypes.join(",");

export function EvaluationDatasetsView({
  recipes,
  prompts,
  recordings,
  reviews,
  sessions,
  datasets,
}: {
  recipes: CollectionRecipe[];
  prompts: CommandPrompt[];
  recordings: Recording[];
  reviews: QualityReview[];
  sessions: RecordingSession[];
  datasets: EvalDataset[];
}) {
  const router = useRouter();
  const [source, setSource] = useState<DatasetSource>("recordings");
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");
  const [language, setLanguage] = useState("all");
  const [category, setCategory] = useState("all");
  const [duration, setDuration] = useState("all");
  const [minQuality, setMinQuality] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string>();
  const [activeDatasetId, setActiveDatasetId] = useState(datasets[0]?.id ?? "");
  const [activeRecordingId, setActiveRecordingId] = useState<string>();
  const [manualRows, setManualRows] = useState<EvalDatasetRow[]>([]);
  const [parsedImport, setParsedImport] = useState<{ headers: string[]; rows: Array<Record<string, string>>; fileName: string }>();
  const [columnRoles, setColumnRoles] = useState<Record<string, ImportColumnRole>>({});

  const candidateRows = useMemo(() => buildRecordingRows({ recordings, reviews, prompts, sessions }), [prompts, recordings, reviews, sessions]);
  const visibleRows = useMemo(
    () => filterRecordingRows(candidateRows, { recipeId, language, category, duration, minQuality, query }),
    [candidateRows, category, duration, language, minQuality, query, recipeId],
  );
  const importedRows = useMemo(() => {
    if (!parsedImport) return [];
    return buildDatasetRowsFromImport({ parsedRows: parsedImport.rows, roles: columnRoles });
  }, [columnRoles, parsedImport]);
  const rowsForSave = source === "import" ? importedRows : source === "manual" ? manualRows : [];
  const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId) ?? datasets[0];
  const activeRecording = visibleRows.find((row) => row.recording.id === activeRecordingId) ?? visibleRows[0];
  const selectedVisibleCount = visibleRows.filter((row) => selectedIds.has(row.recording.id)).length;

  async function handleFile(file?: File) {
    setMessage(undefined);
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = parseDatasetImport(content, file.name);
      const roles = Object.fromEntries(parsed.headers.map((header) => [header, inferColumnRole(header)]));
      setParsedImport({ ...parsed, fileName: file.name });
      setColumnRoles(roles);
      setMessage(`Parsed ${parsed.rows.length} rows from ${file.name}.`);
    } catch (error) {
      setParsedImport(undefined);
      setColumnRoles({});
      setMessage(error instanceof Error ? error.message : "Could not parse import file.");
    }
  }

  async function saveDataset(formData: FormData) {
    setMessage(undefined);
    const recordingIds = source === "recordings" ? [...selectedIds].filter((id) => visibleRows.some((row) => row.recording.id === id)) : undefined;
    const rows = source === "recordings" ? undefined : rowsForSave;
    if (source === "recordings" && !recordingIds?.length) {
      setMessage("Select at least one accepted recording.");
      return;
    }
    if (source !== "recordings" && rowsForSave.length === 0) {
      setMessage("Add or import at least one valid dataset row.");
      return;
    }
    if (source === "manual" && rowsForSave.some((row) => !row.audioUrl && !row.audioStoragePath)) {
      setMessage("Manual rows require an uploaded audio file in an accepted format.");
      return;
    }
    const response = await fetch("/api/admin/evaluations/datasets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
        recipeId: source === "recordings" ? recipeId : formData.get("recipeId") || undefined,
        recordingIds,
        rows,
        filters: {
          source,
          recipeId,
          language,
          category,
          duration,
          minQuality,
          query,
          importFileName: parsedImport?.fileName,
        },
        tags: String(formData.get("tags") ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    });
    const body = (await response.json().catch(() => null)) as { dataset?: EvalDataset; error?: string } | null;
    if (!response.ok || !body?.dataset) {
      setMessage(body?.error ?? "Could not save dataset.");
      return;
    }
    setMessage("Dataset snapshot saved.");
    setSelectedIds(new Set());
    setActiveDatasetId(body.dataset.id);
    router.refresh();
  }

  function addManualRow() {
    setManualRows((current) => [
      ...current,
      {
        id: `manual-row-${current.length + 1}`,
        source: "manual",
        inputText: "",
        humanTranscript: "",
        expectedText: "",
        tags: [],
        metadataJson: {},
        rowOrder: current.length,
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Datasets</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Snapshot accepted recordings or import CSV/JSON rows into reusable eval datasets. Each dataset freezes inputs for playground previews and
            experiments.
          </p>
        </div>
        <InfoTooltip text="A CommandLoop eval dataset is a fixed set of audio rows plus human transcripts, tags, and metadata. Experiments use this snapshot so results stay comparable over time." />
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Create dataset
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveDataset} className="space-y-4">
              <SourceTabs source={source} setSource={setSource} />
              <div className="space-y-2">
                <Label htmlFor="datasetName">Dataset name</Label>
                <Input id="datasetName" name="name" defaultValue={`Linguistic eval set ${new Date().toISOString().slice(0, 10)}`} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="datasetDescription">Description</Label>
                <Textarea
                  id="datasetDescription"
                  name="description"
                  placeholder="Regression set for code-switching, short utterances, and incomplete audio."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="datasetTags">Tags</Label>
                <Input id="datasetTags" name="tags" placeholder="robotics, code-switch, smoke" />
              </div>
              {source !== "recordings" ? (
                <div className="space-y-2">
                  <Label>Recipe context</Label>
                  <Select name="recipeId" defaultValue="">
                    <option value="">No recipe context</option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              <div className="rounded-md border border-border bg-muted p-3 text-sm">
                <p className="font-medium">
                  {source === "recordings" ? selectedVisibleCount : rowsForSave.length} row
                  {(source === "recordings" ? selectedVisibleCount : rowsForSave.length) === 1 ? "" : "s"} ready
                </p>
                <p className="mt-1 text-zinc-600">
                  {source === "recordings"
                    ? "Recording snapshots include audio playback and the displayed exact text shown during review."
                    : source === "manual"
                      ? "Manual rows require a supported audio upload before they can be saved."
                      : "Imported rows without audio can still test scoring/display, but real STT models need audio URLs or CommandLoop recordings."}
                </p>
              </div>

              <Button type="submit" disabled={source === "recordings" ? !selectedVisibleCount : rowsForSave.length === 0}>
                <Save className="h-4 w-4" />
                Save dataset
              </Button>
              {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
            </form>

            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold">Saved datasets</h3>
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => setActiveDatasetId(dataset.id)}
                  className={`w-full rounded-md border p-3 text-left text-sm ${
                    activeDatasetId === dataset.id ? "border-accent bg-sky-50" : "border-border bg-white hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{dataset.name}</span>
                    <Badge tone="blue">{dataset.rowCount} rows</Badge>
                  </div>
                  {dataset.description ? <p className="mt-1 text-xs text-zinc-600">{dataset.description}</p> : null}
                  <p className="mt-2 text-xs text-zinc-500">
                    {dataset.rowsJson?.length ? "Imported/manual rows" : "Accepted recording snapshot"}
                    {dataset.tags.length ? ` · ${dataset.tags.join(", ")}` : ""}
                  </p>
                </button>
              ))}
              {datasets.length === 0 ? <p className="text-sm text-zinc-600">No saved datasets yet.</p> : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          {source === "recordings" ? (
            <RecordingSourcePanel
              recipes={recipes}
              recipeId={recipeId}
              setRecipeId={setRecipeId}
              language={language}
              setLanguage={setLanguage}
              category={category}
              setCategory={setCategory}
              duration={duration}
              setDuration={setDuration}
              minQuality={minQuality}
              setMinQuality={setMinQuality}
              query={query}
              setQuery={setQuery}
              visibleRows={visibleRows}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              activeRecording={activeRecording}
              setActiveRecordingId={setActiveRecordingId}
            />
          ) : source === "import" ? (
            <ImportSourcePanel
              parsedImport={parsedImport}
              columnRoles={columnRoles}
              setColumnRoles={setColumnRoles}
              importedRows={importedRows}
              handleFile={handleFile}
            />
          ) : (
            <ManualSourcePanel rows={manualRows} setRows={setManualRows} addManualRow={addManualRow} setMessage={setMessage} />
          )}

          <SavedDatasetPanel dataset={activeDataset} recordings={recordings} prompts={prompts} reviews={reviews} />
        </div>
      </div>
    </div>
  );
}

function SourceTabs({ source, setSource }: { source: DatasetSource; setSource: (source: DatasetSource) => void }) {
  const sources: Array<{ value: DatasetSource; label: string; icon: typeof Database }> = [
    { value: "recordings", label: "Accepted recordings", icon: Database },
    { value: "import", label: "CSV/JSON import", icon: Upload },
    { value: "manual", label: "Manual row", icon: Plus },
  ];
  return (
    <div className="grid gap-2">
      {sources.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => setSource(item.value)}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
              source === item.value ? "border-accent bg-sky-50 font-medium" : "border-border bg-white hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function RecordingSourcePanel({
  recipes,
  recipeId,
  setRecipeId,
  language,
  setLanguage,
  category,
  setCategory,
  duration,
  setDuration,
  minQuality,
  setMinQuality,
  query,
  setQuery,
  visibleRows,
  selectedIds,
  setSelectedIds,
  activeRecording,
  setActiveRecordingId,
}: {
  recipes: CollectionRecipe[];
  recipeId: string;
  setRecipeId: (value: string) => void;
  language: string;
  setLanguage: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  duration: string;
  setDuration: (value: string) => void;
  minQuality: string;
  setMinQuality: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  visibleRows: RecordingCandidateRow[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeRecording?: RecordingCandidateRow;
  setActiveRecordingId: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Accepted recording rows
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FilterSelect label="Recipe" value={recipeId} onChange={setRecipeId}>
            {recipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Language" value={language} onChange={setLanguage}>
            <option value="all">All languages</option>
            <option value="English">English</option>
            <option value="Japanese">Japanese</option>
            <option value="English-Japanese">English-Japanese</option>
          </FilterSelect>
          <FilterSelect label="Linguistic slice" value={category} onChange={setCategory}>
            <option value="all">All slices</option>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Duration" value={duration} onChange={setDuration}>
            <option value="all">All durations</option>
            <option value="0-3 seconds">0-3 seconds</option>
            <option value="3-8 seconds">3-8 seconds</option>
            <option value="8+ seconds">8+ seconds</option>
          </FilterSelect>
          <FilterSelect label="Min quality" value={minQuality} onChange={setMinQuality}>
            <option value="all">Any score</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
            <option value="5">5</option>
          </FilterSelect>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search instruction or transcript" />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSelectedIds(new Set(visibleRows.map((row) => row.recording.id)))}
            disabled={visibleRows.length === 0}
          >
            <Check className="h-4 w-4" />
            Select visible
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-normal text-zinc-600">
                <tr>
                  <th className="w-12 px-3 py-2">Use</th>
                  <th className="px-3 py-2">Displayed exact text</th>
                  <th className="px-3 py-2">Slice</th>
                  <th className="px-3 py-2">Language</th>
                  <th className="px-3 py-2">Quality</th>
                  <th className="px-3 py-2">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {visibleRows.map((row) => (
                  <tr key={row.recording.id} className="cursor-pointer align-top hover:bg-muted/50" onClick={() => setActiveRecordingId(row.recording.id)}>
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.recording.id)}
                        onChange={(event) => {
                          const next = new Set(selectedIds);
                          if (event.target.checked) next.add(row.recording.id);
                          else next.delete(row.recording.id);
                          setSelectedIds(next);
                        }}
                        aria-label={`Select recording ${row.recording.id}`}
                      />
                    </td>
                    <td className="max-w-xl px-3 py-3">
                      <p className="font-medium">{referenceTextForRecordingRow(row)}</p>
                      <p className="mt-1 text-xs text-zinc-600">{row.prompt?.displayInstruction}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge>{categoryLabels[row.category]}</Badge>
                    </td>
                    <td className="px-3 py-3">{row.prompt?.language ?? "Unknown"}</td>
                    <td className="px-3 py-3">{row.review?.audioQualityScore ?? "-"}</td>
                    <td className="px-3 py-3">{row.durationBucket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RecordingDetail row={activeRecording} />
        </div>
        {visibleRows.length === 0 ? <p className="text-sm text-zinc-600">No accepted recordings match these filters.</p> : null}
      </CardContent>
    </Card>
  );
}

function ImportSourcePanel({
  parsedImport,
  columnRoles,
  setColumnRoles,
  importedRows,
  handleFile,
}: {
  parsedImport?: { headers: string[]; rows: Array<Record<string, string>>; fileName: string };
  columnRoles: Record<string, ImportColumnRole>;
  setColumnRoles: React.Dispatch<React.SetStateAction<Record<string, ImportColumnRole>>>;
  importedRows: EvalDatasetRow[];
  handleFile: (file?: File) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="h-4 w-4" />
          Import data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 bg-white p-6 text-center hover:bg-muted">
          <Upload className="h-8 w-8 text-zinc-500" />
          <span className="mt-3 font-medium">Upload CSV or JSON</span>
          <span className="mt-1 text-sm text-zinc-600">Columns can map to input, audio, human transcript, expected text, tags, metadata, or ID.</span>
          <input type="file" accept=".csv,.json,application/json,text/csv" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>

        {parsedImport ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{parsedImport.fileName}</h3>
                  <p className="text-sm text-zinc-600">{parsedImport.rows.length} parsed rows · {importedRows.length} valid rows</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="min-w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-muted text-xs uppercase tracking-normal text-zinc-600">
                    <tr>
                      {parsedImport.headers.map((header) => (
                        <th key={header} className="min-w-48 px-3 py-2">
                          <span className="block">{header}</span>
                          <Select
                            className="mt-2 h-9 bg-white normal-case"
                            value={columnRoles[header] ?? "do_not_import"}
                            onChange={(event) =>
                              setColumnRoles((current) => ({ ...current, [header]: event.target.value as ImportColumnRole }))
                            }
                          >
                            {importColumnRoles.map((role) => (
                              <option key={role} value={role}>
                                {roleLabels[role]}
                              </option>
                            ))}
                          </Select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-white">
                    {parsedImport.rows.slice(0, 10).map((row, index) => (
                      <tr key={index}>
                        {parsedImport.headers.map((header) => (
                          <td key={header} className="max-w-xs truncate px-3 py-2 text-xs">
                            {row[header] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-md border border-border bg-white p-3">
              <h3 className="font-semibold">Mapped row preview</h3>
              {importedRows[0] ? (
                <div className="mt-3 space-y-3 text-sm">
                  <Field label="Input" value={importedRows[0].inputText} />
                  <Field label="Human transcript" value={importedRows[0].humanTranscript} />
                  <Field label="Expected" value={importedRows[0].expectedText || "-"} />
                  <Field label="Tags" value={importedRows[0].tags.join(", ") || "-"} />
                  <Field label="Metadata" value={JSON.stringify(importedRows[0].metadataJson)} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-amber-800">Map at least input and human transcript columns to create valid rows.</p>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ManualSourcePanel({
  rows,
  setRows,
  addManualRow,
  setMessage,
}: {
  rows: EvalDatasetRow[];
  setRows: React.Dispatch<React.SetStateAction<EvalDatasetRow[]>>;
  addManualRow: () => void;
  setMessage: (message: string | undefined) => void;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number>();

  async function attachAudio(file: File | undefined, index: number) {
    setMessage(undefined);
    if (!file) return;
    const validation = validateManualAudio(file);
    if (!validation.ok) {
      setMessage(validation.error);
      return;
    }
    const formData = new FormData();
    formData.set("audio", file);
    setUploadingIndex(index);
    const response = await fetch("/api/admin/evaluations/datasets/audio", {
      method: "POST",
      body: formData,
    });
    const body = (await response.json().catch(() => null)) as
      | {
          storagePath?: string;
          audioUrl?: string;
          mimeType?: string;
          fileName?: string;
          fileSizeBytes?: number;
          error?: string;
        }
      | null;
    setUploadingIndex(undefined);
    if (!response.ok || !body?.storagePath || !body.audioUrl) {
      setMessage(body?.error ?? "Could not upload manual row audio.");
      return;
    }
    setRows((current) =>
      updateManualRow(current, index, {
        audioUrl: body.audioUrl,
        audioStoragePath: body.storagePath,
        metadataJson: {
          ...current[index]?.metadataJson,
          audioFileName: body.fileName ?? file.name,
          audioMimeType: body.mimeType ?? file.type,
          audioSizeBytes: body.fileSizeBytes ?? file.size,
          audioStoragePath: body.storagePath,
          audioUrl: body.audioUrl,
        },
      }),
    );
    setMessage(`${body.fileName ?? file.name} uploaded.`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual rows</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" variant="secondary" onClick={addManualRow}>
          <Plus className="h-4 w-4" />
          Add row
        </Button>
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="rounded-md border border-border bg-white p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Input / instruction</Label>
                  <Textarea
                    value={row.inputText}
                    onChange={(event) => setRows((current) => updateManualRow(current, index, { inputText: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Human transcript</Label>
                  <Textarea
                    value={row.humanTranscript}
                    onChange={(event) => setRows((current) => updateManualRow(current, index, { humanTranscript: event.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-2">
                  <Label>Audio file</Label>
                  <Input
                    type="file"
                    accept={manualAudioAccept}
                    onChange={(event) => {
                      void attachAudio(event.target.files?.[0], index);
                    }}
                    required={!row.audioUrl && !row.audioStoragePath}
                  />
                  <p className="text-xs text-zinc-500">Accepted: WebM, MP4, MP3, WAV, or OGG under 10 MB.</p>
                </div>
                <div className="rounded-md border border-border bg-muted p-3 text-sm">
                  <p className="font-medium">{typeof row.metadataJson.audioFileName === "string" ? row.metadataJson.audioFileName : "No audio attached"}</p>
                  {uploadingIndex === index ? <p className="mt-2 text-xs text-zinc-600">Uploading audio...</p> : null}
                  {row.audioUrl ? <audio src={row.audioUrl} controls className="mt-2 w-full" /> : <p className="mt-2 text-xs text-amber-800">Audio is required.</p>}
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 ? <p className="text-sm text-zinc-600">Add a row with an audio file to create a small manual eval dataset.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SavedDatasetPanel({
  dataset,
  recordings,
  prompts,
  reviews,
}: {
  dataset?: EvalDataset;
  recordings: Recording[];
  prompts: CommandPrompt[];
  reviews: QualityReview[];
}) {
  if (!dataset) return null;
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const reviewByRecording = new Map(reviews.map((review) => [review.recordingId, review]));
  const rowPreview = dataset.rowsJson?.length
    ? dataset.rowsJson
        .slice(0, 8)
        .map((row) => ({ id: row.id, input: row.inputText, reference: row.humanTranscript, audioId: row.sourceRecordingId, audioUrl: row.audioUrl }))
    : dataset.recordingIds.slice(0, 8).map((recordingId) => {
        const recording = recordings.find((candidate) => candidate.id === recordingId);
        const prompt = recording ? promptById.get(recording.promptId) : undefined;
        const review = recording ? reviewByRecording.get(recording.id) : undefined;
        return {
          id: recordingId,
          input: prompt?.displayInstruction ?? "-",
          reference: referenceText({ prompt, review, recording }),
          audioId: recordingId,
          audioUrl: undefined,
        };
      });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dataset table</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{dataset.name}</h3>
            <p className="mt-1 text-sm text-zinc-600">{dataset.description || "No description"}</p>
          </div>
          <Badge tone="blue">{dataset.rowCount} rows</Badge>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-muted text-xs uppercase tracking-normal text-zinc-600">
              <tr>
                <th className="px-3 py-2">Input</th>
                <th className="px-3 py-2">Displayed exact text</th>
                <th className="px-3 py-2">Audio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {rowPreview.map((row) => (
                <tr key={row.id}>
                  <td className="max-w-md px-3 py-3">{row.input}</td>
                  <td className="max-w-md px-3 py-3">{row.reference}</td>
                  <td className="min-w-72 px-3 py-3">
                    {row.audioId ? (
                      <audio src={`/api/audio/${row.audioId}`} controls className="w-full" />
                    ) : row.audioUrl ? (
                      <audio src={row.audioUrl} controls className="w-full" />
                    ) : (
                      <span className="text-zinc-500">Text only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RecordingDetail({ row }: { row?: RecordingCandidateRow }) {
  if (!row) {
    return (
      <div className="rounded-md border border-border bg-white p-3 text-sm text-zinc-600">Select a row to inspect audio, prompt, and metadata.</div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-white p-3 text-sm">
      <h3 className="font-semibold">Row details</h3>
      <div className="mt-3 space-y-3">
        <audio src={`/api/audio/${row.recording.id}`} controls className="w-full" />
        <Field label="Prompt instruction" value={row.prompt?.displayInstruction ?? "-"} />
        <Field label="Displayed exact text" value={referenceTextForRecordingRow(row)} />
        <Field label="Reviewed transcript" value={row.review?.reviewedTranscript || "-"} />
        <Field label="Initial contributor transcript" value={row.recording.contributorTranscript} />
        <Field label="Tags" value={row.prompt?.tags.join(", ") || "-"} />
        <Field label="Environment" value={row.session?.environmentType ?? "-"} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-normal text-zinc-500">{label}</p>
      <p className="mt-1 text-zinc-800">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-4 w-4 text-zinc-500" aria-label={text} />
      <span className="pointer-events-none absolute right-0 top-6 z-20 hidden w-80 rounded-md border border-border bg-white p-3 text-xs font-normal leading-5 text-zinc-700 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function buildRecordingRows({
  recordings,
  reviews,
  prompts,
  sessions,
}: {
  recordings: Recording[];
  reviews: QualityReview[];
  prompts: CommandPrompt[];
  sessions: RecordingSession[];
}) {
  const reviewByRecording = new Map(reviews.map((review) => [review.recordingId, review]));
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  return recordings
    .filter((recording) => !recording.deletedAt && recording.reviewStatus === "accepted")
    .map((recording) => {
      const prompt = promptById.get(recording.promptId);
      const review = reviewByRecording.get(recording.id);
      return {
        recording,
        prompt,
        review,
        session: sessionById.get(recording.sessionId),
        category: categoryFor({ prompt, recording, review }),
        durationBucket: durationBucket(recording.durationMs),
      } satisfies RecordingCandidateRow;
    })
    .filter((row) => row.review?.reviewedTranscript.trim());
}

function filterRecordingRows(
  rows: RecordingCandidateRow[],
  filters: { recipeId: string; language: string; category: string; duration: string; minQuality: string; query: string },
) {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.recipeId && row.recording.recipeId !== filters.recipeId) return false;
    if (filters.language !== "all" && row.prompt?.language !== filters.language) return false;
    if (filters.category !== "all" && row.category !== filters.category) return false;
    if (filters.duration !== "all" && row.durationBucket !== filters.duration) return false;
    if (filters.minQuality !== "all" && (row.review?.audioQualityScore ?? 0) < Number(filters.minQuality)) return false;
    if (!needle) return true;
    return [
      row.prompt?.displayInstruction,
      row.prompt?.exactText,
      row.recording.contributorTranscript,
      row.review?.reviewedTranscript,
      row.prompt?.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function categoryFor({
  prompt,
  recording,
  review,
}: {
  prompt?: CommandPrompt;
  recording: Recording;
  review?: QualityReview;
}): LinguisticDiversityCategory {
  const tags = prompt?.tags ?? [];
  const qualityFlags = review?.qualityFlags ?? [];
  if (
    prompt?.commandVariant === "Interrupted" ||
    tags.some((tag) => tag.includes("incomplete") || tag.includes("interrupted")) ||
    qualityFlags.includes("Incomplete command")
  ) {
    return "incomplete_audio";
  }
  if (prompt?.promptMode === "code_switching" || prompt?.language === "English-Japanese" || tags.some((tag) => tag.includes("code-switch"))) {
    return "code_switching";
  }
  if ((recording.durationMs ?? Number.POSITIVE_INFINITY) <= 3000 || tags.some((tag) => tag.includes("short"))) {
    return "short_utterance";
  }
  return "general";
}

function durationBucket(durationMs?: number) {
  const duration = durationMs ?? 0;
  if (duration < 3000) return "0-3 seconds";
  if (duration < 8000) return "3-8 seconds";
  return "8+ seconds";
}

function updateManualRow(rows: EvalDatasetRow[], index: number, patch: Partial<EvalDatasetRow>) {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
}

function referenceTextForRecordingRow(row: RecordingCandidateRow) {
  return referenceText({ prompt: row.prompt, review: row.review, recording: row.recording });
}

function referenceText({
  prompt,
  review,
  recording,
}: {
  prompt?: CommandPrompt;
  review?: QualityReview;
  recording?: Recording;
}) {
  return prompt?.exactText?.trim() || review?.reviewedTranscript?.trim() || recording?.contributorTranscript?.trim() || "-";
}

function validateManualAudio(file: File) {
  if (file.size > MAX_AUDIO_FILE_BYTES) {
    return { ok: false as const, error: "Audio file is larger than the 10 MB MVP limit." };
  }
  const normalized = file.type.toLowerCase();
  const baseMime = normalized.split(";")[0] ?? normalized;
  const allowed = supportedAudioMimeTypes.some((candidate) => {
    const candidateBase = candidate.split(";")[0];
    return normalized === candidate || baseMime === candidateBase;
  });
  if (!allowed) {
    return { ok: false as const, error: `Unsupported audio type: ${file.type || file.name}` };
  }
  return { ok: true as const };
}
