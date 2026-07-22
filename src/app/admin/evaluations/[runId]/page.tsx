import { notFound } from "next/navigation";
import { ExperimentDetailView } from "@/components/admin/ExperimentDetailView";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { publicSnapshot } from "@/lib/data/repository";
import { getEvaluationReport } from "@/lib/stt/evaluation";

export const dynamic = "force-dynamic";

export default async function EvaluationRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ compare?: string }>;
}) {
  await requireAdmin();
  const { runId } = await params;
  const { compare } = await searchParams;
  const snapshot = await publicSnapshot();
  const [report, comparisonReport] = await Promise.all([
    getEvaluationReport(runId),
    compare && compare !== runId ? getEvaluationReport(compare) : undefined,
  ]);
  if (!report) notFound();

  return (
    <AdminShell>
      <ExperimentDetailView
        report={report}
        runs={snapshot.evaluationRuns}
        comparisonReport={comparisonReport}
        comparisonRunId={comparisonReport?.run.id}
      />
    </AdminShell>
  );
}
