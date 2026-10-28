"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage, type SafeJson } from "@/lib/http";
import type { SessionData } from "@/components/session/sessionTypes";
import { sessionPollInterval, useSessionPolling } from "@/components/session/useSessionPolling";

interface UseSessionDataArgs {
  code: string;
  enabled: boolean;
  pollingEnabled?: boolean;
  readQuery?: string;
  safeJson: SafeJson;
  setError: (message: string) => void;
}

interface PatchSessionDataOptions {
  urgent?: boolean;
}

const RETRY_DELAY_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_REVALIDATE_DELAY_MS = 1_200;

function hasOlderScores(current: SessionData, incoming: SessionData) {
  if (
    current.resultsRevision !== undefined && incoming.resultsRevision !== undefined &&
    incoming.resultsRevision < current.resultsRevision
  ) return true;

  const scoreRevisions = (snapshot: SessionData) => [
    ...(snapshot.matches ?? []),
    ...(snapshot.courts ?? []).flatMap(court => court.currentMatch ? [court.currentMatch] : []),
  ];
  const knownRevisions = new Map<string, number>();
  for (const match of scoreRevisions(current)) {
    if (match.scoreRevision !== undefined) {
      knownRevisions.set(match.id, Math.max(knownRevisions.get(match.id) ?? 0, match.scoreRevision));
    }
  }
  return scoreRevisions(incoming).some(match => {
    const known = knownRevisions.get(match.id);
    return known !== undefined && match.scoreRevision !== undefined && match.scoreRevision < known;
  });
}

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
  pollingEnabled = true,
  readQuery = "",
  safeJson,
  setError,
}: UseSessionDataArgs) {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isInitialLoadPending, setIsInitialLoadPending] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const hasLoadedSessionRef = useRef(false);
  const revalidateTimeoutRef = useRef<number | null>(null);
  const deferredRecoveryTimeoutRef = useRef<number | null>(null);
  const deferredRecoveryRef = useRef<Promise<void> | null>(null);
  const deferredRecoveryGenerationRef = useRef(0);
  const inFlightRef = useRef<{
    controller: AbortController;
    id: number;
    code: string;
    timeoutId: number | null;
    settled: Promise<void>;
    resolveSettled: () => void;
  } | null>(null);
  const requestIdRef = useRef(0);
  const activeGenerationRef = useRef(0);
  const activeCodeRef = useRef("");
  const isActiveRef = useRef(false);
  const localRevisionRef = useRef(0);
  const lastServerSnapshotRef = useRef<string | null>(null);
  const nextRequestAllowedAtRef = useRef(0);
  const fetchSession = useCallback(
    async ({ silent = false, recoverDeferredQueue = false }: { silent?: boolean; recoverDeferredQueue?: boolean } = {}) => {
      if (!code || !isActiveRef.current) return;
      if (inFlightRef.current?.code === code) return "retry";
      if (Date.now() < nextRequestAllowedAtRef.current) return "retry";

      const generation = activeGenerationRef.current;
      const localRevision = localRevisionRef.current;
      const controller = new AbortController();
      const requestId = ++requestIdRef.current;
      // A Clear action waits for a recovery writer to finish. Aborting its fetch
      // would not prove that the server-side writer had stopped.
      const timeoutId = recoverDeferredQueue ? null : window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
      );
      let resolveSettled = () => {};
      const settled = new Promise<void>((resolve) => { resolveSettled = resolve; });
      inFlightRef.current = { controller, id: requestId, code, timeoutId, settled, resolveSettled };

      try {
        const recoveryQuery = recoverDeferredQueue
          ? `${readQuery ? "&" : "?"}recoverDeferredQueue=1`
          : "";
        const res = await fetch(`/api/sessions/${encodeURIComponent(code)}${readQuery}${recoveryQuery}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await safeJson<SessionData | { error?: string }>(res);
        if (
          !isActiveRef.current ||
          activeCodeRef.current !== code ||
          activeGenerationRef.current !== generation
        ) {
          return;
        }

        if (!res.ok) {
          if (res.status === 429) {
            const retryAfterMs = getRetryAfterDelay(
              res.headers.get("Retry-After")
            );
            nextRequestAllowedAtRef.current = Date.now() +
              (retryAfterMs > 0 ? retryAfterMs : RETRY_DELAY_MS);
          }

          if (!silent && localRevisionRef.current === localRevision) {
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
          return res.status === 429 ? "retry" : undefined;
        }

        nextRequestAllowedAtRef.current = 0;
        if (localRevisionRef.current !== localRevision) return;
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
          // A read can start after a save yet still contain its previous score.
          // Compare at application time so an accepted mutation cannot be undone
          // by a queued refresh. Newer revisions still allow corrections/reopens.
          setSessionData(current => current && hasOlderScores(current, data as SessionData)
            ? current
            : data as SessionData);
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
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        if (inFlightRef.current?.id === requestId) {
          inFlightRef.current = null;
        }
        resolveSettled();
      }
    },
    [code, readQuery, safeJson, setError]
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

  const scheduleDeferredQueueRecovery = useCallback(() => {
    const recoveryGeneration = ++deferredRecoveryGenerationRef.current;
    if (deferredRecoveryTimeoutRef.current !== null) {
      window.clearTimeout(deferredRecoveryTimeoutRef.current);
    }
    const startRecovery = () => {
      const recovery = (async () => {
        // A normal poll may already be loading. Wait for it so the one-shot
        // recovery request is not silently discarded by fetchSession.
        while (inFlightRef.current?.code === code) {
          await inFlightRef.current.settled;
          if (deferredRecoveryGenerationRef.current !== recoveryGeneration) return;
        }
        if (deferredRecoveryGenerationRef.current !== recoveryGeneration) return;
        const outcome = await fetchSession({ silent: true, recoverDeferredQueue: true });
        if (outcome === "retry" && deferredRecoveryGenerationRef.current === recoveryGeneration) {
          // Preserve the one-shot intent across an existing cooldown or 429.
          // Clear invalidates this generation and cancels this timer.
          const retryDelay = Math.max(100, nextRequestAllowedAtRef.current - Date.now());
          deferredRecoveryTimeoutRef.current = window.setTimeout(() => {
            deferredRecoveryTimeoutRef.current = null;
            if (deferredRecoveryGenerationRef.current === recoveryGeneration) startRecovery();
          }, retryDelay);
        }
      })();
      deferredRecoveryRef.current = recovery;
      void recovery.finally(() => {
        if (deferredRecoveryRef.current === recovery) deferredRecoveryRef.current = null;
      });
    };
    deferredRecoveryTimeoutRef.current = window.setTimeout(() => {
      deferredRecoveryTimeoutRef.current = null;
      if (deferredRecoveryGenerationRef.current === recoveryGeneration) startRecovery();
    }, DEFAULT_REVALIDATE_DELAY_MS);
  }, [code, fetchSession]);

  const cancelDeferredQueueRecovery = useCallback(async () => {
    deferredRecoveryGenerationRef.current += 1;
    if (deferredRecoveryTimeoutRef.current !== null) {
      window.clearTimeout(deferredRecoveryTimeoutRef.current);
      deferredRecoveryTimeoutRef.current = null;
    }
    // Sequence DELETE after the dispatched recovery response. A network
    // failure cannot prove the server-side writer has stopped.
    await deferredRecoveryRef.current;
  }, []);

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
      if (deferredRecoveryTimeoutRef.current !== null) {
        window.clearTimeout(deferredRecoveryTimeoutRef.current);
        deferredRecoveryTimeoutRef.current = null;
      }
      deferredRecoveryGenerationRef.current += 1;
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
        if (inFlightRef.current.timeoutId !== null) window.clearTimeout(inFlightRef.current.timeoutId);
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

    return () => {
      if (activeGenerationRef.current === generation) {
        activeGenerationRef.current += 1;
        isActiveRef.current = false;
        activeCodeRef.current = "";
      }
      if (revalidateTimeoutRef.current !== null) {
        window.clearTimeout(revalidateTimeoutRef.current);
        revalidateTimeoutRef.current = null;
      }
      if (deferredRecoveryTimeoutRef.current !== null) {
        window.clearTimeout(deferredRecoveryTimeoutRef.current);
        deferredRecoveryTimeoutRef.current = null;
      }
      deferredRecoveryGenerationRef.current += 1;
      if (inFlightRef.current?.code === code) {
        inFlightRef.current.controller.abort();
        if (inFlightRef.current.timeoutId !== null) window.clearTimeout(inFlightRef.current.timeoutId);
        inFlightRef.current = null;
      }
    };
  }, [enabled, code, fetchSession]);

  const pollSession = useCallback(() => fetchSession({ silent: true }), [fetchSession]);
  useSessionPolling(pollSession, {
    enabled: enabled && !!code && pollingEnabled,
    intervalMs: sessionPollInterval(sessionData?.status),
  });

  return {
    sessionData,
    isInitialLoadPending,
    initialLoadError,
    fetchSession,
    retryInitialLoad,
    patchSessionData,
    scheduleSessionRefresh,
    scheduleDeferredQueueRecovery,
    cancelDeferredQueueRecovery,
  };
}
