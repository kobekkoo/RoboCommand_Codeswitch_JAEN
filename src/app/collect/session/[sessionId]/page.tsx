import { notFound } from "next/navigation";
import { RecordingSessionClient } from "@/components/contributor/RecordingSessionClient";
import { PublicShell } from "@/components/ui/shell";
import { getSessionView, markSessionInProgress } from "@/lib/data/repository";

export const dynamic = "force-dynamic";

export default async function RecordingSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  await markSessionInProgress(sessionId);
  const view = await getSessionView(sessionId);
  if (!view) notFound();

  return (
    <PublicShell>
      <RecordingSessionClient initialView={view} />
    </PublicShell>
  );
}
