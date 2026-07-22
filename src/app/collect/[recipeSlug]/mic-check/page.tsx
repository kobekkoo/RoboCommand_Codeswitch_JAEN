import { redirect } from "next/navigation";
import { MicCheck } from "@/components/contributor/MicCheck";
import { PublicShell } from "@/components/ui/shell";

export default async function MicCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const { sessionId } = await searchParams;
  if (!sessionId) redirect("/collect");

  return (
    <PublicShell compact>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Microphone Check</h1>
          <p className="mt-3 text-zinc-700">Test permissions, levels, supported recording type, and playback.</p>
        </div>
        <MicCheck sessionId={sessionId} />
      </div>
    </PublicShell>
  );
}
