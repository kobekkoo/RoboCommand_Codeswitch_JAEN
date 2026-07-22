import { EvaluationScorersView } from "@/components/admin/EvaluationScorersView";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { getScorerConfigs } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function EvaluationScorersPage() {
  await requireAdmin();
  const scorerConfigs = await getScorerConfigs();
  return (
    <AdminShell>
      <EvaluationScorersView scorerConfigs={scorerConfigs} />
    </AdminShell>
  );
}
