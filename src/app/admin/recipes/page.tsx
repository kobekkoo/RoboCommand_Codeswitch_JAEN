import { RecipeManager } from "@/components/admin/RecipeManager";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { publicSnapshot } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  await requireAdmin();
  const snapshot = await publicSnapshot();

  return (
    <AdminShell>
      <RecipeManager recipes={snapshot.recipes} prompts={snapshot.prompts} />
    </AdminShell>
  );
}
