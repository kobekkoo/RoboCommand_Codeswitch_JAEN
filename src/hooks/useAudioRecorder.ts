"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const candidateMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/wav",
];

export type RecorderState =
  | "unsupported"
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "ready"
  | "failed";

export function getSupportedRecordingMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return undefined;
  return candidateMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function useAudioRecorder(maxDurationMs = 20_000) {
  const [state, setState] = useState<RecorderState>(() =>
    typeof window !== "undefined" && "MediaRecorder" in window && navigator.mediaDevices ? "idle" : "unsupported",
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [error, setError] = useState<string>();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [rms, setRms] = useState(0);
  const [peak, setPeak] = useState(0);
  const [blob, setBlob] = useState<Blob>();
  const [playbackUrl, setPlaybackUrl] = useState<string>();
  const [mimeType, setMimeType] = useState<string>();
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const rafRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);

  const supportedMimeType = useMemo(() => getSupportedRecordingMimeType(), []);

  const cleanupStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    void audioContextRef.current?.close();
    audioContextRef.current = undefined;
  }, []);

  const cleanupPlayback = useCallback(() => {
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(undefined);
    setBlob(undefined);
  }, [playbackUrl]);

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices?.().then((found) => {
      setDevices(found.filter((device) => device.kind === "audioinput"));
    });
    return () => {
      cleanupStream();
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
  }, [cleanupStream, playbackUrl]);

  const attachAnalyser = useCallback((stream: MediaStream) => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    audioContextRef.current = context;

    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      let localPeak = 0;
      for (const sample of data) {
        sum += sample * sample;
        localPeak = Math.max(localPeak, Math.abs(sample));
      }
      const localRms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, localRms * 7));
      setRms((current) => Math.max(current, localRms));
      setPeak((current) => Math.max(current, localPeak));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const requestPermission = useCallback(async () => {
    if (!supportedMimeType) {
      setState("unsupported");
      setError("This browser does not support a recording format CommandLoop can use.");
      return undefined;
    }
    setState("requesting");
    setError(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      });
      streamRef.current = stream;
      attachAnalyser(stream);
      const found = await navigator.mediaDevices.enumerateDevices();
      setDevices(found.filter((device) => device.kind === "audioinput"));
      setState("idle");
      setMimeType(supportedMimeType);
      return stream;
    } catch (permissionError) {
      setState("failed");
      setError(permissionError instanceof Error ? permissionError.message : "Microphone permission was denied.");
      return undefined;
    }
  }, [attachAnalyser, selectedDeviceId, supportedMimeType]);

  const start = useCallback(async () => {
    cleanupPlayback();
    setElapsedMs(0);
    setRms(0);
    setPeak(0);
    const stream = streamRef.current ?? (await requestPermission());
    if (!stream || !supportedMimeType) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      setState("processing");
      const recordedBlob = new Blob(chunksRef.current, { type: supportedMimeType });
      setBlob(recordedBlob);
      setPlaybackUrl(URL.createObjectURL(recordedBlob));
      setState("ready");
      cleanupStream();
    };
    startedAtRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= maxDurationMs && recorder.state === "recording") {
        recorder.stop();
      }
    }, 100);
    recorder.start();
    setState("recording");
  }, [cleanupPlayback, cleanupStream, maxDurationMs, requestPermission, supportedMimeType]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    cleanupPlayback();
    cleanupStream();
    setElapsedMs(0);
    setLevel(0);
    setRms(0);
    setPeak(0);
    setState(supportedMimeType ? "idle" : "unsupported");
    setError(undefined);
  }, [cleanupPlayback, cleanupStream, supportedMimeType]);

  return {
    state,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    error,
    elapsedMs,
    level,
    rms,
    peak,
    blob,
    playbackUrl,
    mimeType: mimeType ?? supportedMimeType,
    silenceWarning: Boolean(blob && rms < 0.01),
    clippingWarning: peak > 0.95,
    requestPermission,
    start,
    stop,
    reset,
  };
}
