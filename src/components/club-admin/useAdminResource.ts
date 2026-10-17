"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";

export function useAdminResource<T>(url: string | null) {
  const [state, setState] = useState<{ url: string; data: T } | null>(null);
  const [error, setError] = useState("");
  const version = useRef(0);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (!url) return;
    const current = ++version.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const data = await adminApi<T>(url, "GET", undefined, { signal: controller.signal });
      if (mounted.current && current === version.current) {
        setState({ url, data });
        setError("");
      }
    } catch (failure) {
      if (mounted.current && current === version.current) {
        setError(failure instanceof Error ? failure.message : "Unable to load");
        throw failure;
      }
    }
  }, [url]);
  const update = useCallback((updater: (data: T) => T) => {
    version.current++;
    active.current?.abort();
    setState(current => current?.url === url ? { ...current, data: updater(current.data) } : current);
    setError("");
  }, [url]);
  useEffect(() => {
    mounted.current = true;
    const generation = version;
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) return refresh(); }).catch(() => {});
    return () => { cancelled = true; mounted.current = false; generation.current++; active.current?.abort(); };
  }, [refresh]);
  return { data: state?.url === url ? state.data : null, error, refresh, update };
}
