"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  ClubAdminClaimRequest,
  ClubAdminClub,
  ClubAdminPlayer,
} from "@/components/club-admin/clubAdminTypes";
import { getCurrentAppPath, withCallbackUrl } from "@/lib/authCallback";
import { fetchClubAdminSnapshot } from "./clubAdminApi";

interface ClubAdminRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
}

class SupersededAdminReadError extends Error {
  constructor() { super("Club details changed. Refresh again."); }
}

export function useClubAdminData({
  clubId,
  status,
  router,
}: {
  clubId: string;
  status: "authenticated" | "loading" | "unauthenticated";
  router: ClubAdminRouter;
}) {
  const [club, setClub] = useState<ClubAdminClub | null>(null);
  const [players, updatePlayers] = useState<ClubAdminPlayer[]>([]);
  const [claimRequests, setClaimRequests] = useState<
    ClubAdminClaimRequest[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const version = useRef(0);
  const reads = useRef(new Set<AbortController>());
  const readVersion = useRef(0);
  const pendingRead = useRef<{ clubId: string; version: number; promise: Promise<void> } | null>(null);
  useEffect(() => {
    const activeReads = reads.current;
    const pending = pendingRead;
    const generation = readVersion;
    return () => {
      generation.current++;
      pending.current = null;
      for (const controller of activeReads) controller.abort();
    };
  }, []);
  const setPlayers: Dispatch<SetStateAction<ClubAdminPlayer[]>> = useCallback((next) => {
    version.current += 1;
    updatePlayers(next);
  }, []);

  const invalidateReads = useCallback(() => {
    version.current++;
    readVersion.current++;
    pendingRead.current = null;
    for (const controller of reads.current) controller.abort();
  }, []);

  const fetchClubAndPlayers = useCallback((): Promise<void> => {
    if (!clubId) return Promise.resolve();
    const currentVersion = version.current;
    const pending = pendingRead.current;
    if (pending?.clubId === clubId && pending.version === currentVersion) return pending.promise;
    const currentRead = ++readVersion.current;
    const controller = new AbortController();
    reads.current.add(controller);
    const promise = (async () => {
      const snapshot = await fetchClubAdminSnapshot(clubId, controller.signal);
      if (controller.signal.aborted || currentVersion !== version.current || currentRead !== readVersion.current) {
        throw new SupersededAdminReadError();
      }
      if (snapshot.club.role !== "ADMIN") {
        router.replace(`/club/${clubId}`);
        throw new Error("Only club admins can access this page");
      }
      setClub(snapshot.club);
      updatePlayers(snapshot.players);
      setClaimRequests(snapshot.claimRequests);
    })().finally(() => {
      reads.current.delete(controller);
      if (pendingRead.current?.promise === promise) pendingRead.current = null;
    });
    pendingRead.current = { clubId, version: currentVersion, promise };
    return promise;
  }, [clubId, router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        withCallbackUrl("/signin", getCurrentAppPath(window.location))
      );
      return;
    }

    if (status !== "authenticated" || !clubId) return;
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError("");
        await fetchClubAndPlayers();
      } catch (err: unknown) {
        if (!cancelled && !(err instanceof SupersededAdminReadError)) setError(err instanceof Error ? err.message : "Failed to load admin page");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clubId, fetchClubAndPlayers, router, status]);

  return {
    club,
    setClub,
    players,
    setPlayers,
    claimRequests,
    setClaimRequests,
    loading,
    error,
    setError,
    success,
    setSuccess,
    fetchClubAndPlayers,
    invalidateReads,
  };
}
