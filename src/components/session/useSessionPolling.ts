"use client";

import { useEffect, useRef } from "react";

export const SHARED_SESSION_REFRESH_MS = 30_000;
const RESUME_DELAY_MS = 10_000;

interface SessionPollingOptions {
  enabled?: boolean;
  intervalMs: number | null;
  lastCheckedAt?: number | null;
  refreshOnResume?: boolean;
}

/** Poll only the visible session view; focus/reconnect also refresh completed views. */
export function useSessionPolling(
  refresh: () => Promise<unknown>,
  { enabled = true, intervalMs, lastCheckedAt, refreshOnResume = true }: SessionPollingOptions,
) {
  const refreshRef = useRef(refresh);
  const previouslyEnabled = useRef(enabled);
  const lastRunAt = useRef(0);
  const lastCheckedAtRef = useRef(lastCheckedAt);
  useEffect(() => { refreshRef.current = refresh; lastCheckedAtRef.current = lastCheckedAt; }, [refresh, lastCheckedAt]);

  useEffect(() => {
    const resumed = !previouslyEnabled.current && enabled;
    previouslyEnabled.current = enabled;
    if (!enabled) return;
    if (!lastRunAt.current) lastRunAt.current = Date.now();

    let disposed = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const timeSinceLastCheck = () => Date.now() - Math.max(lastRunAt.current, lastCheckedAtRef.current ?? 0);
    const schedule = () => {
      clearTimer();
      if (disposed || intervalMs === null || document.visibilityState === "hidden") return;
      timer = setTimeout(() => {
        if (timeSinceLastCheck() >= intervalMs) run();
        else schedule();
      }, Math.max(0, intervalMs - timeSinceLastCheck()));
    };
    const run = () => {
      clearTimer();
      if (disposed || pending || document.visibilityState === "hidden") return;
      pending = true;
      lastRunAt.current = Date.now();
      void Promise.resolve().then(() => {
        if (!disposed) return refreshRef.current();
      }).catch(() => {
        // Each resource owns its error state and retry/backoff policy.
      }).finally(() => {
        pending = false;
        schedule();
      });
    };
    const wake = () => {
      if (document.visibilityState === "hidden") { clearTimer(); return; }
      // Focus, reconnect and visibility changes can all accompany one return.
      if (timeSinceLastCheck() >= RESUME_DELAY_MS) run();
      else if (timer === undefined && !pending) schedule();
    };

    if (resumed && refreshOnResume) run();
    else schedule();
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      clearTimer();
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, intervalMs, refreshOnResume]);
}
