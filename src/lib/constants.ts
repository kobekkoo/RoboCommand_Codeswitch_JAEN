export const CONTRIBUTOR_COOKIE = "cl_contributor_id";
export const ADMIN_SESSION_COOKIE = "cl_admin_session";
export const ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
export const CONTRIBUTOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export const MAX_AUDIO_FILE_BYTES = 10 * 1024 * 1024;
export const AUDIO_BUCKET = "command-audio";

export const supportedAudioMimeTypes = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/ogg;codecs=opus",
] as const;
