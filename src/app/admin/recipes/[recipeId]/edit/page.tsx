import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipeEditForm } from "@/components/admin/RecipeEditForm";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { publicSnapshot } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function RecipeEditPage({ params }: { params: Promise<{ recipeId: string }> }) {
  await requireAdmin();
  const { recipeId } = await params;
  const snapshot = await publicSnapshot();
  const recipe = snapshot.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) notFound();
  const prompts = snapshot.prompts.filter((prompt) => prompt.recipeId === recipe.id).sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{recipe.name}</h1>
          <p className="text-sm text-zinc-600">Review draft settings before activating or exporting this recipe.</p>
        </div>
        <Link href={`/admin/recipes/${recipe.id}/dataset-card`} className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
          Overview
        </Link>
      </div>
      <RecipeEditForm recipe={recipe} prompts={prompts} />
    </AdminShell>
  );
}
