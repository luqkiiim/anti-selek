"use client";

import { useSessionCourtActions } from "./useSessionCourtActions";
import { useSessionScoreActions } from "./useSessionScoreActions";
import type { UseSessionMatchActionsDependencies } from "./sessionMatchActionTypes";

export function useSessionMatchActions({
  code,
  sessionData,
  safeJson,
  patchSessionData,
  scheduleSessionRefresh,
  scheduleDeferredQueueRecovery,
  cancelDeferredQueueRecovery,
  setError,
}: UseSessionMatchActionsDependencies) {
  const courtActions = useSessionCourtActions({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    scheduleDeferredQueueRecovery,
    cancelDeferredQueueRecovery,
    setError,
  });
  const scoreActions = useSessionScoreActions({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    scheduleDeferredQueueRecovery,
    cancelDeferredQueueRecovery,
    setError,
  });

  return {
    court: courtActions,
    score: scoreActions,
  };
}
