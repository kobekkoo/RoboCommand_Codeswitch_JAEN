import { ReviewQueue } from "@/components/admin/ReviewQueue";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { getReviewQueue } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  await requireAdmin();
  const items = await getReviewQueue();
  return (
    <AdminShell>
      <ReviewQueue items={items} />
    </AdminShell>
  );
}
