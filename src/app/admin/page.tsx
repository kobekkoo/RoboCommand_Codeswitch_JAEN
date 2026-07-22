import { AdminHomeView } from "@/components/admin/AdminHomeView";
import { AdminShell } from "@/components/ui/shell";
import { publicSnapshot } from "@/lib/data/repository";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const snapshot = await publicSnapshot();

  return (
    <AdminShell>
      <AdminHomeView snapshot={snapshot} />
    </AdminShell>
  );
}
