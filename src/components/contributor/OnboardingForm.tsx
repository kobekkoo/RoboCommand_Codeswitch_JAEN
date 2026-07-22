"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/forms";
import { onboardingSchema } from "@/lib/validators";

type OnboardingValues = z.infer<typeof onboardingSchema>;

const ageBands = ["prefer_not_to_say", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

export function OnboardingForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      primaryLanguage: "English",
      ageBand: "prefer_not_to_say",
      voiceAssistantFamiliarity: "prefer_not_to_say",
      defaultDeviceCategory: "prefer_not_to_say",
      headphonesOrExternalMic: "prefer_not_to_say",
    },
  });

  async function onSubmit(values: OnboardingValues) {
    setServerError(undefined);
    const response = await fetch("/api/contributor/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setServerError(body?.error ?? "Could not save onboarding.");
      return;
    }
    router.push("/collect");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
      <Field
        label="Primary language"
        helper="Useful for measuring whether models handle language groups fairly."
        error={errors.primaryLanguage?.message}
      >
        <Select {...register("primaryLanguage")}>
          <option>English</option>
          <option>Japanese</option>
          <option>English-Japanese</option>
          <option>other</option>
          <option>prefer_not_to_say</option>
        </Select>
      </Field>
      <Field label="Additional languages" helper="Helps interpret code-switching and multilingual recordings.">
        <Input placeholder="Optional" {...register("additionalLanguages")} />
      </Field>
      <Field label="Broad accent or dialect region" helper="Broad labels help evaluate underrepresented speech patterns.">
        <Input placeholder="Optional, broad only" {...register("accentRegion")} />
      </Field>
      <Field label="Age band" helper="Age bands can reveal collection gaps without collecting exact age.">
        <Select {...register("ageBand")}>
          {ageBands.map((band) => (
            <option key={band} value={band}>
              {band.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Familiarity with voice assistants" helper="Prior experience may affect command phrasing.">
        <Select {...register("voiceAssistantFamiliarity")}>
          <option value="none">none</option>
          <option value="occasional">occasional</option>
          <option value="frequent">frequent</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </Select>
      </Field>
      <Field label="Device category" helper="Device class helps analyze microphone and browser behavior.">
        <Select {...register("defaultDeviceCategory")}>
          <option value="phone">phone</option>
          <option value="laptop">laptop</option>
          <option value="tablet">tablet</option>
          <option value="desktop">desktop</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </Select>
      </Field>
      <Field label="Headphones or external microphone" helper="Useful for separating built-in and external audio paths.">
        <Select {...register("headphonesOrExternalMic")}>
          <option value="yes">yes</option>
          <option value="no">no</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </Select>
      </Field>
      {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Continue to collection"}
      </Button>
    </form>
  );
}

function Field({
  label,
  helper,
  error,
  children,
}: {
  label: string;
  helper: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-sm text-zinc-600">{helper}</p>
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
