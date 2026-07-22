import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicShell } from "@/components/ui/shell";

export default function InstructionsPage() {
  return (
    <PublicShell compact>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Contributor Instructions</h1>
          <p className="mt-3 text-zinc-700">
            Record short commands as if you were speaking to a home robot. Most prompts should stay under 20 seconds.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Before recording</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-zinc-700">
            <p>Choose an environment honestly. Quiet and noisy conditions are both useful when labeled correctly.</p>
            <p>Do the microphone check, then listen to your test clip before beginning the session.</p>
            <p>Do not say private details such as your name, address, phone number, or account information.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>During recording</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-zinc-700">
            <p>For exact-read prompts, read the displayed command. For freeform prompts, say a natural command.</p>
            <p>Replay each clip. Re-record when the audio is silent, clipped, incomplete, or not what you intended.</p>
            <p>Type what you actually said. A reviewer will later create the final reference transcript.</p>
          </CardContent>
        </Card>
        <Link href="/consent" className={buttonVariants()}>
          Continue to consent
        </Link>
      </div>
    </PublicShell>
  );
}
