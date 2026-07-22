import { EvaluationRunner } from "@/components/admin/EvaluationRunner";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { acceptedRecordingsForEvaluation, getModelConfigs, publicSnapshot } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function EvaluationsPage() {
  await requireAdmin();
  const snapshot = await publicSnapshot();
  const models = await getModelConfigs();
  const acceptedRecordings = await acceptedRecordingsForEvaluation();
  return (
    <AdminShell>
      <EvaluationRunner
        recipes={snapshot.recipes}
        modelConfigs={models}
        runs={snapshot.evaluationRuns}
        datasets={snapshot.evalDatasets}
        scorerConfigs={snapshot.scorerConfigs}
        experimentSnapshots={snapshot.experimentSnapshots}
        acceptedCount={acceptedRecordings.length}
      />
    </AdminShell>
  );
}
