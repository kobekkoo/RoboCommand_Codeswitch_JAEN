import { EvaluationDatasetsView } from "@/components/admin/EvaluationDatasetsView";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { publicSnapshot } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function EvaluationDatasetsPage() {
  await requireAdmin();
  const snapshot = await publicSnapshot();
  return (
    <AdminShell>
      <EvaluationDatasetsView
        recipes={snapshot.recipes}
        prompts={snapshot.prompts}
        recordings={snapshot.recordings}
        reviews={snapshot.reviews}
        sessions={snapshot.sessions}
        datasets={snapshot.evalDatasets}
      />
    </AdminShell>
  );
}
