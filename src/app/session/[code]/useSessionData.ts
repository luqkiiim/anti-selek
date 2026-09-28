"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage, type SafeJson } from "@/lib/http";
import type { SessionData } from "@/components/session/sessionTypes";

interface UseSessionDataArgs {
  code: string;
  enabled: boolean;
  safeJson: SafeJson;
  setError: (message: string) => void;
}

interface PatchSessionDataOptions {
  urgent?: boolean;
}

const POLL_INTERVAL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_REVALIDATE_DELAY_MS = 1_200;

function getRetryAfterDelay(value: string | null) {
  if (!value?.trim()) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : Math.max(0, timestamp - Date.now());
}

export function useSessionData({
  code,
  enabled,
  safeJson,
  setError,
}: UseSessionDataArgs) {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitialLoadPending, setIsInitialLoadPending] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const hasLoadedSessionRef = useRef(false);
  const revalidateTimeoutRef = useRef<number | null>(null);
  const inFlightRef = useRef<{
    controller: AbortController;
    id: number;
    code: string;
    timeoutId: number;
  } | null>(null);
  const requestIdRef = useRef(0);
  const activeGenerationRef = useRef(0);
  const activeCodeRef = useRef("");
  const isActiveRef = useRef(false);
  const localRevisionRef = useRef(0);
  const lastServerSnapshotRef = useRef<string | null>(null);
  const nextRequestAllowedAtRef = useRef(0);
  const fetchSession = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!code || !isActiveRef.current) return;
      if (inFlightRef.current?.code === code) return;
      if (Date.now() < nextRequestAllowedAtRef.current) return;

      const generation = activeGenerationRef.current;
      const localRevision = localRevisionRef.current;
      const controller = new AbortController();
      const requestId = ++requestIdRef.current;
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );
      inFlightRef.current = { controller, id: requestId, code, timeoutId };

      try {
        const res = await fetch(`/api/sessions/${code}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await safeJson<SessionData | { error?: string }>(res);
        if (
          !isActiveRef.current ||
          activeCodeRef.current !== code ||
          activeGenerationRef.current !== generation ||
          localRevisionRef.current !== localRevision
        ) {
          return;
        }

        if (!res.ok) {
          if (res.status === 429) {
            const retryAfterMs = getRetryAfterDelay(
              res.headers.get("Retry-After")
            );
            if (retryAfterMs > 0) {
              nextRequestAllowedAtRef.current = Date.now() + retryAfterMs;
            }
          }

          if (!silent) {
            const message = getErrorMessage(data, "Failed to load tournament");

            if (hasLoadedSessionRef.current) {
              setError(message);
            } else {
              startTransition(() => {
                setInitialLoadError(message);
                setIsInitialLoadPending(false);
              });
            }
          }
          return;
        }

        nextRequestAllowedAtRef.current = 0;
        hasLoadedSessionRef.current = true;
        const snapshotSignature = JSON.stringify(data);
        if (snapshotSignature === lastServerSnapshotRef.current) {
          startTransition(() => {
            setInitialLoadError(null);
            setIsInitialLoadPending(false);
          });
          return;
        }

        lastServerSnapshotRef.current = snapshotSignature;
        startTransition(() => {
          setSessionData(data as SessionData);
          setInitialLoadError(null);
          setIsInitialLoadPending(false);
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error(err);
        }
        if (
          !silent &&
          isActiveRef.current &&
          activeCodeRef.current === code &&
          activeGenerationRef.current === generation &&
          localRevisionRef.current === localRevision
        ) {
          if (hasLoadedSessionRef.current) {
            setError("Failed to load tournament");
          } else {
            startTransition(() => {
              setInitialLoadError("Failed to load tournament");
              setIsInitialLoadPending(false);
            });
          }
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (inFlightRef.current?.id === requestId) {
          inFlightRef.current = null;
        }
      }
    },
    [code, safeJson, setError]
  );

  const patchSessionData = useCallback(
    (
      updater: (current: SessionData) => SessionData,
      options: PatchSessionDataOptions = {}
    ) => {
      localRevisionRef.current += 1;
      lastServerSnapshotRef.current = null;
      const applyPatch = () => {
        setSessionData((current) => (current ? updater(current) : current));
      };

      if (options.urgent) {
        applyPatch();
        return;
      }

      startTransition(applyPatch);
    },
    []
  );

  const scheduleSessionRefresh = useCallback(
    (delay = DEFAULT_REVALIDATE_DELAY_MS) => {
      if (revalidateTimeoutRef.current !== null) {
        window.clearTimeout(revalidateTimeoutRef.current);
      }

      revalidateTimeoutRef.current = window.setTimeout(() => {
        revalidateTimeoutRef.current = null;
        void fetchSession({ silent: true });
      }, delay);
    },
    [fetchSession]
  );

  const retryInitialLoad = useCallback(() => {
    if (!enabled || !code) {
      return;
    }

    nextRequestAllowedAtRef.current = 0;
    startTransition(() => {
      setInitialLoadError(null);
      setIsInitialLoadPending(true);
    });

    void fetchSession();
  }, [code, enabled, fetchSession]);

  useEffect(() => {
    return () => {
      if (revalidateTimeoutRef.current !== null) {
        window.clearTimeout(revalidateTimeoutRef.current);
        revalidateTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || !code) {
      activeGenerationRef.current += 1;
      isActiveRef.current = false;
      activeCodeRef.current = "";
      hasLoadedSessionRef.current = false;
      localRevisionRef.current = 0;
      lastServerSnapshotRef.current = null;
      nextRequestAllowedAtRef.current = 0;
      if (inFlightRef.current) {
        inFlightRef.current.controller.abort();
        window.clearTimeout(inFlightRef.current.timeoutId);
        inFlightRef.current = null;
      }
      startTransition(() => {
        setSessionData(null);
        setInitialLoadError(null);
        setIsInitialLoadPending(false);
      });
      return;
    }

    const generation = activeGenerationRef.current + 1;
    activeGenerationRef.current = generation;
    activeCodeRef.current = code;
    isActiveRef.current = true;
    hasLoadedSessionRef.current = false;
    localRevisionRef.current = 0;
    lastServerSnapshotRef.current = null;
    nextRequestAllowedAtRef.current = 0;
    startTransition(() => {
      setSessionData(null);
      setInitialLoadError(null);
      setIsInitialLoadPending(true);
    });
    void fetchSession();

    const pollForUpdates = () => {
      if (document.visibilityState !== "hidden") {
        void fetchSession({ silent: true });
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "hidden") {
        void fetchSession({ silent: true });
      }
    };
    const interval = window.setInterval(pollForUpdates, POLL_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      if (activeGenerationRef.current === generation) {
        activeGenerationRef.current += 1;
        isActiveRef.current = false;
        activeCodeRef.current = "";
      }
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (revalidateTimeoutRef.current !== null) {
        window.clearTimeout(revalidateTimeoutRef.current);
        revalidateTimeoutRef.current = null;
      }
      if (inFlightRef.current?.code === code) {
        inFlightRef.current.controller.abort();
        window.clearTimeout(inFlightRef.current.timeoutId);
        inFlightRef.current = null;
      }
    };
  }, [enabled, code, fetchSession]);

  return {
    sessionData,
    isInitialLoadPending,
    initialLoadError,
    fetchSession,
    retryInitialLoad,
    patchSessionData,
    scheduleSessionRefresh,
  };
}
