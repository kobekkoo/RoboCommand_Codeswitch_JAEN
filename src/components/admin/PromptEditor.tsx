"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/forms";
import {
  commandVariants,
  languages,
  promptModes,
  taskTypes,
  type CommandPrompt,
} from "@/lib/domain";

export function PromptEditor({ prompt }: { prompt: CommandPrompt }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string>();

  async function save(formData: FormData) {
    setMessage("Saving prompt...");
    const response = await fetch("/api/admin/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "updatePrompt",
        promptId: prompt.id,
        promptMode: formData.get("promptMode"),
        displayInstruction: formData.get("displayInstruction"),
        exactText: formData.get("exactText"),
        language: formData.get("language"),
        taskType: formData.get("taskType"),
        commandVariant: formData.get("commandVariant"),
        targetIntent: formData.get("targetIntent"),
      }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "Could not save prompt.");
      return;
    }
    setEditing(false);
    setMessage("Saved prompt.");
    router.refresh();
  }

  if (editing) {
    return (
      <form action={save} className="rounded-md border border-border bg-muted p-3 text-sm">
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Prompt mode</Label>
              <Select name="promptMode" defaultValue={prompt.promptMode}>
                {promptModes.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select name="language" defaultValue={prompt.language}>
                {languages.map((language) => (
                  <option key={language}>{language}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Contributor-facing prompt</Label>
            <Textarea name="displayInstruction" defaultValue={prompt.displayInstruction} required />
          </div>
          <div className="space-y-2">
            <Label>Exact text</Label>
            <Input name="exactText" defaultValue={prompt.exactText ?? ""} placeholder="Optional canonical phrase" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Task type</Label>
              <Select name="taskType" defaultValue={prompt.taskType}>
                {taskTypes.map((taskType) => (
                  <option key={taskType}>{taskType}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Command variant</Label>
              <Select name="commandVariant" defaultValue={prompt.commandVariant}>
                {commandVariants.map((variant) => (
                  <option key={variant}>{variant}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Target intent</Label>
            <Input name="targetIntent" defaultValue={prompt.targetIntent} required />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              <Save className="h-4 w-4" />
              Save prompt
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
          {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-md border border-border bg-white p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge>{prompt.language}</Badge>
          <Badge>{prompt.commandVariant}</Badge>
          <Badge>{prompt.taskType}</Badge>
          {!prompt.isActive ? <Badge tone="amber">inactive</Badge> : null}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
          <Edit3 className="h-4 w-4" />
          Edit
        </Button>
      </div>
      <p className="mt-2 font-medium">{prompt.displayInstruction}</p>
      {prompt.exactText ? <p className="mt-1 text-zinc-700">{prompt.exactText}</p> : null}
      <p className="mt-2 text-xs text-zinc-500">Intent: {prompt.targetIntent}</p>
      {message ? <p className="mt-2 text-sm text-zinc-700">{message}</p> : null}
    </div>
  );
}
