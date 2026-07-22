"use client";

import type * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/forms";
import type { ScorerConfig, ScorerType } from "@/lib/domain";

type ChoiceScore = {
  choice: string;
  label: string;
  score: string;
};

const metricOptions = [
  { key: "word_error_rate", label: "WER" },
  { key: "character_error_rate", label: "CER" },
  { key: "mixed_error_rate", label: "MER" },
  { key: "exact_match", label: "Exact match" },
  { key: "overgeneration_rate", label: "Overgeneration" },
  { key: "semantic_risk", label: "Semantic risk" },
  { key: "command_fidelity", label: "Command fidelity" },
  { key: "reviewer_validation", label: "Human review validation" },
  { key: "latency_ms", label: "Latency" },
  { key: "failure_rate", label: "Failure rate" },
];

const defaultMetricKeys = ["word_error_rate", "character_error_rate", "mixed_error_rate", "overgeneration_rate", "semantic_risk"];

const defaultRubric = `You are scoring speech-to-text output for robotics command data.

Instruction: {{instruction}}
Human transcript: {{human_transcript}}
Model transcript: {{model_transcript}}
Language: {{language}}
Tags: {{tags}}
Metadata: {{metadata}}

Return a 0-1 score and concise user-facing rationale. Penalize action, object, direction, negation, or safety-sensitive meaning changes.`;

