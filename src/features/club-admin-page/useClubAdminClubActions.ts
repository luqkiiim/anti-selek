"use client";

import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type {
  ClubAdminClaimRequest,
  ClubAdminClub,
} from "@/components/club-admin/clubAdminTypes";
import { useAdminRefresh } from "./useAdminRefresh";
import { safeJson } from "./clubAdminApi";

interface ClubAdminRouter {
  push: (href: string) => void;
}

interface PendingClubAction {
  kind: "reset" | "delete";
}

export function useClubAdminClubActions({
  clubId,
  club,
  refreshClubData: refresh,
  onMutationStart,
  router,
  setError,
  setSuccess,
}: {
  clubId: string;
  club: ClubAdminClub | null;
  refreshClubData: () => Promise<void>;
  onMutationStart?: () => void;
  router: ClubAdminRouter;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const { refreshClubData, refreshWarning, refreshing, retryRefresh, uncertain, request, guard } = useAdminRefresh(refresh, onMutationStart);
  const [clubNameInput, setClubNameInput] = useState("");
  const [clubPasswordInput, setClubPasswordInput] = useState("");
  const [clubPasswordProtectionEnabled, setClubPasswordProtectionEnabled] =
    useState(false);
  const [savingClubSettings, setSavingClubSettings] = useState(false);
  const [reviewingClaimRequestId, setReviewingClaimRequestId] = useState<
    string | null
  >(null);
  const [resettingClub, setResettingClub] = useState(false);
  const [deletingClub, setDeletingClub] = useState(false);
  const [pendingClubAction, setPendingClubAction] =
    useState<PendingClubAction | null>(null);
  const [clubActionConfirmationValue, setClubActionConfirmationValue] =
    useState("");

  useEffect(() => {
    if (!club) return;
    setClubNameInput((prev) =>
      prev.trim().length === 0 || prev === club.name ? club.name : prev
    );
  }, [club]);

  useEffect(() => {
    if (!club) return;
    setClubPasswordProtectionEnabled(club.isPasswordProtected);
  }, [club]);

  const handleUpdateClubSettings = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!club) return;

    const trimmedName = clubNameInput.trim();
    const nextPassword = clubPasswordInput;
    const nextPasswordProtection = clubPasswordProtectionEnabled;
    const hasNameChange =
      trimmedName.length > 0 && trimmedName !== club.name;
    const hasPasswordChange = nextPassword.length > 0;
    const hasPasswordProtectionChange =
      nextPasswordProtection !== club.isPasswordProtected;

    setError("");
    setSuccess("");

    if (trimmedName.length < 3) {
      setError("Club name must be at least 3 characters.");
      return;
    }
    if (!nextPasswordProtection && hasPasswordChange) {
      setError("Turn password protection back on before setting a password.");
      return;
    }
    if (hasPasswordChange && nextPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (
      nextPasswordProtection &&
      !club.isPasswordProtected &&
      !hasPasswordChange
    ) {
      setError("Set a password before turning protection on.");
      return;
    }
    if (!hasNameChange && !hasPasswordChange && !hasPasswordProtectionChange) {
      setSuccess("No changes to save.");
      return;
    }

    setSavingClubSettings(true);

    try {
      const body: {
        name?: string;
        password?: string;
        isPasswordProtected?: boolean;
      } = {};
      if (hasNameChange) body.name = trimmedName;
      if (hasPasswordProtectionChange) {
        body.isPasswordProtected = nextPasswordProtection;
      }
      if (nextPasswordProtection && hasPasswordChange) {
        body.password = nextPassword;
      }

      const res = await request(`/api/clubs/${clubId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update club");
      }

      setClubPasswordInput("");
      setSuccess("Club settings updated.");
      refreshClubData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update club"
      );
    } finally {
      setSavingClubSettings(false);
    }
  };

  const handleUploadClubAvatar = async (file: File) => {
    if (!club) return;

    setError("");
    setSuccess("");

    try {
      const body = new FormData();
      body.append("avatar", file);
      await request(`/api/clubs/${clubId}/avatar`, { method: "POST", body });
      setSuccess("Club profile picture updated.");
      refreshClubData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update club photo"
      );
      throw err;
    }
  };

  const handleRemoveClubAvatar = async () => {
    if (!club) return;

    setError("");
    setSuccess("");

    try {
      await request(`/api/clubs/${clubId}/avatar`, { method: "DELETE" });
      setSuccess("Club profile picture removed.");
      refreshClubData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to remove club photo"
      );
      throw err;
    }
  };

  const handleResetClub = () => {
    setError("");
    setSuccess("");
    setClubActionConfirmationValue("");
    setPendingClubAction({ kind: "reset" });
  };

  const handleDeleteClub = () => {
    setError("");
    setSuccess("");
    setClubActionConfirmationValue("");
    setPendingClubAction({ kind: "delete" });
  };

  const closePendingClubAction = () => {
    if (resettingClub || deletingClub) return;
    setPendingClubAction(null);
    setClubActionConfirmationValue("");
  };

  const confirmPendingClubAction = async () => {
    if (!pendingClubAction) return false;

    setError("");
    setSuccess("");

    if (pendingClubAction.kind === "reset") {
      setResettingClub(true);
      try {
        const res = club?.isTutorial
          ? await request("/api/tutorial-playground/reset", { method: "POST" })
          : await request(`/api/clubs/${clubId}/reset`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirmation: "RESET" }),
            });
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(
            data.error ||
              (club?.isTutorial
                ? "Failed to reset playground"
                : "Failed to reset club")
          );
        }

        setSuccess(
          club?.isTutorial
            ? "Playground reset successful."
            : "Club reset successful."
        );
        setPendingClubAction(null);
        setClubActionConfirmationValue("");
        refreshClubData();
        return true;
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : club?.isTutorial
              ? "Failed to reset playground"
              : "Failed to reset club"
        );
        return false;
      } finally {
        setResettingClub(false);
      }
    }

    setDeletingClub(true);
    try {
      const res = await request(`/api/clubs/${clubId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete club");
      }

      setPendingClubAction(null);
      setClubActionConfirmationValue("");
      router.push("/");
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete club"
      );
      return false;
    } finally {
      setDeletingClub(false);
    }
  };

  const handleReviewClaimRequest = async (
    claimRequest: ClubAdminClaimRequest,
    action: "APPROVE" | "REJECT"
  ) => {
    setReviewingClaimRequestId(claimRequest.id);
    setError("");
    setSuccess("");

    try {
      const res = await request(
        `/api/clubs/${clubId}/claim-requests/${claimRequest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, revision: claimRequest.revision }),
        }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to review claim request");
      }

      setSuccess(
        action === "APPROVE"
          ? `Approved ${claimRequest.requesterName}'s claim for ${claimRequest.targetName}.`
          : `Rejected ${claimRequest.requesterName}'s claim for ${claimRequest.targetName}.`
      );
      refreshClubData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to review claim request"
      );
    } finally {
      setReviewingClaimRequestId(null);
    }
  };

  return {
    refreshWarning, refreshing, retryRefresh, uncertain,
    clubNameInput,
    setClubNameInput,
    clubPasswordInput,
    setClubPasswordInput,
    clubPasswordProtectionEnabled,
    setClubPasswordProtectionEnabled,
    savingClubSettings,
    reviewingClaimRequestId,
    resettingClub,
    deletingClub,
    pendingClubAction,
    clubActionConfirmationValue,
    setClubActionConfirmationValue,
    handleResetClub,
    handleUpdateClubSettings: guard(handleUpdateClubSettings),
    handleUploadClubAvatar: guard(handleUploadClubAvatar, true),
    handleRemoveClubAvatar: guard(handleRemoveClubAvatar, true),
    handleDeleteClub,
    closePendingClubAction,
    confirmPendingClubAction: guard(confirmPendingClubAction),
    handleReviewClaimRequest: guard(handleReviewClaimRequest),
  };
}
