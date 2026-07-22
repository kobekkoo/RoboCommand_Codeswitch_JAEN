import { FlywheelPanel } from "@/components/admin/FlywheelPanel";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { publicSnapshot } from "@/lib/data/repository";
import { generateCollectionPriorities } from "@/lib/stt/evaluation";

export const dynamic = "force-dynamic";

export default async function FlywheelPage() {
  await requireAdmin();
  const snapshot = await publicSnapshot();
  const priorities = await generateCollectionPriorities();
  return (
    <AdminShell>
      <FlywheelPanel priorities={priorities} recipes={snapshot.recipes} />
    </AdminShell>
  );
}
