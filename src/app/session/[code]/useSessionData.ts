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
  const revalidateTimeoutRef = useRef<number | null>(null);

  const fetchSession = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!code) return;

      try {
        const res = await fetch(`/api/sessions/${code}`);
        const data = await safeJson<SessionData | { error?: string }>(res);
        if (!res.ok) {
          if (!silent) {
            setError(getErrorMessage(data, "Failed to load session"));
          }
          return;
        }

        startTransition(() => {
          setSessionData(data as SessionData);
        });
      } catch (err) {
        console.error(err);
        if (!silent) {
          setError("Failed to load session");
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

  useEffect(() => {
    return () => {
      if (revalidateTimeoutRef.current !== null) {
        window.clearTimeout(revalidateTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || !code) return;

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
    fetchSession,
    patchSessionData,
    scheduleSessionRefresh,
  };
}
