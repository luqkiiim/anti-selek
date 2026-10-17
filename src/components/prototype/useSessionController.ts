"use client";
import { useCallback, useState } from "react";
import { useSessionData } from "@/app/session/[code]/useSessionData";
import { safeJson } from "@/lib/http";

/** One request lifecycle for both direct and in-app sessions. */
export function useSessionController(code: string, globalClubId?: string) {
  const [error, setError] = useState("");
  const readQuery = globalClubId ? `?view=global&clubId=${encodeURIComponent(globalClubId)}` : "";
  const { fetchSession, ...controller } = useSessionData({ code, enabled: !!code, readQuery, safeJson, setError });
  const refresh = useCallback(async () => { setError(""); await fetchSession(); }, [fetchSession]);
  return {
    data: controller.sessionData,
    error: controller.initialLoadError ?? error,
    refresh,
    update: controller.patchSessionData,
    retry: controller.retryInitialLoad,
    scheduleDeferredQueueRecovery: controller.scheduleDeferredQueueRecovery,
    cancelDeferredQueueRecovery: controller.cancelDeferredQueueRecovery,
  };
}
