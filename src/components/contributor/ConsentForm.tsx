"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { consentSchema } from "@/lib/validators";

type ConsentFormValues = z.infer<typeof consentSchema>;

export function ConsentForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConsentFormValues>({
    resolver: zodResolver(consentSchema),
    defaultValues: { accepted: false },
  });

  async function onSubmit(values: ConsentFormValues) {
    setServerError(undefined);
    const response = await fetch("/api/contributor/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setServerError(body?.error ?? "Could not record consent.");
      return;
    }
    router.push("/onboarding");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 text-sm leading-6">
        <input type="checkbox" className="mt-1 h-4 w-4" {...register("accepted")} />
        <span>
          I understand this is a prototype consent flow, participation is voluntary, and I should not record private
          personal information.
        </span>
      </label>
      {errors.accepted ? <p className="text-sm text-danger">{errors.accepted.message}</p> : null}
      {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
