import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const metricDefinitions = [
  {
    metric: "WER",
    name: "Word error rate",
    definition: "Word-level edit distance divided by the human reference word count. Lower is better.",
  },
  {
    metric: "CER",
    name: "Character error rate",
    definition: "Character-level edit distance divided by the human reference character count. Useful for Japanese and mixed-language text.",
  },
  {
    metric: "MER",
    name: "Mixed error rate",
    definition: "A mixed English-word and CJK-token error rate for code-switched commands. Lower is better.",
  },
  {
    metric: "Exact match",
    name: "Exact normalized match",
    definition: "Whether the normalized model transcript exactly matches the normalized human reference.",
  },
  {
    metric: "Overgeneration",
    name: "Extra speech risk",
    definition: "Inserted tokens divided by reference length. High values can indicate hallucinated or completed speech.",
  },
  {
    metric: "Semantic risk",
    name: "Meaning-changing edit flags",
    definition: "Flags edits that may change action, object, direction, negation, number, or safety-sensitive meaning.",
  },
  {
    metric: "Latency",
    name: "Provider response time",
    definition: "Time from provider request to transcript response. Lower is better when quality is comparable.",
  },
];

export default async function EvaluationMetricsGlossaryPage() {
  await requireAdmin();

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Evaluation metric glossary</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Definitions for the transcript core metrics used in Playground and experiment comparison.
          </p>
        </div>
        <Link href="/admin/evaluations/playground" className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
          Back to playground
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {metricDefinitions.map((item) => (
          <Card key={item.metric}>
            <CardHeader>
              <CardTitle>{item.metric}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{item.name}</p>
              <p className="text-zinc-700">{item.definition}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
