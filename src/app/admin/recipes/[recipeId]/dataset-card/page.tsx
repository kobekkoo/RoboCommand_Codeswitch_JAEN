import Link from "next/link";
import type React from "react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminShell } from "@/components/ui/shell";
import { requireAdmin } from "@/lib/auth";
import { buildDatasetPackage } from "@/lib/data/dataset-package";

export const dynamic = "force-dynamic";

export default async function DatasetCardPage({ params }: { params: Promise<{ recipeId: string }> }) {
  await requireAdmin();
  const { recipeId } = await params;
  const pkg = await buildDatasetPackage(recipeId).catch(() => undefined);
  if (!pkg) notFound();
  const card = pkg.datasetCard;

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dataset card: {card.name}</h1>
          <p className="text-sm text-zinc-600">Release readiness, coverage, governance, and export package for this recipe.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/recipes/${card.id}/edit`} className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted">
            Edit
          </Link>
          <Link
            href={`/api/admin/export/dataset-package?recipeId=${card.id}`}
            className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-muted"
          >
            Export package
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6">
              <p>{card.description}</p>
              <p>
                <strong>Use case:</strong> {card.useCase}
              </p>
              <p>
                <strong>Contributor instructions:</strong> {card.contributorInstructions}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge>{card.status}</Badge>
                <Badge>v{card.version}</Badge>
                {card.supportedLanguages.map((language) => (
                  <Badge key={language}>{language}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Known limitations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
                {card.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Coverage</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <CoverageList title="Languages" rows={card.coverage.byLanguage} />
              <CoverageList title="Task types" rows={card.coverage.byTaskType.slice(0, 8)} />
              <CoverageList title="Environments" rows={card.coverage.byEnvironment.slice(0, 8)} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Release readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Readiness label="Accepted" value={`${card.releaseReadiness.acceptedRecordings}/${card.releaseReadiness.targetAcceptedRecordings}`} />
              <Readiness label="Coverage" value={`${card.releaseReadiness.coveragePercent}%`} />
              <Readiness label="Pending review" value={card.releaseReadiness.pendingReview} />
              <Readiness label="Rejected" value={card.releaseReadiness.rejectedRecordings} />
              <Readiness label="Prompts" value={card.releaseReadiness.promptCount} />
              <Readiness label="Quotas" value={card.releaseReadiness.quotaCount} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Package contents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-700">
              <p>Manifest rows: {pkg.manifest.length}</p>
              <p>Train examples: {pkg.splits.train.length}</p>
              <p>Validation examples: {pkg.splits.validation.length}</p>
              <p>Test examples: {pkg.splits.test.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function CoverageList({ title, rows }: { title: string; rows: Array<{ name: string; value: number }> }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-1 text-sm">
        {rows.map((row) => (
          <div key={row.name} className="flex justify-between gap-3 border-b border-border py-1">
            <span>{row.name}</span>
            <span>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Readiness({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-2">
      <span className="text-zinc-600">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
