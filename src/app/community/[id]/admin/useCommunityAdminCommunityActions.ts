"use client";

import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type {
  CommunityAdminClaimRequest,
  CommunityAdminCommunity,
} from "@/components/community-admin/communityAdminTypes";
import { safeJson } from "./communityAdminApi";

interface CommunityAdminRouter {
  push: (href: string) => void;
}

interface PendingCommunityAction {
  kind: "reset" | "delete";
}

export function useCommunityAdminCommunityActions({
  communityId,
  community,
  refreshCommunityData,
  router,
  setError,
  setSuccess,
}: {
  communityId: string;
  community: CommunityAdminCommunity | null;
  refreshCommunityData: () => Promise<void>;
  router: CommunityAdminRouter;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const [communityNameInput, setCommunityNameInput] = useState("");
  const [communityPasswordInput, setCommunityPasswordInput] = useState("");
  const [savingCommunitySettings, setSavingCommunitySettings] = useState(false);
  const [reviewingClaimRequestId, setReviewingClaimRequestId] = useState<
    string | null
  >(null);
  const [resettingCommunity, setResettingCommunity] = useState(false);
  const [deletingCommunity, setDeletingCommunity] = useState(false);
  const [pendingCommunityAction, setPendingCommunityAction] =
    useState<PendingCommunityAction | null>(null);
  const [communityActionConfirmationValue, setCommunityActionConfirmationValue] =
    useState("");

  useEffect(() => {
    if (!community) return;
    setCommunityNameInput((prev) =>
      prev.trim().length === 0 || prev === community.name ? community.name : prev
    );
  }, [community]);

  const handleUpdateCommunitySettings = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!community) return;

    const trimmedName = communityNameInput.trim();
    const nextPassword = communityPasswordInput;
    const hasNameChange =
      trimmedName.length > 0 && trimmedName !== community.name;
    const hasPasswordChange = nextPassword.length > 0;

    setError("");
    setSuccess("");

    if (trimmedName.length < 3) {
      setError("Community name must be at least 3 characters.");
      return;
    }
    if (hasPasswordChange && nextPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (!hasNameChange && !hasPasswordChange) {
      setSuccess("No changes to save.");
      return;
    }

    setSavingCommunitySettings(true);

    try {
      const body: { name?: string; password?: string } = {};
      if (hasNameChange) body.name = trimmedName;
      if (hasPasswordChange) body.password = nextPassword;

      const res = await fetch(`/api/communities/${communityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update community");
      }

      setCommunityPasswordInput("");
      setSuccess("Community settings updated.");
      await refreshCommunityData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update community"
      );
    } finally {
      setSavingCommunitySettings(false);
    }
  };

  const handleResetCommunity = () => {
    setError("");
    setSuccess("");
    setCommunityActionConfirmationValue("");
    setPendingCommunityAction({ kind: "reset" });
  };

  const handleDeleteCommunity = () => {
    setError("");
    setSuccess("");
    setCommunityActionConfirmationValue("");
    setPendingCommunityAction({ kind: "delete" });
  };

  const closePendingCommunityAction = () => {
    if (resettingCommunity || deletingCommunity) return;
    setPendingCommunityAction(null);
    setCommunityActionConfirmationValue("");
  };

  const confirmPendingCommunityAction = async () => {
    if (!pendingCommunityAction) return false;

    setError("");
    setSuccess("");

    if (pendingCommunityAction.kind === "reset") {
      setResettingCommunity(true);
      try {
        const res = await fetch(`/api/communities/${communityId}/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: "RESET" }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(data.error || "Failed to reset community");
        }

        setSuccess("Community reset successful.");
        setPendingCommunityAction(null);
        setCommunityActionConfirmationValue("");
        await refreshCommunityData();
        return true;
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to reset community"
        );
        return false;
      } finally {
        setResettingCommunity(false);
      }
    }

    setDeletingCommunity(true);
    try {
      const res = await fetch(`/api/communities/${communityId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete community");
      }

      setPendingCommunityAction(null);
      setCommunityActionConfirmationValue("");
      router.push("/");
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete community"
      );
      return false;
    } finally {
      setDeletingCommunity(false);
    }
  };

  const handleReviewClaimRequest = async (
    claimRequest: CommunityAdminClaimRequest,
    action: "APPROVE" | "REJECT"
  ) => {
    setReviewingClaimRequestId(claimRequest.id);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(
        `/api/communities/${communityId}/claim-requests/${claimRequest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
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
      await refreshCommunityData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to review claim request"
      );
    } finally {
      setReviewingClaimRequestId(null);
    }
  };

  return {
    communityNameInput,
    setCommunityNameInput,
    communityPasswordInput,
    setCommunityPasswordInput,
    savingCommunitySettings,
    reviewingClaimRequestId,
    resettingCommunity,
    deletingCommunity,
    pendingCommunityAction,
    communityActionConfirmationValue,
    setCommunityActionConfirmationValue,
    handleResetCommunity,
    handleUpdateCommunitySettings,
    handleDeleteCommunity,
    closePendingCommunityAction,
    confirmPendingCommunityAction,
    handleReviewClaimRequest,
  };
}
