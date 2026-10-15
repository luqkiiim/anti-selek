"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ADMIN_READ_TIMEOUT_MS, ADMIN_SAVE_TIMEOUT_MS, AdminSaveOutcomeUnknownError } from "@/lib/adminClient";

export const ADMIN_REFRESH_WARNING = "Saved. Couldn’t refresh the latest details.";

/** A committed write and its subsequent reads have independent outcomes. */
export function useAdminAction(refresh?: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const mounted = useRef(true);
  const lock = useRef(false);
  const unknownOutcome = useRef(false);
  const revision = useRef(0);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const active = useRef<AbortController | null>(null);
  const read = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mounted.current = true;
    const generation = revision;
    return () => {
      mounted.current = false;
      generation.current++;
      active.current?.abort();
      lock.current = false;
    };
  }, []);

  const refreshAfterSave = useCallback((version: number, recovering = false) => {
    if (!refreshRef.current || !mounted.current) return Promise.resolve();
    setRefreshing(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = Promise.race([
      Promise.resolve().then(() => refreshRef.current?.()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Refresh timed out")), ADMIN_READ_TIMEOUT_MS);
      }),
    ]).then(() => {
      if (!mounted.current || revision.current !== version) return;
      setRefreshWarning("");
      if (recovering) {
        unknownOutcome.current = false;
        setUncertain(false);
        setError("");
      }
    }, () => {
      if (!mounted.current || revision.current !== version) return;
      if (!unknownOutcome.current) setRefreshWarning(ADMIN_REFRESH_WARNING);
    }).finally(() => {
      clearTimeout(timer);
      if (mounted.current && revision.current === version) setRefreshing(false);
      if (read.current === pending) read.current = null;
    });
    read.current = pending;
    return pending;
  }, []);

  const retryRefresh = useCallback(() => {
    if (read.current) return read.current;
    return refreshAfterSave(revision.current, true);
  }, [refreshAfterSave]);

  const run = useCallback(async <T,>(
    action: (signal: AbortSignal) => Promise<T>,
    success?: (data: T) => void | Promise<void>,
  ): Promise<boolean> => {
    if (lock.current || unknownOutcome.current || !mounted.current) return false;
    lock.current = true;
    const version = ++revision.current;
    // A newer save supersedes feedback/recovery from the previous background read.
    read.current = null;
    setRefreshing(false);
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setRefreshWarning("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop!: () => void;
    let saved = false;
    try {
      const value = await Promise.race([
        new Promise<never>((_, reject) => {
          stop = () => reject(new AdminSaveOutcomeUnknownError());
          controller.signal.addEventListener("abort", stop, { once: true });
          timer = setTimeout(() => controller.abort(), ADMIN_SAVE_TIMEOUT_MS);
        }),
        Promise.resolve().then(() => action(controller.signal)),
      ]);
      saved = true;
      clearTimeout(timer);
      if (!mounted.current) return true;
      lock.current = false;
      active.current = null;
      setBusy(false);
      // A UI callback failure must never be presented as a failed database write.
      try {
        await Promise.race([
          Promise.resolve(success?.(value)),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Confirmation timed out")), ADMIN_READ_TIMEOUT_MS);
          }),
        ]);
      } catch {
        if (mounted.current && revision.current === version) setRefreshWarning(ADMIN_REFRESH_WARNING);
      }
      return true;
    } catch (failure) {
      if (mounted.current) {
        if (failure instanceof AdminSaveOutcomeUnknownError) {
          unknownOutcome.current = true;
          setUncertain(true);
        }
        setError(failure instanceof Error ? failure.message : "Unable to save");
      }
      return false;
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", stop);
      if (active.current === controller) active.current = null;
      if (revision.current === version) lock.current = false;
      if (mounted.current && revision.current === version) {
        setBusy(false);
        if (saved) void refreshAfterSave(version);
      }
    }
  }, [refreshAfterSave]);

  return { busy, error, setError, refreshWarning, refreshing, uncertain, retryRefresh, run };
}
