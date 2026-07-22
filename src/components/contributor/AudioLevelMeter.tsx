"use client";

import { cn } from "@/lib/cn";

const barCount = 18;

export function AudioLevelMeter({
  level,
  peak,
  state,
  className,
}: {
  level: number;
  peak: number;
  state: string;
  className?: string;
}) {
  const clampedLevel = Math.max(0, Math.min(1, level));
  const clampedPeak = Math.max(0, Math.min(1, peak));
  const voiceDetected = clampedLevel > 0.08 || clampedPeak > 0.18;

  return (
    <div className={cn("rounded-lg border border-border bg-muted p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-600">
        <span>{state === "recording" ? "Live microphone input" : "Microphone level"}</span>
        <span className={voiceDetected ? "font-medium text-accent" : ""}>
          {voiceDetected ? "Voice detected" : "Waiting for sound"}
        </span>
      </div>
      <div
        className="flex h-16 items-end gap-1"
        role="meter"
        aria-label="Live microphone input level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clampedLevel * 100)}
      >
        {Array.from({ length: barCount }, (_, index) => {
          const position = (index + 1) / barCount;
          const active = position <= Math.max(clampedLevel, 0.04);
          const baseHeight = 18 + Math.sin(index * 0.9) * 9 + position * 18;
          const height = active ? Math.max(12, baseHeight + clampedLevel * 44) : Math.max(8, baseHeight * 0.35);
          return (
            <div
              key={index}
              className={cn(
                "w-full rounded-t-sm transition-all duration-75",
                active ? "bg-accent" : "bg-zinc-300",
                state === "recording" && !active ? "animate-pulse" : "",
              )}
              style={{ height: `${Math.min(64, height)}px` }}
            />
          );
        })}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full bg-accent transition-all duration-75" style={{ width: `${Math.max(3, clampedLevel * 100)}%` }} />
      </div>
    </div>
  );
}
