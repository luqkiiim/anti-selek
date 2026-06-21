"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { DashboardCommunity } from "@/components/dashboard/dashboardTypes";

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

  const [communities, setCommunities] = useState<DashboardCommunity[]>([]);
  const [newCommunityName, setNewCommunityName] = useState("");
  const [newCommunityPassword, setNewCommunityPassword] = useState("");
  const [joinCommunityName, setJoinCommunityName] = useState("");
  const [joinCommunityPassword, setJoinCommunityPassword] = useState("");
  const [isCreateCommunityOpen, setIsCreateCommunityOpen] = useState(false);
  const [isJoinCommunityOpen, setIsJoinCommunityOpen] = useState(false);
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [joiningCommunity, setJoiningCommunity] = useState(false);
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

  const fetchCommunities = useCallback(async () => {
    const res = await fetch("/api/communities");
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(data.error || "Failed to load clubs");
    }

    setCommunities(Array.isArray(data) ? (data as DashboardCommunity[]) : []);
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
        await Promise.all([fetchCommunities(), fetchTutorialPlayground()]);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchCommunities, fetchTutorialPlayground, router, status]);

  const openCreateCommunityModal = () => {
    setError("");
    setIsCreateCommunityOpen(true);
  };

  const closeCreateCommunityModal = () => {
    if (creatingCommunity) return;
    setIsCreateCommunityOpen(false);
  };

  const openJoinCommunityModal = () => {
    setError("");
    setIsJoinCommunityOpen(true);
  };

  const closeJoinCommunityModal = () => {
    if (joiningCommunity) return;
    setIsJoinCommunityOpen(false);
  };

  const createCommunity = async () => {
    if (!newCommunityName.trim()) return;

    setCreatingCommunity(true);
    setError("");
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCommunityName,
          password: newCommunityPassword || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to create club");
        return;
      }

      setNewCommunityName("");
      setNewCommunityPassword("");
      setIsCreateCommunityOpen(false);
      await fetchCommunities();

      if (data?.id) {
        router.push(`/community/${data.id}`);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create club"
      );
    } finally {
      setCreatingCommunity(false);
    }
  };

  const joinCommunity = async () => {
    if (!joinCommunityName.trim()) return;

    setJoiningCommunity(true);
    setError("");
    try {
      const res = await fetch("/api/communities/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: joinCommunityName,
          password: joinCommunityPassword || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to join club");
        return;
      }

      setJoinCommunityName("");
      setJoinCommunityPassword("");
      setIsJoinCommunityOpen(false);
      await fetchCommunities();

      if (data?.id) {
        router.push(`/community/${data.id}`);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to join club"
      );
    } finally {
      setJoiningCommunity(false);
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
    communities,
    newCommunityName,
    setNewCommunityName,
    newCommunityPassword,
    setNewCommunityPassword,
    joinCommunityName,
    setJoinCommunityName,
    joinCommunityPassword,
    setJoinCommunityPassword,
    isCreateCommunityOpen,
    isJoinCommunityOpen,
    creatingCommunity,
    joiningCommunity,
    openingTutorialPlayground,
    tutorialPlayground,
    loading,
    error,
    setError,
    openCreateCommunityModal,
    closeCreateCommunityModal,
    openJoinCommunityModal,
    closeJoinCommunityModal,
    createCommunity,
    joinCommunity,
    openTutorialPlayground,
  };
}
