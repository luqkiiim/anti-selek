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
  setError,
}: UseSessionMatchActionsDependencies) {
  const courtMatchCreation = useSessionCourtMatchCreation({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    setError,
  });
  const courtConfirmActions = useSessionCourtConfirmActions({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    setError,
  });

  return {
    ...courtMatchCreation,
    ...courtConfirmActions,
  };
}
