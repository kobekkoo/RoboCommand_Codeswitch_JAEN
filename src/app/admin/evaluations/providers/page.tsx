import Link from "next/link";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getModelConfigs } from "@/lib/data/repository";
import type { SttProviderId } from "@/lib/domain";

export const dynamic = "force-dynamic";

const providerRows: Array<{
  id: Exclude<SttProviderId, "mock">;
  name: string;
  envKey: string;
  description: string;
  setupHref?: string;
}> = [
  {
    id: "openai",
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    description: "Enables GPT-4o Transcribe, GPT-4o mini Transcribe, Whisper, and Command Fidelity Judge scorers.",
    setupHref: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Gemini",
    envKey: "GEMINI_API_KEY",
    description: "Enables Gemini audio-understanding models for multilingual STT comparisons.",
    setupHref: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    envKey: "ELEVENLABS_API_KEY",
    description: "Enables Scribe STT models for hosted speech-to-text comparison.",
    setupHref: "https://elevenlabs.io/app/settings/api-keys",
  },
  {
    id: "deepgram",
    name: "Deepgram",
    envKey: "DEEPGRAM_API_KEY",
    description: "Enables Nova STT models for paper-comparable multilingual benchmarks.",
    setupHref: "https://console.deepgram.com/project/keys",
  },
];

export default async function EvaluationProvidersPage() {
  await requireAdmin();
  const env = getEnv();
  const models = await getModelConfigs();
  const modelCounts = new Map<SttProviderId, number>();
  models.forEach((model) => modelCounts.set(model.provider, (modelCounts.get(model.provider) ?? 0) + 1));

  const configured: Record<Exclude<SttProviderId, "mock">, boolean> = {
    openai: Boolean(env.OPENAI_API_KEY),
    gemini: Boolean(env.GEMINI_API_KEY),
    elevenlabs: Boolean(env.ELEVENLABS_API_KEY),
    deepgram: Boolean(env.DEEPGRAM_API_KEY),
  };

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">AI Providers</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Provider secrets live in `.env.local` locally and in Vercel environment variables for hosted deployments. This page only shows whether
            the server can see each key.
          </p>
        </div>
        <Link href="/admin/evaluations/models" className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
          View model glossary
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            STT provider keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-normal text-zinc-600">
                <tr>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Env var</th>
                  <th className="px-3 py-2">Models</th>
                  <th className="px-3 py-2">Use in CommandLoop</th>
                  <th className="px-3 py-2">Setup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {providerRows.map((provider) => {
                  const isConfigured = configured[provider.id];
                  return (
                    <tr key={provider.id}>
                      <td className="px-3 py-3 font-medium">{provider.name}</td>
                      <td className="px-3 py-3">
                        <Badge tone={isConfigured ? "green" : "red"}>
                          {isConfigured ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {isConfigured ? "configured" : "missing"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{provider.envKey}</td>
                      <td className="px-3 py-3">{modelCounts.get(provider.id) ?? 0}</td>
                      <td className="max-w-lg px-3 py-3 text-zinc-700">{provider.description}</td>
                      <td className="px-3 py-3">
                        {provider.setupHref ? (
                          <Link href={provider.setupHref} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-strong">
                            Key page
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
