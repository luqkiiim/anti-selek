import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error || `Request failed (${response.status})`);
  return data as T;
}
export function useResource<T>(url: string | null) {
  const [state, setState] = useState<{ url: string; data: T } | null>(null);
  const [error, setError] = useState("");
  const latest = useRef(url);
  const requestVersion = useRef(0);
  useEffect(() => { latest.current = url; }, [url]);
  const refresh = useCallback(async () => {
    if (!url) return;
    const version = ++requestVersion.current;
    try {
      const data = await api<T>(url);
      if (latest.current === url && requestVersion.current === version) {
        setState({ url, data });
        setError("");
      }
    } catch (e) {
      if (latest.current === url && requestVersion.current === version)
        setError(e instanceof Error ? e.message : "Unable to load");
      throw e;
    }
  }, [url]);
  const update = useCallback((updater: (current: T) => T) => {
    if (!url || latest.current !== url) return;
    // Ignore reads that started before this authoritative local update.
    requestVersion.current += 1;
    setState((current) => current?.url === url
      ? { url, data: updater(current.data) }
      : current);
    setError("");
  }, [url]);
  useEffect(() => {
    void Promise.resolve().then(refresh).catch(() => {});
  }, [refresh]);
  return { data: state?.url === url ? state.data : null, error, refresh, update };
}
export function useAction(refresh?: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function run(
    action: () => Promise<unknown>,
    success?: () => void | Promise<void>,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh?.();
      await success?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
