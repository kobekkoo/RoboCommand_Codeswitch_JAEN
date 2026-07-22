import Link from "next/link";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const definitions = [
  {
    term: "Samples",
    detail:
      "Distinct recordings represented by a slice. Counts below 10 are labeled as limited sample because the signal can swing heavily after just a few more recordings.",
  },
  {
    term: "WER",
    detail:
      "Mean word error rate for evaluated rows in the slice. It is calculated from substitutions, insertions, and deletions divided by the human manual transcript word count.",
  },
  {
    term: "Command accuracy",
    detail:
      "Average reviewer command-compliance score scaled to a percentage when review scores exist. It reflects whether the submitted clip followed the command request.",
  },
  {
    term: "Intent accuracy",
    detail:
      "Share of rows where the reviewed semantic intent matches the prompt target intent. It only appears when semantic annotations are available.",
  },
  {
    term: "Failure rate",
    detail:
      "Share of rows in the slice that failed processing, crossed high WER/CER thresholds, or were classified as severe action, negation, safety, or false-actionable failures.",
  },
  {
    term: "Severe failures",
    detail:
      "Count of severity-3 rows. Severity 3 means action, negation, safety-sensitive, or false-actionable behavior that could mislead a robot-command system.",
  },
  {
    term: "Severity",
    detail:
      "Highest severity weight observed in the slice. Severity 1 is a mostly harmless transcript error, 2 is object, location, number, or direction confusion, and 3 is action, negation, safety, or false-actionable behavior.",
  },
  {
    term: "False actionable",
    detail:
      "Invalid input whose transcript still contains a robot action such as pick up, move, walk, open, close, stop, turn, place, pour, clean, search, hand over, or supported Japanese equivalents.",
  },
  {
    term: "Priority",
    detail:
      "Collection priority score. The rule is failure_rate x severity_weight x coverage_gap_weight, where coverage gap increases priority below the target sample count.",
  },
  {
    term: "Recommended",
    detail:
      "Suggested number of additional recordings to collect for the slice. Higher severity slices receive a larger target coverage recommendation.",
  },
];

export default async function FlywheelGlossaryPage() {
  await requireAdmin();

  return (
    <AdminShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Flywheel metric glossary</h1>
            <p className="text-sm text-zinc-600">Definitions for the Next Collection Priorities table.</p>
          </div>
          <Link href="/admin/flywheel" className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
            Back to Flywheel
          </Link>
        </div>

        <section className="grid gap-3 md:grid-cols-2">
          {definitions.map((definition) => (
            <div key={definition.term} className="rounded-lg border border-border bg-white p-4">
              <h2 className="text-base font-semibold">{definition.term}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-700">{definition.detail}</p>
            </div>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
