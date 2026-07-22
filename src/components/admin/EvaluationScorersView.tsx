"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { ScorerConfigModal } from "@/components/admin/ScorerConfigModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScorerConfig, ScorerType } from "@/lib/domain";

const scorerTypeLabels: Record<ScorerType, string> = {
  deterministic: "Deterministic",
  llm_judge: "LLM judge",
  human_review: "Human review",
};

export function EvaluationScorersView({ scorerConfigs }: { scorerConfigs: ScorerConfig[] }) {
  const [modalScorer, setModalScorer] = useState<ScorerConfig | undefined>();
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState<string>();
  const enabledCount = useMemo(() => scorerConfigs.filter((scorer) => scorer.isEnabled).length, [scorerConfigs]);

  function openCreate() {
    setModalScorer(undefined);
    setShowModal(true);
  }

  function openEdit(scorer: ScorerConfig) {
    setModalScorer(scorer);
    setShowModal(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Scorers</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Build reusable scoring configs for transcript accuracy, linguistic diversity, command fidelity, and human-review validation.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create scorer
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Enabled scorers" value={enabledCount} />
        <StatCard label="LLM judges" value={scorerConfigs.filter((scorer) => scorer.scorerType === "llm_judge").length} />
        <StatCard label="Deterministic scorers" value={scorerConfigs.filter((scorer) => scorer.scorerType === "deterministic").length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Scorer library
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-normal text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Metrics</th>
                  <th className="px-3 py-2">Threshold</th>
                  <th className="px-3 py-2">Choice scores</th>
                  <th className="px-3 py-2">CoT</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {scorerConfigs.map((scorer) => (
                  <tr key={scorer.id} className="align-top">
                    <td className="max-w-sm px-3 py-3">
                      <p className="font-medium">{scorer.name}</p>
                      <p className="mt-1 text-xs text-zinc-600">{scorer.description}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={scorer.scorerType === "llm_judge" ? "blue" : scorer.scorerType === "human_review" ? "amber" : "green"}>
                        {scorerTypeLabels[scorer.scorerType]}
                      </Badge>
                    </td>
                    <td className="max-w-lg px-3 py-3 text-xs text-zinc-600">{scorer.metricKeys.join(", ")}</td>
                    <td className="px-3 py-3">{thresholdLabel(scorer.thresholdsJson)}</td>
                    <td className="px-3 py-3">{choiceScoreCount(scorer.thresholdsJson)}</td>
                    <td className="px-3 py-3">{Boolean(scorer.thresholdsJson.useChainOfThought) ? "On" : "Off"}</td>
                    <td className="px-3 py-3">
                      <Badge tone={scorer.isEnabled ? "green" : "red"}>{scorer.isEnabled ? "enabled" : "disabled"}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(scorer)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {scorerConfigs.length === 0 ? <p className="mt-3 text-sm text-zinc-600">No scorers have been created yet.</p> : null}
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-zinc-700">{message}</p> : null}

      {showModal ? (
        <ScorerConfigModal
          scorer={modalScorer}
          onClose={() => setShowModal(false)}
          onSaved={(savedScorer) => setMessage(`${savedScorer.name} saved.`)}
        />
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-normal text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function thresholdLabel(value: Record<string, unknown>) {
  const threshold = value.passThreshold;
  return typeof threshold === "number" ? threshold.toFixed(2) : "-";
}

function choiceScoreCount(value: Record<string, unknown>) {
  const choices = value.choiceScores;
  if (!Array.isArray(choices) || choices.length === 0) return "-";
  return `${choices.length} choices`;
}
