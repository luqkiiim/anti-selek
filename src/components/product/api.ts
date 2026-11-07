import { getRetryAfterDelay } from "@/lib/http";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly details?: unknown, readonly retryAfterMs = 0) { super(message); this.name = "ApiError"; }
}

export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, data?.code, data, getRetryAfterDelay(response.headers?.get("Retry-After") ?? null));
  return data as T;
}
export function useResource<T>(url: string | null, { enabled = true, refreshKey }: { enabled?: boolean; refreshKey?: string } = {}) {
  const [state, setState] = useState<{ url: string; data: T } | null>(null);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const latest = useRef(url);
  const requestVersion = useRef(0);
  const inFlight = useRef<{ url: string; refreshKey?: string; version: number; promise: Promise<void> } | null>(null);
  useEffect(() => { latest.current = url; }, [url]);
  const completed = useRef<{ url: string; key: string; version: number } | null>(null);
  const cooldown = useRef<{ url: string; until: number } | null>(null);
  const refreshForKey = useCallback(async (key = refreshKey, reuse = false) => {
    if (!url || !enabled) return;
    if (key !== undefined) {
      const pending = inFlight.current;
      if (pending?.url === url && pending.refreshKey === key && pending.version === requestVersion.current) {
        return pending.promise;
      }
      if (reuse && completed.current?.url === url && completed.current.key === key && completed.current.version === requestVersion.current) return;
      if (cooldown.current?.url === url && Date.now() < cooldown.current.until) {
        throw new ApiError("Rate limit exceeded", 429);
      }
    }
    const version = ++requestVersion.current;
    const controller = key === undefined ? undefined : new AbortController();
    const timeout = controller ? setTimeout(() => controller.abort(), 10_000) : undefined;
    const promise = (async () => {
      try {
        const data = await api<T>(url, "GET", undefined, controller?.signal);
        if (latest.current === url && requestVersion.current === version) {
          if (key !== undefined) completed.current = { url, key, version };
          setState({ url, data });
          setError("");
          setErrorStatus(null);
        }
      } catch (e) {
        if (latest.current === url && requestVersion.current === version) {
          if (key !== undefined && e instanceof ApiError && e.status === 429) {
            cooldown.current = { url, until: Date.now() + (e.retryAfterMs || 5_000) };
          }
          setError(e instanceof Error ? e.message : "Unable to load");
          setErrorStatus(e instanceof ApiError ? e.status : null);
        }
        throw e;
      } finally {
        clearTimeout(timeout);
        if (inFlight.current?.version === version) inFlight.current = null;
      }
    })();
    inFlight.current = { url, refreshKey: key, version, promise };
    return promise;
  }, [url, enabled, refreshKey]);
  const refresh = useCallback(() => refreshForKey(), [refreshForKey]);
  const update = useCallback((updater: (current: T) => T) => {
    if (!url || latest.current !== url) return;
    // Ignore reads that started before this authoritative local update.
    requestVersion.current += 1;
    setState((current) => current?.url === url
      ? { url, data: updater(current.data) }
      : current);
    setError("");
    setErrorStatus(null);
  }, [url]);
  useEffect(() => {
    void Promise.resolve().then(() => refreshForKey(refreshKey, true)).catch(() => {});
  }, [refreshForKey, refreshKey]);
  return { data: state?.url === url ? state.data : null, error, errorStatus, refresh, refreshForKey, update };
}
export function useAction(refresh?: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function run(
    action: () => Promise<unknown>,
    success?: () => void | Promise<void>,
    { backgroundRefresh = false } = {},
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      if (backgroundRefresh) {
        await success?.();
        if (refresh) void Promise.resolve().then(refresh).catch(() => {});
      } else {
        await refresh?.();
        await success?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
