import type { UseSessionMatchActionsDependencies } from "./sessionMatchActionTypes";
import type { JsonResponseBody } from "@/lib/http";

interface GenerateMatchRequestOptions {
  code: string;
  safeJson: UseSessionMatchActionsDependencies["safeJson"];
  body: Record<string, unknown>;
}

export async function postGenerateMatchAction<T = JsonResponseBody>({
  code,
  safeJson,
  body,
}: GenerateMatchRequestOptions) {
  const res = await fetch(`/api/sessions/${code}/generate-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    res,
    data: await safeJson<T>(res),
  };
}

interface SessionActionRequestOptions {
  code: string;
  safeJson: UseSessionMatchActionsDependencies["safeJson"];
  body?: Record<string, unknown>;
}

export async function postSessionAction(
  url: string,
  { safeJson, body }: Pick<SessionActionRequestOptions, "safeJson" | "body">
) {
  return postSessionActionTyped<JsonResponseBody>(url, { safeJson, body });
}

export async function postSessionActionTyped<T = JsonResponseBody>(
  url: string,
  { safeJson, body }: Pick<SessionActionRequestOptions, "safeJson" | "body">
) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    res,
    data: await safeJson<T>(res),
  };
}

export async function deleteSessionAction<T = JsonResponseBody>(
  url: string,
  { safeJson }: Pick<SessionActionRequestOptions, "safeJson">
) {
  const res = await fetch(url, {
    method: "DELETE",
  });

  return {
    res,
    data: await safeJson<T>(res),
  };
}
