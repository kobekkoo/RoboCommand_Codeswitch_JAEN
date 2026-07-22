"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const WARNING_SECONDS = 15 * 60;
const MAX_SESSION_CHECK_MS = 5 * 60 * 1000;
const TRANSIENT_RETRY_MS = 5 * 1000;

type SessionStatus = {
  valid: boolean;
  expiresAt?: number;
  secondsRemaining?: number;
};

function formatMinutes(seconds?: number) {
  if (seconds === undefined) return "soon";
  return `${Math.max(1, Math.ceil(seconds / 60))} minute${seconds > 60 ? "s" : ""}`;
}

export function AdminSessionPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionStatus>();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const invalidChecks = useRef(0);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        invalidChecks.current += 1;
        setSession({ valid: false });
        setOpen(false);
        if (invalidChecks.current >= 2 && pathname.startsWith("/admin") && pathname !== "/admin/login") {
          router.push("/admin/login");
        }
        return { valid: false as const };
      }
      if (!response.ok) return undefined;
      const body = (await response.json()) as SessionStatus;
      invalidChecks.current = 0;
      setSession(body);
      setOpen(Boolean(body.valid && (body.secondsRemaining ?? Number.POSITIVE_INFINITY) <= WARNING_SECONDS));
      return body;
    } catch {
      return undefined;
    }
  }, [pathname, router]);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    async function schedule() {
      const body = await loadSession();
      if (cancelled) return;
      if (!body?.valid || !body.expiresAt) {
        timeout = setTimeout(schedule, TRANSIENT_RETRY_MS);
        return;
      }
      const msUntilWarning = Math.max(1_000, body.expiresAt - Date.now() - WARNING_SECONDS * 1000);
      timeout = setTimeout(schedule, Math.min(msUntilWarning, MAX_SESSION_CHECK_MS));
    }

    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadSession]);

  async function keepLoggedIn() {
    setMessage("Refreshing session...");
    const response = await fetch("/api/admin/session", { method: "POST", credentials: "same-origin" });
    if (!response.ok) {
      router.push("/admin/login");
      return;
    }
    const body = (await response.json()) as SessionStatus;
    invalidChecks.current = 0;
    setSession(body);
    setOpen(false);
    setMessage(undefined);
  }

  async function logOut() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
    router.push("/admin/login");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <section className="w-full max-w-md rounded-lg border border-border bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Stay logged in?</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          Your admin session will expire in about {formatMinutes(session?.secondsRemaining)}. Keep the session active
          if you are still reviewing data.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={keepLoggedIn}>
            Keep me logged in
          </Button>
          <Button type="button" variant="secondary" onClick={logOut}>
            Log out now
          </Button>
        </div>
        {message ? <p className="mt-3 text-sm text-zinc-600">{message}</p> : null}
      </section>
    </div>
  );
}
