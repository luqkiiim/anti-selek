"use client";
import { AdminSaveOutcomeUnknownError } from "@/lib/adminClient";
import { adminFetch } from "./clubAdminApi";
import { useCallback, useEffect, useRef, useState } from "react";

export function useAdminRefresh(refresh: () => Promise<void>, onMutationStart?: () => void) {
  const [refreshWarning, setRefreshWarning] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const uncertainRef = useRef(false);
  const version = useRef(0);
  const mounted = useRef(true);
  const mutationLock = useRef(false);
  const requests = useRef(new Set<AbortController>());
  useEffect(() => { mounted.current = true; const activeRequests = requests.current; return () => { mounted.current = false; for (const controller of activeRequests) controller.abort(); }; }, []);
  const retryRefresh = useCallback(async () => {
    const current = ++version.current;
    if (mounted.current) setRefreshing(true);
    try {
      await refresh();
      if (mounted.current && current === version.current) { setRefreshWarning(""); uncertainRef.current = false; setUncertain(false); }
    } catch {
      if (mounted.current && current === version.current) setRefreshWarning(uncertainRef.current ? "Couldn’t refresh the latest details." : "Saved. Couldn’t refresh the latest details.");
    } finally {
      if (mounted.current && current === version.current) setRefreshing(false);
    }
  }, [refresh]);
  const refreshClubData = useCallback(() => { void retryRefresh(); }, [retryRefresh]);
  const request = useCallback(async (url: string, init?: RequestInit) => {
    if (uncertainRef.current && init?.method && init.method !== "GET") throw new AdminSaveOutcomeUnknownError();
    if (init?.method && init.method !== "GET") {
      // A read started before this mutation cannot resolve its uncertain outcome.
      version.current++;
      onMutationStart?.();
      if (mounted.current) { setRefreshing(false); setRefreshWarning(""); }
    }
    const controller = new AbortController();
    requests.current.add(controller);
    try { return await adminFetch(url, { ...init, signal: controller.signal }); } catch (error) {
      if (error instanceof AdminSaveOutcomeUnknownError) { uncertainRef.current = true; if (mounted.current) setUncertain(true); }
      throw error;
    } finally { requests.current.delete(controller); }
  }, [onMutationStart]);
  const guard = <Args extends unknown[], Result>(action: (...args: Args) => Promise<Result>, rejectIfBlocked = false) => async (...args: Args) => {
    if (mutationLock.current || uncertainRef.current) {
      if (rejectIfBlocked) throw uncertainRef.current ? new AdminSaveOutcomeUnknownError() : new Error("Another change is being saved. Try again.");
      return;
    }
    mutationLock.current = true;
    try { return await action(...args); } finally { mutationLock.current = false; }
  };
  return { guard, refreshClubData, refreshWarning, refreshing, retryRefresh, uncertain, request };
}
