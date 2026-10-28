import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = "ApiError"; }
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
    throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, data?.code);
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
  const refresh = useCallback(async () => {
    if (!url || !enabled) return;
    if (refreshKey !== undefined && inFlight.current?.url === url && inFlight.current.refreshKey === refreshKey && inFlight.current.version === requestVersion.current) {
      return inFlight.current.promise;
    }
    const version = ++requestVersion.current;
    const controller = refreshKey === undefined ? undefined : new AbortController();
    const timeout = controller ? setTimeout(() => controller.abort(), 10_000) : undefined;
    const promise = (async () => {
      try {
        const data = await api<T>(url, "GET", undefined, controller?.signal);
        if (latest.current === url && requestVersion.current === version) {
          setState({ url, data });
          setError("");
          setErrorStatus(null);
        }
      } catch (e) {
        if (latest.current === url && requestVersion.current === version) {
          setError(e instanceof Error ? e.message : "Unable to load");
          setErrorStatus(e instanceof ApiError ? e.status : null);
        }
        throw e;
      } finally {
        clearTimeout(timeout);
        if (inFlight.current?.version === version) inFlight.current = null;
      }
    })();
    inFlight.current = { url, refreshKey, version, promise };
    return promise;
  }, [url, enabled, refreshKey]);
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
    void Promise.resolve().then(refresh).catch(() => {});
  }, [refresh]);
  return { data: state?.url === url ? state.data : null, error, errorStatus, refresh, update };
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
