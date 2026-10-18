"use client";

import { useSessionCourtConfirmActions } from "./useSessionCourtConfirmActions";
import { useSessionCourtMatchCreation } from "./useSessionCourtMatchCreation";
import type { UseSessionMatchActionsDependencies } from "./sessionMatchActionTypes";

export function useSessionCourtActions({
  code,
  sessionData,
  safeJson,
  patchSessionData,
  scheduleSessionRefresh,
  scheduleDeferredQueueRecovery,
  cancelDeferredQueueRecovery,
  setError,
}: UseSessionMatchActionsDependencies) {
  const courtMatchCreation = useSessionCourtMatchCreation({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    scheduleDeferredQueueRecovery,
    cancelDeferredQueueRecovery,
    setError,
  });
  const courtConfirmActions = useSessionCourtConfirmActions({
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
    ...courtMatchCreation,
    ...courtConfirmActions,
  };
}
