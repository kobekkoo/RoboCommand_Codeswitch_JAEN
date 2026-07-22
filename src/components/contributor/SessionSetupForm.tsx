"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/forms";
import { environmentTypes, microphoneDistances } from "@/lib/domain";
import { sessionSetupSchema } from "@/lib/validators";

type SetupValues = z.infer<typeof sessionSetupSchema>;

export function SessionSetupForm({ recipeSlug }: { recipeSlug: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SetupValues>({
    resolver: zodResolver(sessionSetupSchema),
    defaultValues: {
      recipeSlug,
      environmentType: "Indoor, quiet",
      microphoneDistance: "Near: under 30 cm",
      expectedInterruptions: false,
      deviceMetadataJson: {},
    },
  });

  async function onSubmit(values: SetupValues) {
    setServerError(undefined);
    const response = await fetch("/api/sessions/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = (await response.json().catch(() => null)) as { sessionId?: string; error?: string } | null;
    if (!response.ok || !body?.sessionId) {
      setServerError(body?.error ?? "Could not start a session.");
      return;
    }
    router.push(`/collect/${recipeSlug}/mic-check?sessionId=${body.sessionId}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <input type="hidden" {...register("recipeSlug")} />
      <div className="space-y-2">
        <Label>Environment</Label>
        <Select {...register("environmentType")}>
          {environmentTypes.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </Select>
        <p className="text-sm text-zinc-600">
          If the room or outdoor area is noisy, keep that condition. The label is part of the data.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Background-noise source</Label>
        <Input placeholder="Fan, traffic, TV, conversation, none..." {...register("backgroundNoise")} />
      </div>
      <div className="space-y-2">
        <Label>Microphone distance</Label>
        <Select {...register("microphoneDistance")}>
          {microphoneDistances.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Device orientation or placement</Label>
        <Textarea placeholder="Phone in hand, laptop on desk, tablet on counter..." {...register("deviceCategory")} />
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4" {...register("expectedInterruptions")} />
        <span>I expect interruptions during this session.</span>
      </label>
      {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Starting..." : "Continue to microphone check"}
      </Button>
    </form>
  );
}
