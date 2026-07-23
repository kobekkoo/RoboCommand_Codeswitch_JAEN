import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { getModelConfigs } from "@/lib/data/repository";
import { modelCatalogEntry, modelProviderLabel } from "@/lib/stt/model-catalog";

export const dynamic = "force-dynamic";

export default async function EvaluationModelsPage() {
  await requireAdmin();
  const models = await getModelConfigs();

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">STT model glossary</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Hosted STT models become available when their server-side keys are configured: `OPENAI_API_KEY`,
            `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, and `DEEPGRAM_API_KEY`.
          </p>
        </div>
        <Link href="/admin/evaluations" className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
          Back to runs
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {models.map((model) => {
          const entry = modelCatalogEntry(model);
          return (
            <Card key={model.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {model.displayName}
                  <Badge tone={entry.isRealProvider ? "blue" : "amber"}>
                    {entry.isRealProvider ? "real API" : "mock"}
                  </Badge>
                  <Badge tone={model.isEnabled ? "green" : "red"}>{model.isEnabled ? "enabled" : "unavailable"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-zinc-700">{entry.details}</p>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-zinc-500">Provider</dt>
                    <dd>{modelProviderLabel(model)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-zinc-500">Model ID</dt>
                    <dd className="font-mono text-xs">{model.modelIdentifier}</dd>
                  </div>
                </dl>
                {entry.externalUrl ? (
                  <Link href={entry.externalUrl} target="_blank" rel="noreferrer" className="inline-flex text-accent hover:text-accent-strong">
                    {entry.externalLabel ?? "Model details"}
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AdminShell>
  );
}
