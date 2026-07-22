"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/forms";
import { PromptEditor } from "@/components/admin/PromptEditor";
import type { CollectionRecipe, CommandPrompt } from "@/lib/domain";

export function RecipeEditForm({ recipe, prompts }: { recipe: CollectionRecipe; prompts: CommandPrompt[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();

  async function save(formData: FormData) {
    setMessage("Saving draft...");
    const response = await fetch("/api/admin/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "update",
        recipeId: recipe.id,
        name: formData.get("name"),
        description: formData.get("description"),
        contributorInstructions: formData.get("contributorInstructions"),
        targetAcceptedRecordings: Number(formData.get("targetAcceptedRecordings")),
        promptsPerSession: Number(formData.get("promptsPerSession")),
        followUpNotes: formData.get("followUpNotes"),
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "Could not save recipe.");
      return;
    }
    setMessage("Saved draft recipe.");
    router.refresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle>Edit recipe draft</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={save} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input name="name" defaultValue={recipe.name} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea name="description" defaultValue={recipe.description} required />
            </div>
            <div className="space-y-2">
              <Label>Contributor instructions</Label>
              <Textarea name="contributorInstructions" defaultValue={recipe.contributorInstructions} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Target accepted recordings</Label>
                <Input name="targetAcceptedRecordings" type="number" min={1} defaultValue={recipe.targetAcceptedRecordings} />
              </div>
              <div className="space-y-2">
                <Label>Prompts per session</Label>
                <Input name="promptsPerSession" type="number" min={1} max={20} defaultValue={recipe.promptsPerSession} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Follow-up notes</Label>
              <Textarea name="followUpNotes" defaultValue={recipe.followUpNotes} placeholder="Why this draft exists and what slices it targets." />
            </div>
            <Button type="submit">Save draft settings</Button>
            {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prompt inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {prompts.map((prompt) => (
            <PromptEditor key={prompt.id} prompt={prompt} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
