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
