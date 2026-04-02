import type { UseSessionMatchActionsDependencies } from "./sessionMatchActionTypes";

interface GenerateMatchRequestOptions {
  code: string;
  safeJson: UseSessionMatchActionsDependencies["safeJson"];
  body: Record<string, unknown>;
}

export async function postGenerateMatchAction({
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
    data: await safeJson(res),
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
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    res,
    data: await safeJson(res),
  };
}

export async function deleteSessionAction(
  url: string,
  { safeJson }: Pick<SessionActionRequestOptions, "safeJson">
) {
  const res = await fetch(url, {
    method: "DELETE",
  });

  return {
    res,
    data: await safeJson(res),
  };
}
