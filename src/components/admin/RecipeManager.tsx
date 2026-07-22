"use client";

import { type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Copy, FileDown, Plus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/forms";
import { PromptEditor } from "@/components/admin/PromptEditor";
import {
  commandVariants,
  languages,
  promptModes,
  taskTypes,
  type CollectionRecipe,
  type CommandPrompt,
} from "@/lib/domain";

function CollapsibleCard({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardHeader className="p-0">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          <CardTitle>{title}</CardTitle>
          {open ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
        </button>
      </CardHeader>
      {open ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

export function RecipeManager({ recipes, prompts }: { recipes: CollectionRecipe[]; prompts: CommandPrompt[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id ?? "");
  const selectedPrompts = useMemo(
    () => prompts.filter((prompt) => prompt.recipeId === selectedRecipeId).sort((a, b) => a.displayOrder - b.displayOrder),
    [prompts, selectedRecipeId],
  );

  async function action(payload: Record<string, unknown>) {
    setMessage(undefined);
    const response = await fetch("/api/admin/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "Recipe action failed.");
      return false;
    }
    setMessage("Saved.");
    router.refresh();
    return true;
  }

  async function createRecipe(formData: FormData) {
    await action({
      action: "create",
      name: formData.get("name"),
      slug: formData.get("slug"),
      description: formData.get("description"),
      contributorInstructions: formData.get("contributorInstructions"),
      promptsPerSession: Number(formData.get("promptsPerSession")),
      targetAcceptedRecordings: Number(formData.get("targetAcceptedRecordings")),
    });
  }

  async function addPrompt(formData: FormData) {
    await action({
      action: "addPrompt",
      recipeId: selectedRecipeId,
      promptMode: formData.get("promptMode"),
      displayInstruction: formData.get("displayInstruction"),
      exactText: formData.get("exactText"),
      language: formData.get("language"),
      taskType: formData.get("taskType"),
      commandVariant: formData.get("commandVariant"),
      targetIntent: formData.get("targetIntent"),
    });
  }

  async function importJson(formData: FormData) {
    const file = formData.get("jsonFile");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("Choose a JSON file to import.");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage("Could not parse the selected JSON file.");
      return;
    }

    const rows = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { prompts?: unknown }).prompts)
        ? (parsed as { prompts: unknown[] }).prompts
        : [];

    if (rows.length === 0) {
      setMessage("JSON must be an array of prompts or an object with a prompts array.");
      return;
    }

    let imported = 0;
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const ok = await action({ action: "addPrompt", recipeId: selectedRecipeId, ...(row as Record<string, unknown>) });
      if (!ok) return;
      imported += 1;
    }
    setMessage(`Imported ${imported} prompt${imported === 1 ? "" : "s"}.`);
    router.refresh();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="space-y-4">
        <CollapsibleCard title="Create Recipe" defaultOpen={false}>
            <form action={createRecipe} className="space-y-3">
              <Input name="name" placeholder="Recipe name" required />
              <Input name="slug" placeholder="new-recipe-slug" required />
              <Textarea name="description" placeholder="Description" required />
              <Textarea name="contributorInstructions" placeholder="Contributor instructions" required />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="promptsPerSession">Prompts per session</Label>
                  <Input id="promptsPerSession" name="promptsPerSession" type="number" defaultValue={12} min={1} max={20} />
                  <p className="text-xs text-zinc-600">How many recordings one contributor is asked to complete.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetAcceptedRecordings">Target accepted recordings</Label>
                  <Input id="targetAcceptedRecordings" name="targetAcceptedRecordings" type="number" defaultValue={100} min={1} />
                  <p className="text-xs text-zinc-600">Goal for reviewed, accepted recordings in this recipe.</p>
                </div>
              </div>
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Create draft
              </Button>
            </form>
        </CollapsibleCard>
        <CollapsibleCard title="Import Prompts" defaultOpen={false}>
          <div className="space-y-3">
            <form action={importJson} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="jsonFile">JSON prompt file</Label>
                <Input id="jsonFile" name="jsonFile" type="file" accept="application/json,.json" required />
                <p className="text-xs text-zinc-600">
                  Upload a JSON array of prompts, or an object with a <code>prompts</code> array.
                </p>
              </div>
              <Button type="submit" variant="secondary">
                <Upload className="h-4 w-4" />
                Import JSON
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex items-center gap-2 text-sm text-accent" href="/examples/recipe-template.json" download>
                <FileDown className="h-4 w-4" />
                JSON template
              </a>
              <a className="inline-flex items-center gap-2 text-sm text-accent" href="/examples/robot-cs-household-en-ja-v1.json" download>
                <FileDown className="h-4 w-4" />
                RobotCS prompt pack
              </a>
            </div>
          </div>
        </CollapsibleCard>
      </section>

      <section className="space-y-4">
        <CollapsibleCard title="Existing Recipes">
          <div className="space-y-4">
            <Select value={selectedRecipeId} onChange={(event) => setSelectedRecipeId(event.target.value)}>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name} v{recipe.version}
                </option>
              ))}
            </Select>
            <div className="grid gap-3">
              {recipes.map((recipe) => (
                <div key={recipe.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{recipe.name}</h3>
                      <p className="mt-1 text-sm text-zinc-600">
                        v{recipe.version} · {recipe.slug}
                      </p>
                    </div>
                    <Badge tone={recipe.status === "active" ? "green" : recipe.status === "archived" ? "amber" : "neutral"}>
                      {recipe.status}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-700">{recipe.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/admin/recipes/${recipe.id}/dataset-card`}
                      className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted"
                    >
                      Overview
                    </Link>
                    <Link
                      href={`/admin/recipes/${recipe.id}/edit`}
                      className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted"
                    >
                      Edit
                    </Link>
                    <Button type="button" size="sm" variant="secondary" onClick={() => action({ action: "clone", recipeId: recipe.id })}>
                      <Copy className="h-4 w-4" />
                      Clone
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => action({ action: "activate", recipeId: recipe.id })}>
                      Activate
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => action({ action: "archive", recipeId: recipe.id })}>
                      Archive
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard title="Prompts for Selected Recipe">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="promptRecipeSelect">Selected recipe</Label>
              <Select
                id="promptRecipeSelect"
                value={selectedRecipeId}
                onChange={(event) => setSelectedRecipeId(event.target.value)}
              >
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name} v{recipe.version}
                  </option>
                ))}
              </Select>
            </div>
            <form action={addPrompt} className="grid gap-3 rounded-lg border border-border bg-muted p-3">
              <Label>Add prompt</Label>
              <Select name="promptMode" defaultValue="read_exactly">
                {promptModes.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </Select>
              <Textarea name="displayInstruction" placeholder="Contributor-facing instruction" required />
              <Input name="exactText" placeholder="Exact text, if applicable" />
              <div className="grid gap-3 md:grid-cols-3">
                <Select name="language" defaultValue="English">
                  {languages.map((language) => (
                    <option key={language}>{language}</option>
                  ))}
                </Select>
                <Select name="taskType" defaultValue="Pick up">
                  {taskTypes.map((taskType) => (
                    <option key={taskType}>{taskType}</option>
                  ))}
                </Select>
                <Select name="commandVariant" defaultValue="Canonical">
                  {commandVariants.map((variant) => (
                    <option key={variant}>{variant}</option>
                  ))}
                </Select>
              </div>
              <Input name="targetIntent" placeholder="target_intent" required />
              <Button type="submit" size="sm">
                Add prompt
              </Button>
            </form>
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {selectedPrompts.map((prompt) => (
                <PromptEditor key={prompt.id} prompt={prompt} />
              ))}
            </div>
            {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
          </div>
        </CollapsibleCard>
      </section>
    </div>
  );
}
