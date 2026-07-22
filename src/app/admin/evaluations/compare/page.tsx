import { ExperimentCompareView } from "@/components/admin/ExperimentCompareView";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { publicSnapshot } from "@/lib/data/repository";
import { getEvaluationReport } from "@/lib/stt/evaluation";

export const dynamic = "force-dynamic";

export default async function EvaluationComparePage({
  searchParams,
}: {
  searchParams: Promise<{ baseline?: string; candidate?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const snapshot = await publicSnapshot();
  const runs = [...snapshot.evaluationRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const baselineId = params.baseline ?? runs[1]?.id ?? runs[0]?.id;
  const candidateId = params.candidate ?? runs[0]?.id;
  const [baselineReport, candidateReport] = await Promise.all([
    baselineId ? getEvaluationReport(baselineId) : undefined,
    candidateId ? getEvaluationReport(candidateId) : undefined,
  ]);

  return (
    <AdminShell>
      <ExperimentCompareView
        runs={runs}
        baselineId={baselineId}
        candidateId={candidateId}
        baselineReport={baselineReport}
        candidateReport={candidateReport}
      />
    </AdminShell>
  );
}
