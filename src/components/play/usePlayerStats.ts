"use client";
import { useEffect, useState, useCallback } from "react";
import type { UserProfileResponse } from "@/components/profile/PlayerProfileView";
export function usePlayerStats(userId?: string | null, clubId?: string) {
  const key = `${userId ?? ""}:${clubId ?? ""}`;
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: UserProfileResponse | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    fetch(
      `/api/users/${encodeURIComponent(userId)}/stats${clubId ? `?clubId=${encodeURIComponent(clubId)}` : ""}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load player statistics");
        return r.json() as Promise<UserProfileResponse>;
      })
      .then((data) => setResult({ key, data, error: "" }))
      .catch((e) => {
        if (e.name !== "AbortError")
          setResult({ key, data: null, error: e.message });
      });
    return () => controller.abort();
  }, [userId, clubId, key, version]);
  return {
    data: result.key === key ? result.data : null,
    error: result.key === key ? result.error : "",
    refresh,
  };
}
