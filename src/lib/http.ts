export interface JsonResponseBody {
  error?: string;
  [key: string]: unknown;
}

export async function safeJson<T = JsonResponseBody>(
  res: Response
): Promise<T> {
  const text = await res.text();

  try {
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    return { error: "Invalid server response" } as T;
  }
}

export type SafeJson = typeof safeJson;

export function getErrorMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

export function getRetryAfterDelay(value: string | null) {
  if (!value?.trim()) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : Math.max(0, timestamp - Date.now());
}
