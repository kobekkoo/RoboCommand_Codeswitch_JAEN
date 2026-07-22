import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicShell } from "@/components/ui/shell";
import { getSessionView } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function CompletePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const view = await getSessionView(sessionId);
  if (!view) notFound();
  const submitted = view.assignments.filter((assignment) => assignment.status === "submitted").length;
  const skipped = view.assignments.filter((assignment) => assignment.status === "skipped").length;

  return (
    <PublicShell compact>
      <Card>
        <CardHeader>
          <CardTitle>Session complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Submitted</dt>
              <dd className="text-2xl font-semibold">{submitted}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Skipped</dt>
              <dd className="text-2xl font-semibold">{skipped}</dd>
            </div>
          </dl>
          <div className="rounded-md border border-border bg-muted p-4 text-center">
            <p className="text-sm font-medium text-zinc-600">Session completion code</p>
            <p className="mt-2 text-2xl font-semibold">{view.session.completionCode}</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-700">
              Use this code if the project team asks you to confirm which recording session you completed.
            </p>
          </div>
          <p className="text-sm leading-6 text-zinc-700">
            Thank you. Please keep avoiding personal information in future recordings.
          </p>
          <Link href="/collect" className={buttonVariants({ variant: "secondary" })}>
            Begin another eligible session
          </Link>
        </CardContent>
      </Card>
    </PublicShell>
  );
}
