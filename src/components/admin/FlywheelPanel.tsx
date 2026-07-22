"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/forms";
import type { CollectionRecipe } from "@/lib/domain";
import {
  DEFAULT_TARGET_SAMPLE_COUNT,
  priorityScore,
  recommendedRecordingsForSlice,
  type PriorityRow,
} from "@/lib/stt/failure-analysis";

type SortKey =
  | "slice"
  | "sampleCount"
  | "meanWer"
  | "commandAccuracy"
  | "intentAccuracy"
  | "failureRate"
  | "severeFailures"
  | "severityWeight"
  | "falseActionableCommandRate"
  | "priorityScore"
  | "recommendedRecordings";

const metricDefinitions: Record<string, string> = {
  sampleCount: "Distinct recordings represented in this slice.",
  meanWer: "Average word error rate across evaluated rows. Lower is better.",
  commandAccuracy: "Average reviewer command-compliance score, scaled to percent when available.",
  intentAccuracy: "Share of rows whose semantic annotation intent matches the prompt target intent when available.",
  failureRate: "Share of rows with failed processing, high WER/CER, or severe failure classification.",
  severeFailures: "Rows with severity 3: action, negation, safety, or false-actionable failures.",
  severityWeight: "Highest severity bucket observed in the slice: 1 harmless, 2 slot/direction/number, 3 safety/action.",
  falseActionableCommandRate: "Invalid inputs where the transcript still contains a robot action.",
  priorityScore: "failure_rate x severity_weight x coverage_gap_weight.",
  recommendedRecordings: "Suggested top-up count based on target coverage and severity.",
};

