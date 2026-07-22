"use client";

import Link from "next/link";
import { AlertTriangle, Mic, RotateCcw } from "lucide-react";
import { AudioLevelMeter } from "@/components/contributor/AudioLevelMeter";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/forms";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

export function MicCheck({ sessionId }: { sessionId: string }) {
  const recorder = useAudioRecorder(5_000);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Microphone test</h2>
            <p className="mt-1 text-sm text-zinc-600">Record a short test and play it back before continuing.</p>
          </div>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium">
            {recorder.mimeType ?? "No supported MIME type"}
          </span>
        </div>

        {recorder.devices.length ? (
          <div className="mt-4 max-w-md">
            <Select value={recorder.selectedDeviceId} onChange={(event) => recorder.setSelectedDeviceId(event.target.value)}>
              <option value="">Default input device</option>
              {recorder.devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <AudioLevelMeter className="mt-5" level={recorder.level} peak={recorder.peak} state={recorder.state} />

        <div className="mt-5 flex flex-wrap gap-3">
          {recorder.state === "recording" ? (
            <Button type="button" onClick={recorder.stop}>
              Stop test
            </Button>
          ) : (
            <Button type="button" onClick={recorder.start} disabled={recorder.state === "unsupported"}>
              <Mic className="h-4 w-4" />
              Record test
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={recorder.reset}>
            <RotateCcw className="h-4 w-4" />
            Retry
          </Button>
        </div>

        {recorder.error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{recorder.error}</p>
        ) : null}

        {recorder.playbackUrl ? (
          <div className="mt-5 space-y-3">
            <audio src={recorder.playbackUrl} controls className="w-full" />
            {(recorder.silenceWarning || recorder.clippingWarning) && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>
                  Client-side checks suggest {recorder.silenceWarning ? "possible silence" : "possible clipping"}.
                  This is only a warning, not authoritative QA.
                </span>
              </div>
            )}
            <Link href={`/collect/session/${sessionId}`} className="inline-flex">
              <Button type="button">Begin session</Button>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
