"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  validateCreateClubInput,
  validateJoinClubInput,
} from "@/components/dashboard/clubFormValidation";
import type {
  ClubFormError,
  ClubFormField,
  DashboardClub,
} from "@/components/dashboard/dashboardTypes";
import { getCurrentAppPath, withCallbackUrl } from "@/lib/authCallback";

interface TutorialPlaygroundSummary {
  clubId: string;
  clubName: string;
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
  const [dashboardError, setDashboardError] = useState("");
  const [createClubError, setCreateClubError] =
    useState<ClubFormError | null>(null);
  const [joinClubError, setJoinClubError] =
    useState<ClubFormError | null>(null);

  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  }, []);

  const fetchClubs = useCallback(async () => {
    const res = await fetch("/api/clubs");
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
      router.replace(
        withCallbackUrl("/signin", getCurrentAppPath(window.location))
      );
      return;
    }

    if (status !== "authenticated") {
      return;
    }

    void (async () => {
      try {
        setDashboardError("");
        await Promise.all([fetchClubs(), fetchTutorialPlayground()]);
      } catch (err: unknown) {
        setDashboardError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchClubs, fetchTutorialPlayground, router, status]);

  const openCreateClubModal = () => {
    setCreateClubError(null);
    setIsCreateClubOpen(true);
  };

  const closeCreateClubModal = () => {
    if (creatingClub) return;
    setIsCreateClubOpen(false);
    setCreateClubError(null);
  };

  const openJoinClubModal = () => {
    setJoinClubError(null);
    setIsJoinClubOpen(true);
  };

  const closeJoinClubModal = () => {
    if (joiningClub) return;
    setIsJoinClubOpen(false);
    setJoinClubError(null);
  };

  const clearMatchingFormError = (
    currentError: ClubFormError | null,
    field: ClubFormField
  ) => {
    if (!currentError || (currentError.field && currentError.field !== field)) {
      return currentError;
    }

    return null;
  };

  const updateNewClubName = (value: string) => {
    setNewClubName(value);
    setCreateClubError((current) =>
      clearMatchingFormError(current, "clubName")
    );
  };

  const updateNewClubPassword = (value: string) => {
    setNewClubPassword(value);
    setCreateClubError((current) =>
      clearMatchingFormError(current, "password")
    );
  };

  const updateJoinClubName = (value: string) => {
    setJoinClubName(value);
    setJoinClubError((current) =>
      clearMatchingFormError(current, "clubName")
    );
  };

  const updateJoinClubPassword = (value: string) => {
    setJoinClubPassword(value);
    setJoinClubError((current) =>
      clearMatchingFormError(current, "password")
    );
  };

  const readClubFormError = (
    data: Record<string, unknown>,
    fallback: string
  ): ClubFormError => ({
    error: typeof data.error === "string" ? data.error : fallback,
    field:
      data.field === "clubName" || data.field === "password"
        ? data.field
        : undefined,
  });

  const createClub = async () => {
    if (creatingClub) return;

    const validationError = validateCreateClubInput(
      newClubName,
      newClubPassword
    );
    if (validationError) {
      setCreateClubError(validationError);
      return;
    }

    setCreatingClub(true);
    setCreateClubError(null);
    try {
      const res = await fetch("/api/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClubName.trim(),
          password: newClubPassword || undefined,
        }),
      });
      const data = (await safeJson(res)) as Record<string, unknown>;
      if (!res.ok) {
        setCreateClubError(
          readClubFormError(data, "Failed to create club")
        );
        return;
      }

      setNewClubName("");
      setNewClubPassword("");
      setIsCreateClubOpen(false);
      if (typeof data.id === "string") {
        router.push(`/club/${data.id}`);
      }
      void fetchClubs().catch((err: unknown) => {
        setDashboardError(
          err instanceof Error ? err.message : "Failed to refresh clubs"
        );
      });
    } catch (err: unknown) {
      setCreateClubError({
        error:
          err instanceof Error ? err.message : "Failed to create club",
      });
    } finally {
      setCreatingClub(false);
    }
  };

  const joinClub = async () => {
    if (joiningClub) return;

    const validationError = validateJoinClubInput(
      joinClubName,
      joinClubPassword
    );
    if (validationError) {
      setJoinClubError(validationError);
      return;
    }

    setJoiningClub(true);
    setJoinClubError(null);
    try {
      const res = await fetch("/api/clubs/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: joinClubName.trim(),
          password: joinClubPassword || undefined,
        }),
      });
      const data = (await safeJson(res)) as Record<string, unknown>;
      if (!res.ok) {
        setJoinClubError(readClubFormError(data, "Failed to join club"));
        return;
      }

      setJoinClubName("");
      setJoinClubPassword("");
      setIsJoinClubOpen(false);
      if (typeof data.id === "string") {
        router.push(`/club/${data.id}`);
      }
      void fetchClubs().catch((err: unknown) => {
        setDashboardError(
          err instanceof Error ? err.message : "Failed to refresh clubs"
        );
      });
    } catch (err: unknown) {
      setJoinClubError({
        error: err instanceof Error ? err.message : "Failed to join club",
      });
    } finally {
      setJoiningClub(false);
    }
  };

  const openTutorialPlayground = async () => {
    setOpeningTutorialPlayground(true);
    setDashboardError("");
    try {
      const res = await fetch("/api/tutorial-playground", { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) {
        setDashboardError(data.error || "Failed to open tutorial playground");
        return;
      }

      const playground = data?.playground as TutorialPlaygroundSummary | null;
      if (!playground?.clubId) {
        setDashboardError("Failed to open tutorial playground");
        return;
      }

      setTutorialPlayground(playground);
      router.push(`/club/${playground.clubId}`);
    } catch (err: unknown) {
      setDashboardError(
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
    setNewClubName: updateNewClubName,
    newClubPassword,
    setNewClubPassword: updateNewClubPassword,
    joinClubName,
    setJoinClubName: updateJoinClubName,
    joinClubPassword,
    setJoinClubPassword: updateJoinClubPassword,
    isCreateClubOpen,
    isJoinClubOpen,
    creatingClub,
    joiningClub,
    openingTutorialPlayground,
    tutorialPlayground,
    loading,
    dashboardError,
    createClubError,
    joinClubError,
    openCreateClubModal,
    closeCreateClubModal,
    openJoinClubModal,
    closeJoinClubModal,
    createClub,
    joinClub,
    openTutorialPlayground,
  };
}
