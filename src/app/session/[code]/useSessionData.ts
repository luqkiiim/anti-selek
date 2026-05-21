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

const POLL_INTERVAL_MS = 8000;
const DEFAULT_REVALIDATE_DELAY_MS = 1200;

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

  const fetchSession = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!code) return;

      try {
        const res = await fetch(`/api/sessions/${code}`);
        const data = await safeJson<SessionData | { error?: string }>(res);
        if (!res.ok) {
          if (!silent) {
            const message = getErrorMessage(data, "Failed to load session");

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

        hasLoadedSessionRef.current = true;
        startTransition(() => {
          setSessionData(data as SessionData);
          setInitialLoadError(null);
          setIsInitialLoadPending(false);
        });
      } catch (err) {
        console.error(err);
        if (!silent) {
          if (hasLoadedSessionRef.current) {
            setError("Failed to load session");
          } else {
            startTransition(() => {
              setInitialLoadError("Failed to load session");
              setIsInitialLoadPending(false);
            });
          }
        }
      }
    },
    [code, safeJson, setError]
  );

  const patchSessionData = useCallback(
    (updater: (current: SessionData) => SessionData) => {
      startTransition(() => {
        setSessionData((current) => (current ? updater(current) : current));
      });
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
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || !code) {
      hasLoadedSessionRef.current = false;
      startTransition(() => {
        setSessionData(null);
        setInitialLoadError(null);
        setIsInitialLoadPending(false);
      });
      return;
    }

    hasLoadedSessionRef.current = false;
    startTransition(() => {
      setSessionData(null);
      setInitialLoadError(null);
      setIsInitialLoadPending(true);
    });
    void fetchSession();
    const interval = window.setInterval(() => {
      void fetchSession({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
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