export function FlywheelPanel({ priorities, recipes }: { priorities: PriorityRow[]; recipes: CollectionRecipe[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [targetSampleCount, setTargetSampleCount] = useState(DEFAULT_TARGET_SAMPLE_COUNT);
  const [sortKey, setSortKey] = useState<SortKey>("priorityScore");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [targetAcceptedRecordings, setTargetAcceptedRecordings] = useState(90);
  const [promptsPerSession, setPromptsPerSession] = useState(10);
  const [name, setName] = useState("Targeted follow-up recipe");
  const [contributorInstructions, setContributorInstructions] = useState(
    "Record short commands that match the selected collection-priority slices. Avoid names, addresses, patient identifiers, and private details.",
  );
  const [followUpNotes, setFollowUpNotes] = useState("");
  const runId = priorities[0]?.runId;
  const showingDemoPreview = priorities.length === 0;
  const rawPriorities = showingDemoPreview ? demoCollectionPriorities : priorities;
  const displayPriorities = useMemo(() => {
    const scored = rawPriorities.map((priority) => ({
      ...priority,
      priorityScore: priorityScore({
        failureRate: priority.failureRate,
        severityWeight: priority.severityWeight,
        sampleCount: priority.sampleCount,
        targetSampleCount,
      }),
      recommendedRecordings: recommendedRecordingsForSlice(priority.sampleCount, targetSampleCount, priority.severityWeight),
    }));
    return scored.sort((a, b) => comparePriorities(a, b, sortKey, sortDirection));
  }, [rawPriorities, targetSampleCount, sortKey, sortDirection]);

  function updateSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "slice" ? "asc" : "desc");
  }

  async function createFollowUp() {
    if (!runId || selected.length === 0 || showingDemoPreview) return;
    const response = await fetch("/api/admin/flywheel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId,
        sliceKeys: selected,
        name,
        targetAcceptedRecordings,
        promptsPerSession,
        contributorInstructions,
        followUpNotes: followUpNotes || `Selected next-collection priorities: ${selected.join(", ")}`,
      }),
    });
    const body = (await response.json().catch(() => null)) as { recipe?: CollectionRecipe; error?: string } | null;
    if (!response.ok || !body?.recipe) {
      setMessage(body?.error ?? "Could not create follow-up recipe.");
      return;
    }
    setMessage(`Created draft recipe: ${body.recipe.name}`);
    router.push(`/admin/recipes/${body.recipe.id}/edit`);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">Next collection priorities</h2>
              <Link href="/admin/flywheel/glossary" className="text-sm text-accent hover:underline">
                Metric glossary
              </Link>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Priority score = failure rate x severity weight x coverage-gap weight. Default target coverage is 50
              recordings per slice and can be adjusted here for planning.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36 space-y-1">
              <Label>Target per slice</Label>
              <Input
                type="number"
                min={1}
                value={targetSampleCount}
                onChange={(event) => setTargetSampleCount(Math.max(1, Number(event.target.value)))}
              />
            </div>
            <Button type="button" onClick={createFollowUp} disabled={!selected.length || showingDemoPreview}>
              Create follow-up recipe
            </Button>
          </div>
        </div>
        {showingDemoPreview ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Demo preview: run an evaluation to replace these sample rows with live collection priorities.
          </p>
        ) : null}
        <div className="mt-5 overflow-auto">
          <table className="w-full min-w-[1500px] table-fixed text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-zinc-500">
              <tr>
                <th className="w-12 px-3 py-2">Use</th>
                <SortableTh className="w-48" label="Slice" sortKeyValue="slice" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
                <th className="w-64 px-3 py-2 align-bottom">Conditions</th>
                <SortableTh label="Samples" metricKey="sampleCount" sortKeyValue="sampleCount" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
                <SortableTh label="WER" metricKey="meanWer" sortKeyValue="meanWer" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
                <SortableTh
                  label="Command acc."
                  metricKey="commandAccuracy"
                  sortKeyValue="commandAccuracy"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={updateSort}
                />
                <SortableTh
                  label="Intent acc."
                  metricKey="intentAccuracy"
                  sortKeyValue="intentAccuracy"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={updateSort}
                />
                <SortableTh label="Failure" metricKey="failureRate" sortKeyValue="failureRate" activeKey={sortKey} direction={sortDirection} onSort={updateSort} />
                <SortableTh
                  label="Severe"
                  metricKey="severeFailures"
                  sortKeyValue="severeFailures"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={updateSort}
                />
                <SortableTh
                  label="Severity"
                  metricKey="severityWeight"
                  sortKeyValue="severityWeight"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={updateSort}
                />
                <SortableTh
                  label="False actionable"
                  metricKey="falseActionableCommandRate"
                  sortKeyValue="falseActionableCommandRate"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={updateSort}
                />
                <SortableTh
                  label="Priority"
                  metricKey="priorityScore"
                  sortKeyValue="priorityScore"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={updateSort}
                />
                <SortableTh
                  label="Recommended"
                  metricKey="recommendedRecordings"
                  sortKeyValue="recommendedRecordings"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onSort={updateSort}
                />
                <th className="w-72 px-3 py-2 align-bottom">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayPriorities.map((priority) => {
                const key = priority.key;
                return (
                  <Fragment key={key}>
                    <tr
                      className="cursor-pointer border-b border-border hover:bg-muted"
                      onClick={() => setExpandedKey(expandedKey === key ? undefined : key)}
                    >
                      <td className="px-3 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(key)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked ? [...current, key] : current.filter((item) => item !== key),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="font-medium">{priority.slice}</span>: {priority.name}{" "}
                        {priority.limitedSample ? <Badge tone="amber">limited sample</Badge> : null}
                      </td>
                      <td className="px-3 py-3 align-top text-zinc-700">{priority.conditions.join(" / ")}</td>
                      <td className="px-3 py-3 align-top">
                        {priority.sampleCount} ({priority.evaluatedCount} eval)
                      </td>
                      <td className="px-3 py-3 align-top">{priority.meanWer.toFixed(3)}</td>
                      <td className="px-3 py-3 align-top">{formatOptionalPercent(priority.commandAccuracy)}</td>
                      <td className="px-3 py-3 align-top">{formatOptionalPercent(priority.intentAccuracy)}</td>
                      <td className="px-3 py-3 align-top">{Math.round(priority.failureRate * 100)}%</td>
                      <td className="px-3 py-3 align-top">{priority.severeFailures}</td>
                      <td className="px-3 py-3 align-top">{priority.severityWeight.toFixed(1)}</td>
                      <td className="px-3 py-3 align-top">{Math.round(priority.falseActionableCommandRate * 100)}%</td>
                      <td className="px-3 py-3 align-top font-medium">{priority.priorityScore.toFixed(2)}</td>
                      <td className="px-3 py-3 align-top">{priority.recommendedRecordings}</td>
                      <td className="px-3 py-3 align-top text-zinc-700">{priority.action}</td>
                    </tr>
                    {expandedKey === key ? (
                      <tr key={`${key}-examples`} className="border-b border-border">
                        <td colSpan={14} className="bg-muted px-3 py-3">
                          <PriorityExamples priority={priority} showingDemoPreview={showingDemoPreview} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {message ? <p className="mt-3 text-sm text-zinc-700">{message}</p> : null}
      </section>

      <section className="rounded-lg border border-border bg-white p-5">
        <h2 className="text-lg font-semibold">Follow-up recipe customization</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Tune the draft before creating it, then use edit mode to review prompts and settings before activation.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Draft recipe name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Target accepted</Label>
              <Input
                type="number"
                min={1}
                value={targetAcceptedRecordings}
                onChange={(event) => setTargetAcceptedRecordings(Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Prompts/session</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={promptsPerSession}
                onChange={(event) => setPromptsPerSession(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Contributor instructions</Label>
            <Textarea value={contributorInstructions} onChange={(event) => setContributorInstructions(event.target.value)} />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Follow-up notes</Label>
            <Textarea
              value={followUpNotes}
              onChange={(event) => setFollowUpNotes(event.target.value)}
              placeholder="What failed, what slices this recipe targets, and what success criterion you expect."
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-white p-5">
        <h2 className="text-lg font-semibold">Draft follow-up recipes</h2>
        <div className="mt-3 space-y-3">
          {recipes
            .filter((recipe) => recipe.sourceEvaluationRunId)
            .map((recipe) => (
              <div key={recipe.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{recipe.name}</strong>
                  <Badge>{recipe.status}</Badge>
                </div>
                <p className="mt-2 text-zinc-700">{recipe.followUpNotes}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/admin/recipes/${recipe.id}/edit`} className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
                    Edit
                  </Link>
                  <Link
                    href={`/admin/recipes/${recipe.id}/dataset-card`}
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted"
                  >
                    Overview
                  </Link>
                </div>
              </div>
            ))}
          {recipes.filter((recipe) => recipe.sourceEvaluationRunId).length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>Example follow-up recipe: Noisy safety intervention top-up</strong>
                <Badge tone="amber">demo</Badge>
              </div>
              <p className="mt-2 text-zinc-700">
                Would copy safety and stop/pause prompts into a draft recipe targeting outdoor traffic, far microphone
                distance, and code-switched commands because the priority row shows high failure severity and low coverage.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PriorityExamples({
  priority,
  showingDemoPreview,
}: {
  priority?: PriorityRow;
  showingDemoPreview: boolean;
}) {
  if (!priority) return null;
  return (
    <div className="mt-4 rounded-md border border-border bg-muted p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">
          Examples behind {priority.slice}: {priority.name}
        </strong>
        <Badge>{priority.sampleCount} sample{priority.sampleCount === 1 ? "" : "s"}</Badge>
      </div>
      {priority.examples.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">No row examples are available for this priority.</p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {priority.examples.map((example) => (
            <div key={example.rowId} className="rounded-md border border-border bg-white p-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>{example.modelName}</Badge>
                <Badge tone={example.severity >= 3 ? "red" : example.severity === 2 ? "amber" : "blue"}>
                  severity {example.severity}
                </Badge>
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
              {!showingDemoPreview ? <audio src={`/api/audio/${example.recordingId}`} controls className="mt-2 w-full" /> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label,
  metricKey,
  sortKeyValue,
  activeKey,
  direction,
  onSort,
  className = "w-28",
}: {
  label: string;
  metricKey?: keyof typeof metricDefinitions;
  sortKeyValue: SortKey;
  activeKey: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKeyValue;
  return (
    <th className={`${className} px-3 py-2 align-bottom`}>
      <button
        type="button"
        onClick={() => onSort(sortKeyValue)}
        className="flex w-full items-center gap-1 text-left text-xs font-semibold uppercase leading-4 text-zinc-500 hover:text-foreground"
      >
        <span className="whitespace-normal">{label}</span>
        {metricKey ? <MetricInfo text={metricDefinitions[metricKey]} /> : null}
        <span className="ml-auto text-[10px]">{active ? (direction === "asc" ? "Asc" : "Desc") : "Sort"}</span>
      </button>
    </th>
  );
}

function MetricInfo({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0" onClick={(event) => event.stopPropagation()}>
      <Info className="h-3.5 w-3.5 text-zinc-500" aria-label="Metric definition" />
      <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-64 -translate-x-1/2 rounded-md border border-border bg-white p-3 text-xs font-normal normal-case leading-5 text-zinc-700 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function comparePriorities(a: PriorityRow, b: PriorityRow, key: SortKey, direction: "asc" | "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  const left = prioritySortValue(a, key);
  const right = prioritySortValue(b, key);
  if (typeof left === "string" || typeof right === "string") {
    return multiplier * String(left).localeCompare(String(right));
  }
  return multiplier * ((left ?? -1) - (right ?? -1));
}

function prioritySortValue(priority: PriorityRow, key: SortKey) {
  if (key === "slice") return `${priority.slice}: ${priority.name}`;
  return priority[key] ?? -1;
}

function formatOptionalPercent(value: number | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a";
}

const demoCollectionPriorities: PriorityRow[] = [
  {
    key: "Combination:Hesitation + self-correction + noise",
    runId: "demo",
    slice: "Combination",
    name: "Hesitation + self-correction + noise",
    conditions: ["Hesitation = present", "Self-correction = present", "Noise/SNR = Background noise"],
    sampleCount: 6,
    evaluatedCount: 6,
    meanWer: 0.42,
    failureRate: 0.67,
    severeFailures: 3,
    falseActionableCommandRate: 0.17,
    severityWeight: 3,
    priorityScore: priorityScore({ failureRate: 0.67, severityWeight: 3, sampleCount: 6 }),
    recommendedRecordings: recommendedRecordingsForSlice(6, DEFAULT_TARGET_SAMPLE_COUNT, 3),
    action: "Create a focused follow-up recipe for hesitant corrections in noise.",
    limitedSample: true,
    examples: [],
  },
  {
    key: "Noise/SNR:Machinery noise",
    runId: "demo",
    slice: "Noise/SNR",
    name: "Machinery noise",
    conditions: ["Noise/SNR = Machinery noise"],
    sampleCount: 4,
    evaluatedCount: 4,
    meanWer: 0.5,
    commandAccuracy: undefined,
    intentAccuracy: undefined,
    failureRate: 0.5,
    severeFailures: 2,
    falseActionableCommandRate: 0.25,
    severityWeight: 3,
    priorityScore: priorityScore({ failureRate: 0.5, severityWeight: 3, sampleCount: 4 }),
    recommendedRecordings: recommendedRecordingsForSlice(4, DEFAULT_TARGET_SAMPLE_COUNT, 3),
    action: "Collect invalid machinery/noise clips and inspect false actionable outputs.",
    limitedSample: true,
    examples: [],
  },
  {
    key: "Command type:Quiet scripted commands",
    runId: "demo",
    slice: "Command type",
    name: "Quiet scripted commands",
    conditions: ["Environment = Indoor, quiet", "Hesitation = absent", "Self-correction = absent"],
    sampleCount: 80,
    evaluatedCount: 80,
    meanWer: 0.03,
    commandAccuracy: 0.96,
    intentAccuracy: 0.95,
    failureRate: 0.01,
    severeFailures: 0,
    falseActionableCommandRate: 0,
    severityWeight: 1,
    priorityScore: priorityScore({ failureRate: 0.01, severityWeight: 1, sampleCount: 80 }),
    recommendedRecordings: 0,
    action: "Monitor; this slice is comparatively healthy.",
    limitedSample: false,
    examples: [],
  },
];
