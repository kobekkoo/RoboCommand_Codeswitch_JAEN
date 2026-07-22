import { notFound } from "next/navigation";
import { SessionSetupForm } from "@/components/contributor/SessionSetupForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicShell } from "@/components/ui/shell";
import { getRecipeBySlug } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params }: { params: Promise<{ recipeSlug: string }> }) {
  const { recipeSlug } = await params;
  const recipe = await getRecipeBySlug(recipeSlug);
  if (!recipe) notFound();

  return (
    <PublicShell compact>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">{recipe.name}</h1>
          <p className="mt-3 text-zinc-700">{recipe.contributorInstructions}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Session conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionSetupForm recipeSlug={recipe.slug} />
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}
