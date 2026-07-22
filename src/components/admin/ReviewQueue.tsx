"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/forms";
import { qualityLabels, type CommandPrompt, type CollectionRecipe, type QualityReview, type Recording, type RecordingSession } from "@/lib/domain";

type ReviewItem = {
  recording: Recording;
  prompt?: CommandPrompt;
  recipe?: CollectionRecipe;
  session?: RecordingSession;
  review?: QualityReview;
};

export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(items[0]?.recording.id ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [recipeFilter, setRecipeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [message, setMessage] = useState<string>();
  const recipeOptions = useMemo(
    () =>
      [...new Map(items.filter((item) => item.recipe).map((item) => [item.recipe!.id, item.recipe!])).values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [items],
  );
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (statusFilter !== "all" && item.recording.reviewStatus !== statusFilter) return false;
        if (recipeFilter !== "all" && item.recording.recipeId !== recipeFilter) return false;
        return inDateRange(item.recording.submittedAt, dateRange);
      }),
    [items, statusFilter, recipeFilter, dateRange],
  );
  const insights = useMemo(() => buildReviewInsights(filtered), [filtered]);
  const selected = filtered.find((item) => item.recording.id === selectedId) ?? filtered[0];

  async function save(formData: FormData, decision: "accepted" | "rejected") {
    if (!selected) return;
    setMessage(undefined);
    let slotsJson: Record<string, unknown>;
    try {
      slotsJson = JSON.parse(String(formData.get("semanticSlotsJson") || "{}")) as Record<string, unknown>;
    } catch {
      setMessage("Semantic slots must be valid JSON.");
      return;
    }
    const flags = qualityLabels.filter((label) => formData.get(`flag-${label}`) === "on");
    const response = await fetch("/api/admin/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recordingId: selected.recording.id,
        reviewedTranscript: formData.get("reviewedTranscript"),
        decision,
        qualityFlags: flags.length ? flags : decision === "accepted" ? ["Acceptable"] : ["Other"],
        rejectionReason: formData.get("rejectionReason"),
        audioQualityScore: Number(formData.get("audioQualityScore")),
        commandComplianceScore: Number(formData.get("commandComplianceScore")),
        transcriptConfidenceScore: Number(formData.get("transcriptConfidenceScore")),
        reviewerNotes: formData.get("reviewerNotes"),
        semanticAnnotation: {
          intent: formData.get("semanticIntent"),
          slotsJson,
          urgency: formData.get("semanticUrgency"),
          requiresClarification: formData.get("requiresClarification") === "on",
          safetySensitive: formData.get("semanticSafetySensitive") === "on",
        },
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? "Could not save review.");
      return;
    }
    router.refresh();
    const currentIndex = filtered.findIndex((item) => item.recording.id === selected.recording.id);
    setSelectedId(filtered[currentIndex + 1]?.recording.id ?? filtered[0]?.recording.id ?? "");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-white p-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Review</h1>
          <p className="text-sm text-zinc-600">Global filters update the operations summary, queue, and detail view.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Recipe</Label>
            <Select value={recipeFilter} onChange={(event) => setRecipeFilter(event.target.value)}>
              <option value="all">All recipes</option>
              {recipeOptions.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date range</Label>
            <Select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>
        </div>
      </section>

      <CollapsibleSection
        title="Review operations"
        helper="Queue volume by pipeline stage, evaluation eligibility, quality risk, and language coverage."
      >
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {insights.stageCards.map((card) => (
            <div key={card.label} className="rounded-md border border-border bg-muted p-3">
              <p className="text-xs font-medium uppercase text-zinc-500">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
              <p className="mt-1 text-xs text-zinc-600">{card.helper}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <ReviewChart title="Pipeline stage volume" data={insights.pipelineChart} xAxisLabel="Pipeline stage" yAxisLabel="Recordings" />
          <ReviewChart title="Language mix" data={insights.languageChart} xAxisLabel="Language" yAxisLabel="Recordings" />
          <ReviewChart title="Quality risk flags" data={insights.qualityChart} xAxisLabel="Quality flag" yAxisLabel="Recordings" />
        </div>
      </CollapsibleSection>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <CollapsibleSection title="Queue" bodyClassName="mt-4 space-y-3">
          <div className="max-h-[680px] space-y-2 overflow-auto">
            {filtered.map((item) => (
              <button
                key={item.recording.id}
                type="button"
                onClick={() => setSelectedId(item.recording.id)}
                className="w-full rounded-md border border-border bg-white p-3 text-left text-sm hover:border-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.prompt?.taskType ?? "Unknown task"}</span>
                  <Badge tone={item.recording.reviewStatus === "accepted" ? "green" : item.recording.reviewStatus === "rejected" ? "red" : "amber"}>
                    {item.recording.reviewStatus}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-zinc-600">{item.prompt?.displayInstruction}</p>
                <p className="mt-1 text-xs text-zinc-500">{new Date(item.recording.submittedAt).toLocaleString()}</p>
              </button>
            ))}
            {filtered.length === 0 ? <p className="text-sm text-zinc-600">No recordings match the current filters.</p> : null}
          </div>
      </CollapsibleSection>

      <CollapsibleSection title="Review detail" bodyClassName="mt-4">
          {selected ? (
            <form key={selected.recording.id} className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge>{selected.prompt?.language}</Badge>
                <Badge>{selected.prompt?.commandVariant}</Badge>
                <Badge>{selected.prompt?.taskType}</Badge>
                <Badge>{selected.session?.environmentType}</Badge>
              </div>
              <audio src={`/api/audio/${selected.recording.id}`} controls className="w-full" />
              <div>
                <Label>Playback speed</Label>
                <Select
                  onChange={(event) => {
                    const audio = document.querySelector("audio");
                    if (audio) audio.playbackRate = Number(event.target.value);
                  }}
                >
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                </Select>
              </div>
              <section className="rounded-md border border-border bg-muted p-4 text-sm leading-6">
                <p>
                  <strong>Instruction:</strong> {selected.prompt?.displayInstruction}
                </p>
                {selected.prompt?.exactText ? (
                  <p>
                    <strong>Displayed exact text:</strong> {selected.prompt.exactText}
                  </p>
                ) : null}
                <p>
                  <strong>Contributor transcript:</strong> {selected.recording.contributorTranscript}
                </p>
              </section>
              <div className="space-y-2">
                <Label>Reviewed reference transcript</Label>
                <Textarea
                  name="reviewedTranscript"
                  defaultValue={selected.review?.reviewedTranscript ?? selected.recording.contributorTranscript}
                  required
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <ScoreInput name="audioQualityScore" label="Audio quality" defaultValue={selected.review?.audioQualityScore ?? 4} />
                <ScoreInput
                  name="commandComplianceScore"
                  label="Command compliance"
                  defaultValue={selected.review?.commandComplianceScore ?? 4}
                />
                <ScoreInput
                  name="transcriptConfidenceScore"
                  label="Transcript confidence"
                  defaultValue={selected.review?.transcriptConfidenceScore ?? 4}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {qualityLabels.map((label) => (
                  <label key={label} className="flex items-center gap-2 text-sm">
                    <input name={`flag-${label}`} type="checkbox" defaultChecked={selected.review?.qualityFlags.includes(label)} />
                    {label}
                  </label>
                ))}
              </div>
              <Input name="rejectionReason" placeholder="Rejection reason, if rejecting" defaultValue={selected.review?.rejectionReason} />
              <Textarea name="reviewerNotes" placeholder="Reviewer notes" defaultValue={selected.review?.reviewerNotes} />
              <section className="grid gap-3 rounded-md border border-border bg-muted p-4">
                <div>
                  <h3 className="text-sm font-semibold">Semantic annotation</h3>
                  <p className="mt-1 text-xs text-zinc-600">
                    Label the robot-command meaning that downstream policy or planning models should learn.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                  <div className="space-y-2">
                    <Label>Intent</Label>
                    <Input
                      name="semanticIntent"
                      defaultValue={selected.review?.semanticAnnotation?.intent ?? selected.prompt?.targetIntent ?? ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Urgency</Label>
                    <Select name="semanticUrgency" defaultValue={selected.review?.semanticAnnotation?.urgency ?? "normal"}>
                      <option value="normal">Normal</option>
                      <option value="urgent">Urgent</option>
                      <option value="safety_critical">Safety critical</option>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Slots JSON</Label>
                  <Textarea
                    name="semanticSlotsJson"
                    defaultValue={JSON.stringify(selected.review?.semanticAnnotation?.slotsJson ?? selected.prompt?.slotsJson ?? {}, null, 2)}
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="requiresClarification"
                      type="checkbox"
                      defaultChecked={selected.review?.semanticAnnotation?.requiresClarification}
                    />
                    Requires clarification
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      name="semanticSafetySensitive"
                      type="checkbox"
                      defaultChecked={selected.review?.semanticAnnotation?.safetySensitive ?? selected.prompt?.safetySensitive}
                    />
                    Safety-sensitive
                  </label>
                </div>
              </section>
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={(event) => save(new FormData(event.currentTarget.form!), "accepted")}>
                  Accept and save
                </Button>
                <Button type="button" variant="danger" onClick={(event) => save(new FormData(event.currentTarget.form!), "rejected")}>
                  Reject
                </Button>
              </div>
              {message ? <p className="text-sm text-danger">{message}</p> : null}
            </form>
          ) : (
            <p className="text-sm text-zinc-600">No recordings are available for review.</p>
          )}
      </CollapsibleSection>
      </div>
    </div>
  );
}

function buildReviewInsights(items: ReviewItem[]) {
  const submitted = items.length;
  const pending = items.filter((item) => item.recording.reviewStatus === "pending").length;
  const accepted = items.filter((item) => item.recording.reviewStatus === "accepted").length;
  const rejected = items.filter((item) => item.recording.reviewStatus === "rejected").length;
  const eligible = items.filter(
    (item) => item.recording.reviewStatus === "accepted" && Boolean(item.review?.reviewedTranscript.trim()),
  ).length;
  const avgAudioScore =
    items.reduce((sum, item) => sum + (item.review?.audioQualityScore ?? 0), 0) /
    Math.max(1, items.filter((item) => item.review).length);

  const countBy = (values: string[]) =>
    [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

  const qualityFlags = items.flatMap((item) => item.review?.qualityFlags ?? []);
  const qualityChart = countBy(qualityFlags.length ? qualityFlags : ["No reviews yet"]).slice(0, 6);

  return {
    stageCards: [
      { label: "Submitted", value: submitted, helper: "All uploaded clips" },
      { label: "Pending", value: pending, helper: "Needs review" },
      { label: "Accepted", value: accepted, helper: "Reviewed usable" },
      { label: "Rejected", value: rejected, helper: "Reviewed unusable" },
      { label: "Eval eligible", value: eligible, helper: `Avg audio ${avgAudioScore.toFixed(1)}/5` },
    ],
    pipelineChart: [
      { name: "Submitted", value: submitted },
      { name: "Pending", value: pending },
      { name: "Accepted", value: accepted },
      { name: "Rejected", value: rejected },
      { name: "Eligible", value: eligible },
    ],
    languageChart: countBy(items.map((item) => item.prompt?.language ?? "Unknown")),
    qualityChart,
  };
}

function ReviewChart({
  title,
  data,
  xAxisLabel,
  yAxisLabel,
}: {
  title: string;
  data: Array<{ name: string; value: number }>;
  xAxisLabel: string;
  yAxisLabel: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            interval={0}
            angle={-18}
            textAnchor="end"
            height={64}
            tick={{ fontSize: 11 }}
            label={{ value: xAxisLabel, position: "insideBottom", offset: -6 }}
          />
          <YAxis allowDecimals={false} width={52} label={{ value: yAxisLabel, angle: -90, position: "insideLeft" }} />
          <Tooltip />
          <Bar dataKey="value" fill="#28615b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CollapsibleSection({
  title,
  helper,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <details className={`rounded-lg border border-border bg-white p-4 ${className}`} open>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {helper ? <p className="mt-1 text-sm text-zinc-600">{helper}</p> : null}
          </div>
          <span className="text-xs font-medium uppercase text-zinc-500">Collapse</span>
        </div>
      </summary>
      <div className={bodyClassName}>{children}</div>
    </details>
  );
}

function inDateRange(isoDate: string | undefined, dateRange: string) {
  if (!isoDate || dateRange === "all") return true;
  const days = Number(dateRange);
  if (!Number.isFinite(days)) return true;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(isoDate).getTime() >= cutoff;
}

function ScoreInput({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input name={name} type="number" min={1} max={5} defaultValue={defaultValue} />
    </div>
  );
}
