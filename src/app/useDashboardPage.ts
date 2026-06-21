"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { DashboardClub } from "@/components/dashboard/dashboardTypes";

interface TutorialPlaygroundSummary {
  communityId: string;
  communityName: string;
  sessionCode: string | null;
  playersCount: number;
  courtsCount: number;
  isTutorial: true;
}

export function useDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isQuickAccess = session?.user?.isQuickAccess === true;

  const [clubs, setClubs] = useState<DashboardClub[]>([]);
  const [newClubName, setNewClubName] = useState("");
  const [newClubPassword, setNewClubPassword] = useState("");
  const [joinClubName, setJoinClubName] = useState("");
  const [joinClubPassword, setJoinClubPassword] = useState("");
  const [isCreateClubOpen, setIsCreateClubOpen] = useState(false);
  const [isJoinClubOpen, setIsJoinClubOpen] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [joiningClub, setJoiningClub] = useState(false);
  const [openingTutorialPlayground, setOpeningTutorialPlayground] =
    useState(false);
  const [tutorialPlayground, setTutorialPlayground] =
    useState<TutorialPlaygroundSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  }, []);

  const fetchClubs = useCallback(async () => {
    const res = await fetch("/api/communities");
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(data.error || "Failed to load clubs");
    }

    setClubs(Array.isArray(data) ? (data as DashboardClub[]) : []);
  }, [safeJson]);

  const fetchTutorialPlayground = useCallback(async () => {
    if (isQuickAccess) {
      setTutorialPlayground(null);
      return;
    }

    const res = await fetch("/api/tutorial-playground");
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(data.error || "Failed to load tutorial playground");
    }

    setTutorialPlayground(
      data?.playground ? (data.playground as TutorialPlaygroundSummary) : null
    );
  }, [isQuickAccess, safeJson]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
      return;
    }

    if (status !== "authenticated") {
      return;
    }

    void (async () => {
      try {
        setError("");
        await Promise.all([fetchClubs(), fetchTutorialPlayground()]);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchClubs, fetchTutorialPlayground, router, status]);

  const openCreateClubModal = () => {
    setError("");
    setIsCreateClubOpen(true);
  };

  const closeCreateClubModal = () => {
    if (creatingClub) return;
    setIsCreateClubOpen(false);
  };

  const openJoinClubModal = () => {
    setError("");
    setIsJoinClubOpen(true);
  };

  const closeJoinClubModal = () => {
    if (joiningClub) return;
    setIsJoinClubOpen(false);
  };

  const createClub = async () => {
    if (!newClubName.trim()) return;

    setCreatingClub(true);
    setError("");
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClubName,
          password: newClubPassword || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to create club");
        return;
      }

      setNewClubName("");
      setNewClubPassword("");
      setIsCreateClubOpen(false);
      await fetchClubs();

      if (data?.id) {
        router.push(`/community/${data.id}`);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create club"
      );
    } finally {
      setCreatingClub(false);
    }
  };

  const joinClub = async () => {
    if (!joinClubName.trim()) return;

    setJoiningClub(true);
    setError("");
    try {
      const res = await fetch("/api/communities/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: joinClubName,
          password: joinClubPassword || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to join club");
        return;
      }

      setJoinClubName("");
      setJoinClubPassword("");
      setIsJoinClubOpen(false);
      await fetchClubs();

      if (data?.id) {
        router.push(`/community/${data.id}`);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to join club"
      );
    } finally {
      setJoiningClub(false);
    }
  };

  const openTutorialPlayground = async () => {
    setOpeningTutorialPlayground(true);
    setError("");
    try {
      const res = await fetch("/api/tutorial-playground", { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to open tutorial playground");
        return;
      }

      const playground = data?.playground as TutorialPlaygroundSummary | null;
      if (!playground?.communityId) {
        setError("Failed to open tutorial playground");
        return;
      }

      setTutorialPlayground(playground);
      router.push(`/community/${playground.communityId}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to open tutorial playground"
      );
    } finally {
      setOpeningTutorialPlayground(false);
    }
  };

  return {
    status,
    isQuickAccess,
    accountName: session?.user?.name ?? "",
    clubs,
    newClubName,
    setNewClubName,
    newClubPassword,
    setNewClubPassword,
    joinClubName,
    setJoinClubName,
    joinClubPassword,
    setJoinClubPassword,
    isCreateClubOpen,
    isJoinClubOpen,
    creatingClub,
    joiningClub,
    openingTutorialPlayground,
    tutorialPlayground,
    loading,
    error,
    setError,
    openCreateClubModal,
    closeCreateClubModal,
    openJoinClubModal,
    closeJoinClubModal,
    createClub,
    joinClub,
    openTutorialPlayground,
  };
}
