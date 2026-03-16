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
