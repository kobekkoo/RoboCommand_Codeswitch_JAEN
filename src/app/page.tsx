import Link from "next/link";
import { Mic, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { PublicShell } from "@/components/ui/shell";

export default function HomePage() {
  return (
    <PublicShell>
      <section className="grid min-h-[70vh] items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-accent">Audio data flywheel</p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-normal text-foreground sm:text-6xl">
            CommandLoop
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-zinc-700">Collect robust voice commands for embodied AI.</p>
          <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-700">
            CommandLoop helps contributors record short spoken commands, lets reviewers create verified reference
            transcripts, and compares speech-to-text models across language, environment, and command-style slices.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/consent" className={cn(buttonVariants({ size: "lg" }), "inline-flex")}>
              <Mic className="h-5 w-5" />
              Start recording
            </Link>
            <Link href="/instructions" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Contributor instructions
            </Link>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 text-accent" />
            <div>
              <h2 className="text-lg font-semibold">Privacy note</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-700">
                This prototype collects audio commands and privacy-conscious metadata only. Please do not record your
                name, address, phone number, precise location, or other private information.
              </p>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Storage</dt>
              <dd className="font-medium">Private audio bucket</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Review</dt>
              <dd className="font-medium">Human verified transcripts</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Evaluation</dt>
              <dd className="font-medium">Mock STT by default</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Use</dt>
              <dd className="font-medium">Data collection, not robot control</dd>
            </div>
          </dl>
        </div>
      </section>
    </PublicShell>
  );
}