export function ScorerConfigModal({
  scorer,
  onClose,
  onSaved,
}: {
  scorer?: ScorerConfig;
  onClose: () => void;
  onSaved?: (scorer: ScorerConfig) => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(scorer?.name ?? "");
  const [slug, setSlug] = useState(
    scorer?.slug ?? (typeof scorer?.thresholdsJson.slug === "string" ? scorer.thresholdsJson.slug : ""),
  );
  const [scorerType, setScorerType] = useState<ScorerType>(scorer?.scorerType ?? "llm_judge");
  const [description, setDescription] = useState(scorer?.description ?? "");
  const [judgeModel, setJudgeModel] = useState(scorer?.judgeModel ?? "");
  const [rubricText, setRubricText] = useState(scorer?.rubricText ?? defaultRubric);
  const [outputType, setOutputType] = useState(typeof scorer?.thresholdsJson.outputType === "string" ? scorer.thresholdsJson.outputType : "score");
  const [passThreshold, setPassThreshold] = useState(
    typeof scorer?.thresholdsJson.passThreshold === "number" ? String(scorer.thresholdsJson.passThreshold) : "0.8",
  );
  const [isEnabled, setIsEnabled] = useState(scorer?.isEnabled ?? true);
  const [useChainOfThought, setUseChainOfThought] = useState(Boolean(scorer?.thresholdsJson.useChainOfThought));
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<Set<string>>(() => new Set(scorer?.metricKeys.length ? scorer.metricKeys : defaultMetricKeys));
  const [choiceScores, setChoiceScores] = useState<ChoiceScore[]>(() => {
    const existing = scorer?.thresholdsJson.choiceScores;
    if (Array.isArray(existing) && existing.length) {
      return existing.map((item) => {
        const candidate = item as Partial<{ choice: string; label: string; score: number | string }>;
        return {
          choice: String(candidate.choice ?? ""),
          label: String(candidate.label ?? ""),
          score: String(candidate.score ?? ""),
        };
      });
    }
    return [
      { choice: "A", label: "Strong preservation", score: "1" },
      { choice: "B", label: "Minor wording issue", score: "0.5" },
      { choice: "C", label: "Meaning changed", score: "0" },
    ];
  });

  const title = scorer ? "Edit scorer" : "Create scorer";
  const cleanSlug = useMemo(() => slugify(slug || name), [name, slug]);

  async function saveScorer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    if (!selectedMetricKeys.size) {
      setMessage("Select at least one metric key.");
      return;
    }
    const threshold = Number(passThreshold);
    const payload = {
      ...(scorer ? { scorerId: scorer.id } : {}),
      name,
      scorerType,
      description,
      metricKeys: [...selectedMetricKeys],
      rubricText,
      judgeModel,
      thresholdsJson: {
        ...(scorer?.thresholdsJson ?? {}),
        slug: cleanSlug,
        outputType,
        passThreshold: Number.isFinite(threshold) ? threshold : 0.8,
        includeRationale: true,
        useChainOfThought,
        choiceScores: choiceScores
          .map((item) => ({
            choice: item.choice.trim(),
            label: item.label.trim(),
            score: Number(item.score),
          }))
          .filter((item) => item.choice && Number.isFinite(item.score)),
        variables: ["{{instruction}}", "{{human_transcript}}", "{{model_transcript}}", "{{language}}", "{{tags}}", "{{metadata}}"],
      },
      isEnabled,
    };
    setSaving(true);
    const response = await fetch("/api/admin/evaluations/scorers", {
      method: scorer ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { scorer?: ScorerConfig; error?: string } | null;
    setSaving(false);
    if (!response.ok || !body?.scorer) {
      setMessage(body?.error ?? "Could not save scorer.");
      return;
    }
    onSaved?.(body.scorer);
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
      <form onSubmit={saveScorer} className="w-full max-w-4xl rounded-lg border border-border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-zinc-600">Define the scoring rubric and output contract used in Playground and experiments.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scorerName">Name</Label>
                <Input id="scorerName" value={name} onChange={(event) => setName(event.target.value)} placeholder="Command Fidelity Judge" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scorerSlug">Slug</Label>
                <Input id="scorerSlug" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={slugify(name) || "command-fidelity-judge"} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={scorerType} onChange={(event) => setScorerType(event.target.value as ScorerType)}>
                <option value="deterministic">Deterministic</option>
                <option value="llm_judge">LLM judge</option>
                <option value="human_review">Human review hook</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scorerDescription">Description</Label>
              <Textarea
                id="scorerDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Scores whether action, object, direction, negation, and safety meaning are preserved."
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Metric keys</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {metricOptions.map((metric) => (
                  <label key={metric.key} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedMetricKeys.has(metric.key)}
                      onChange={(event) => {
                        const next = new Set(selectedMetricKeys);
                        if (event.target.checked) next.add(metric.key);
                        else next.delete(metric.key);
                        setSelectedMetricKeys(next);
                      }}
                    />
                    {metric.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="judgeModel">Judge model</Label>
                <Input id="judgeModel" value={judgeModel} onChange={(event) => setJudgeModel(event.target.value)} placeholder="gpt-4o-mini" />
              </div>
              <div className="space-y-2">
                <Label>Output type</Label>
                <Select value={outputType} onChange={(event) => setOutputType(event.target.value)}>
                  <option value="score">Score 0-1</option>
                  <option value="choice_score">Choice score</option>
                </Select>
                <p className="text-xs text-zinc-500">This scorer outputs a number score from 0 to 1.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rubricText">Rubric prompt</Label>
              <Textarea id="rubricText" value={rubricText} onChange={(event) => setRubricText(event.target.value)} className="min-h-52 font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label>Choice scores</Label>
              <p className="text-xs text-zinc-500">Choice scores are required for LLM judge scorers and must be unique.</p>
              <div className="space-y-2">
                {choiceScores.map((choice, index) => (
                  <div key={index} className="grid grid-cols-[56px_1fr_80px_40px] gap-2">
                    <Input value={choice.choice} onChange={(event) => updateChoice(index, "choice", event.target.value, setChoiceScores)} />
                    <Input value={choice.label} onChange={(event) => updateChoice(index, "label", event.target.value, setChoiceScores)} />
                    <Input value={choice.score} onChange={(event) => updateChoice(index, "score", event.target.value, setChoiceScores)} />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setChoiceScores((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label="Remove choice score"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setChoiceScores((current) => [...current, { choice: "", label: "", score: "0" }])}>
                <Plus className="h-4 w-4" />
                Add choice score
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <input type="checkbox" checked={useChainOfThought} onChange={(event) => setUseChainOfThought(event.target.checked)} />
                <span>
                  Use Chain of Thought (CoT)
                  <span className="block text-xs text-zinc-500">Stores concise scorer rationale; private reasoning is not exposed.</span>
                </span>
              </label>
              <div className="space-y-2">
                <Label htmlFor="passThreshold">Pass threshold</Label>
                <Input id="passThreshold" type="number" min={0} max={1} step={0.05} value={passThreshold} onChange={(event) => setPassThreshold(event.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
              Enabled in Playground picker
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="flex items-center gap-2 text-sm text-zinc-600">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Variables are stored with the scorer config and reused in Playground traces.
          </p>
          {message ? <p className="text-sm text-amber-800">{message}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !selectedMetricKeys.size}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save scorer"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function updateChoice(
  index: number,
  field: "choice" | "label" | "score",
  value: string,
  setChoiceScores: React.Dispatch<React.SetStateAction<ChoiceScore[]>>,
) {
  setChoiceScores((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
