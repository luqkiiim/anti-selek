import { ApiError } from "@/components/prototype/api";

export const ADMIN_READ_TIMEOUT_MS = 10_000;
export const ADMIN_SAVE_TIMEOUT_MS = 30_000;
export const UNKNOWN_SAVE_MESSAGE = "Couldn’t confirm the save. Refresh to check.";

export class AdminSaveOutcomeUnknownError extends Error {
  constructor() {
    super(UNKNOWN_SAVE_MESSAGE);
    this.name = "AdminSaveOutcomeUnknownError";
  }
}

/** Admin requests are bounded through body consumption, not just receipt of headers. */
export async function adminApi<T>(
  url: string,
  method = "GET",
  body?: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const read = method === "GET" || method === "HEAD";
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort!: () => void;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => {
      controller.abort();
      reject(read ? new Error("Request timed out. Try again.") : new AdminSaveOutcomeUnknownError());
    };
    timer = setTimeout(abort, read ? ADMIN_READ_TIMEOUT_MS : ADMIN_SAVE_TIMEOUT_MS);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
  });
  try {
    return await Promise.race([
      stopped,
      (async () => {
        const response = await fetch(url, {
          method,
          headers: body === undefined || form ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : form ? body : JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.status === 204 && response.ok) return undefined as T;
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          // A gateway/server failure may occur after commit, just like a lost response.
          if (!read && response.status >= 500) throw new AdminSaveOutcomeUnknownError();
          throw new ApiError(data?.error || `Request failed (${response.status})`, response.status, data?.code);
        }
        if (data === null) throw new Error("Invalid server response");
        return data as T;
      })(),
    ]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (!read) throw new AdminSaveOutcomeUnknownError();
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
