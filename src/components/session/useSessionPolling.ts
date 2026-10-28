"use client";

import { useEffect, useRef } from "react";

export function sessionPollInterval(status?: string) {
  if (status === "COMPLETED") return null;
  return status === "WAITING" ? 10_000 : 5_000;
}

interface SessionPollingOptions {
  enabled?: boolean;
  intervalMs: number | null;
  refreshOnEnable?: boolean;
  refreshOnResume?: boolean;
}

/** Poll only the visible session view; focus/reconnect also refresh completed views. */
export function useSessionPolling(
  refresh: () => Promise<unknown>,
  { enabled = true, intervalMs, refreshOnEnable = false, refreshOnResume = true }: SessionPollingOptions,
) {
  const refreshRef = useRef(refresh);
  const previouslyEnabled = useRef(enabled);
  const lastWakeAt = useRef(-Infinity);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    const resumed = !previouslyEnabled.current && enabled;
    previouslyEnabled.current = enabled;
    if (!enabled) return;

    let disposed = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => { clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      clearTimer();
      if (!disposed && intervalMs !== null && document.visibilityState !== "hidden") {
        timer = setTimeout(run, intervalMs);
      }
    };
    const run = () => {
      clearTimer();
      if (disposed || pending || document.visibilityState === "hidden") return;
      pending = true;
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
      // Browsers commonly emit visibilitychange and focus for the same return.
      if (Date.now() - lastWakeAt.current < 1_000) return;
      lastWakeAt.current = Date.now();
      run();
    };

    if (refreshOnEnable || (resumed && refreshOnResume)) run();
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
  }, [enabled, intervalMs, refreshOnEnable, refreshOnResume]);
}
