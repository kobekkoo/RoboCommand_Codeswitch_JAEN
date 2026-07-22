"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleStop, Mic, RotateCcw, SkipForward, Upload } from "lucide-react";
import { AudioLevelMeter } from "@/components/contributor/AudioLevelMeter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/forms";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import type { SessionView } from "@/lib/domain";

export function RecordingSessionClient({ initialView }: { initialView: SessionView }) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.max(0, initialView.assignments.findIndex((assignment) => assignment.status === "assigned")),
  );
  const initialAssignment = initialView.assignments[
    Math.max(0, initialView.assignments.findIndex((assignment) => assignment.status === "assigned"))
  ];
  const [transcriptDraft, setTranscriptDraft] = useState({
    assignmentId: initialAssignment?.id ?? "",
    value: initialAssignment?.prompt.exactText ?? "",
  });
  const [message, setMessage] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [playbackConfirmation, setPlaybackConfirmation] = useState({ assignmentId: initialAssignment?.id ?? "", value: false });
  const recorder = useAudioRecorder(20_000);

  const current = view.assignments[currentIndex];
  const submitted = view.assignments.filter((assignment) => assignment.status === "submitted").length;
  const skipped = view.assignments.filter((assignment) => assignment.status === "skipped").length;
  const done = submitted + skipped >= view.assignments.length;

  const suggestedTranscript = useMemo(() => {
    if (!current?.prompt) return "";
    return current.prompt.exactText ?? "";
  }, [current]);

  const isScriptedPrompt = Boolean(current?.prompt.exactText);
  const transcript = transcriptDraft.assignmentId === current?.id ? transcriptDraft.value : suggestedTranscript;
  const confirmedPlayback = playbackConfirmation.assignmentId === current?.id ? playbackConfirmation.value : false;

  function setTranscript(value: string) {
    setTranscriptDraft({ assignmentId: current?.id ?? "", value });
  }

  function setConfirmedPlayback(value: boolean) {
    setPlaybackConfirmation({ assignmentId: current?.id ?? "", value });
  }

  async function refresh() {
    const response = await fetch(`/api/sessions/${view.session.id}`);
    if (response.ok) {
      const body = (await response.json()) as SessionView;
      setView(body);
      const next = body.assignments.findIndex((assignment) => assignment.status === "assigned");
      setCurrentIndex(next >= 0 ? next : body.assignments.length - 1);
      if (body.session.status === "completed") {
        router.push(`/collect/session/${body.session.id}/complete`);
      }
    }
  }

  async function submit() {
    if (!current || !recorder.blob || !recorder.mimeType) return;
    setUploading(true);
    setMessage(undefined);
    const formData = new FormData();
    formData.set("audio", recorder.blob, `recording.${recorder.mimeType.includes("webm") ? "webm" : "m4a"}`);
    formData.set("sessionId", view.session.id);
    formData.set("assignmentId", current.id);
    formData.set("contributorTranscript", transcript.trim());
    formData.set("mimeType", recorder.mimeType);
    formData.set("durationMs", String(Math.max(500, recorder.elapsedMs)));
    formData.set("clientRms", String(recorder.rms));
    formData.set("clientPeak", String(recorder.peak));
    formData.set("silenceWarning", String(recorder.silenceWarning));
    formData.set("clippingWarning", String(recorder.clippingWarning));

    const response = await fetch("/api/recordings/submit", { method: "POST", body: formData });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setMessage(body?.error ?? "Upload failed. Please retry.");
      setUploading(false);
      return;
    }
    recorder.reset();
    setTranscriptDraft({ assignmentId: "", value: "" });
    setConfirmedPlayback(false);
    setUploading(false);
    await refresh();
  }

  async function startCurrentTake() {
    setConfirmedPlayback(false);
    setMessage(undefined);
    await recorder.start();
  }

  function resetCurrentTake() {
    recorder.reset();
    setConfirmedPlayback(false);
    setMessage(undefined);
  }

  async function skip() {
    if (!current) return;
    const reason = window.prompt("Why are you skipping this prompt?");
    if (!reason) return;
    await fetch("/api/recordings/skip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: view.session.id, assignmentId: current.id, skipReason: reason }),
    });
    recorder.reset();
    setTranscriptDraft({ assignmentId: "", value: "" });
    setConfirmedPlayback(false);
    await refresh();
  }

  if (!current || done) {
    return (
      <div className="rounded-lg border border-border bg-white p-6">
        <h1 className="text-2xl font-semibold">Session complete</h1>
        <Button className="mt-4" type="button" onClick={() => router.push(`/collect/session/${view.session.id}/complete`)}>
          View completion
        </Button>
      </div>
    );
  }

  const canSubmit = Boolean(recorder.blob && (confirmedPlayback || transcript.trim()) && transcript.trim());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Recording session</h1>
          <p className="text-sm text-zinc-600">
            {currentIndex + 1} of {view.assignments.length} prompts. {submitted} submitted, {skipped} skipped.
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted sm:w-72">
          <div className="h-full bg-accent" style={{ width: `${((submitted + skipped) / view.assignments.length) * 100}%` }} />
        </div>
      </div>

      <section className="rounded-lg border border-border bg-white p-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone="blue">{current.prompt.language}</Badge>
          <Badge>{current.prompt.taskType}</Badge>
          <Badge tone={current.prompt.safetySensitive ? "red" : "neutral"}>{current.prompt.commandVariant}</Badge>
        </div>
        <p className="mt-5 text-lg font-medium">{current.prompt.displayInstruction}</p>
        {current.prompt.exactText ? (
          <blockquote className="mt-4 rounded-md border-l-4 border-accent bg-muted px-4 py-3 text-xl font-semibold">
            {current.prompt.exactText}
          </blockquote>
        ) : (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
            This prompt is not scripted. Do not read the instruction aloud; speak a natural command, then type the
            words you actually said.
          </p>
        )}
        <p className="mt-4 text-sm text-zinc-600">Aim for 1-20 seconds. Replay before submitting or type what you said.</p>
      </section>

      <section className="rounded-lg border border-border bg-white p-5">
        <AudioLevelMeter level={recorder.level} peak={recorder.peak} state={recorder.state} />
        <div className="mt-4 flex flex-wrap gap-3">
          {recorder.state === "recording" ? (
            <Button type="button" onClick={recorder.stop}>
              <CircleStop className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button type="button" onClick={startCurrentTake} disabled={uploading}>
              <Mic className="h-4 w-4" />
              Record
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={resetCurrentTake} disabled={uploading}>
            <RotateCcw className="h-4 w-4" />
            Re-record
          </Button>
          <Button type="button" variant="ghost" onClick={skip} disabled={uploading}>
            <SkipForward className="h-4 w-4" />
            Skip with reason
          </Button>
        </div>
        <p className="mt-3 text-sm text-zinc-600">
          State: {recorder.state}. Timer: {(recorder.elapsedMs / 1000).toFixed(1)}s.
        </p>
        {recorder.playbackUrl ? (
          <div className="mt-4 space-y-3">
            <audio src={recorder.playbackUrl} controls className="w-full" onPlay={() => setConfirmedPlayback(true)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmedPlayback} onChange={(event) => setConfirmedPlayback(event.target.checked)} />
              I replayed the clip or explicitly confirm this is the correct take.
            </label>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-white p-5">
        <Label htmlFor="actual">What did you actually say?</Label>
        <Input
          id="actual"
          className="mt-2"
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder={isScriptedPrompt ? "The scripted command should appear here" : "Type the words you actually said"}
        />
        <p className="mt-2 text-sm text-zinc-600">
          {isScriptedPrompt
            ? "This scripted prompt is pre-filled, including Japanese text. Edit it if you said something different."
            : "Natural, paraphrase, code-switching, and scenario prompts are intentionally not pre-filled."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" onClick={submit} disabled={!canSubmit || uploading}>
            {uploading ? <Upload className="h-4 w-4 animate-pulse" /> : <Check className="h-4 w-4" />}
            {uploading ? "Uploading..." : "Submit recording"}
          </Button>
        </div>
        {message ? <p className="mt-3 text-sm text-danger">{message}</p> : null}
      </section>
    </div>
  );
}
