import { EvaluationPlaygroundView } from "@/components/admin/EvaluationPlaygroundView";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { getModelConfigs, publicSnapshot } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function EvaluationPlaygroundPage() {
  await requireAdmin();
  const snapshot = await publicSnapshot();
  const models = await getModelConfigs();
  return (
    <AdminShell>
      <EvaluationPlaygroundView
        datasets={snapshot.evalDatasets}
        modelConfigs={models}
        scorerConfigs={snapshot.scorerConfigs}
        playgroundSessions={snapshot.playgroundSessions}
      />
    </AdminShell>
  );
}
