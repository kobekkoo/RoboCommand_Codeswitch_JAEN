import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicShell } from "@/components/ui/shell";
import { getActiveRecipes } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function CollectPage() {
  const recipes = await getActiveRecipes();
  if (recipes.length === 1) redirect(`/collect/${recipes[0]!.slug}/setup`);

  return (
    <PublicShell>
      <div className="space-y-5">
        <h1 className="text-3xl font-semibold">Choose a collection recipe</h1>
        <div className="grid gap-4 md:grid-cols-2">
          {recipes.map((recipe) => (
            <Link key={recipe.id} href={`/collect/${recipe.slug}/setup`}>
              <Card className="h-full transition hover:border-accent">
                <CardHeader>
                  <CardTitle>{recipe.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-zinc-700">{recipe.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {recipe.supportedLanguages.map((language) => (
                      <Badge key={language}>{language}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
