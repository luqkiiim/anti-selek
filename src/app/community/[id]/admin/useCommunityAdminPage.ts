"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import type {
  CommunityAdminClaimRequest,
  CommunityAdminCommunity,
  CommunityAdminPlayer,
  CommunityAdminSection,
} from "@/components/community-admin/communityAdminTypes";
import {
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";
import { getCommunityAdminGenderPillLabel } from "@/components/community-admin/communityAdminDisplay";

export function useCommunityAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const communityId = typeof params.id === "string" ? params.id : "";

  const [community, setCommunity] = useState<CommunityAdminCommunity | null>(
    null
  );
  const [players, setPlayers] = useState<CommunityAdminPlayer[]>([]);
  const [claimRequests, setClaimRequests] = useState<
    CommunityAdminClaimRequest[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [communityNameInput, setCommunityNameInput] = useState("");
  const [communityPasswordInput, setCommunityPasswordInput] = useState("");
  const [savingCommunitySettings, setSavingCommunitySettings] = useState(false);

  const [activeSection, setActiveSection] =
    useState<CommunityAdminSection>("players");
  const [playerSearch, setPlayerSearch] = useState("");

  const [isCreatePlayerOpen, setIsCreatePlayerOpen] = useState(false);
  const [name, setName] = useState("");
  const [newPlayerGender, setNewPlayerGender] = useState<PlayerGender>(
    PlayerGender.MALE
  );

  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorRating, setEditorRating] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const [reviewingClaimRequestId, setReviewingClaimRequestId] = useState<
    string | null
  >(null);
  const [resettingCommunity, setResettingCommunity] = useState(false);
  const [deletingCommunity, setDeletingCommunity] = useState(false);

  const [passwordResetTarget, setPasswordResetTarget] =
    useState<CommunityAdminPlayer | null>(null);
  const [passwordResetValue, setPasswordResetValue] = useState("");
  const [passwordResetConfirm, setPasswordResetConfirm] = useState("");
  const [passwordResetError, setPasswordResetError] = useState("");
  const [savingPasswordReset, setSavingPasswordReset] = useState(false);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: "Invalid server response" };
    }
  };

  const fetchCommunityAndPlayers = useCallback(async () => {
    if (!communityId) return;

    const communitiesRes = await fetch("/api/communities");
    const communitiesData = await safeJson(communitiesRes);
    if (!communitiesRes.ok) {
      throw new Error(communitiesData.error || "Failed to load communities");
    }

    const list = Array.isArray(communitiesData)
      ? (communitiesData as CommunityAdminCommunity[])
      : [];
    const currentCommunity =
      list.find((item) => item.id === communityId) || null;
    if (!currentCommunity) {
      throw new Error("Community not found or access denied");
    }
    if (currentCommunity.role !== "ADMIN") {
      router.replace(`/community/${communityId}`);
      throw new Error("Only community admins can access this page");
    }
    setCommunity(currentCommunity);

    const [playersRes, claimRequestsRes] = await Promise.all([
      fetch(`/api/communities/${communityId}/members`),
      fetch(`/api/communities/${communityId}/claim-requests`),
    ]);
    const [playersData, claimRequestsData] = await Promise.all([
      safeJson(playersRes),
      safeJson(claimRequestsRes),
    ]);

    if (!playersRes.ok) {
      throw new Error(playersData.error || "Failed to load players");
    }
    if (!claimRequestsRes.ok) {
      throw new Error(
        claimRequestsData.error || "Failed to load claim requests"
      );
    }

    setPlayers(Array.isArray(playersData) ? playersData : []);
    setClaimRequests(Array.isArray(claimRequestsData) ? claimRequestsData : []);
  }, [communityId, router]);

  useEffect(() => {
    if (!community) return;
    setCommunityNameInput((prev) =>
      prev.trim().length === 0 || prev === community.name ? community.name : prev
    );
  }, [community]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
      return;
    }

    if (status !== "authenticated" || !communityId) return;

    void (async () => {
      try {
        setLoading(true);
        setError("");
        await fetchCommunityAndPlayers();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load admin page");
      } finally {
        setLoading(false);
      }
    })();
  }, [communityId, fetchCommunityAndPlayers, router, status]);

  const openCreatePlayerModal = () => {
    setName("");
    setNewPlayerGender(PlayerGender.MALE);
    setIsCreatePlayerOpen(true);
  };

  const closeCreatePlayerModal = () => {
    setIsCreatePlayerOpen(false);
  };

  const openPlayerEditor = (player: CommunityAdminPlayer) => {
    setEditingPlayerId(player.id);
    setEditorName(player.name);
    setEditorRating(String(player.elo));
    setError("");
    setSuccess("");
  };

  const closePlayerEditor = () => {
    setEditingPlayerId(null);
    setEditorName("");
    setEditorRating("");
    setSavingName(false);
    setSavingRating(false);
    setSavingRole(false);
    setSavingPreferences(false);
  };

  const openPasswordResetModal = (player: CommunityAdminPlayer) => {
    setPasswordResetTarget(player);
    setPasswordResetValue("");
    setPasswordResetConfirm("");
    setPasswordResetError("");
    setError("");
    setSuccess("");
  };

  const closePasswordResetModal = () => {
    setPasswordResetTarget(null);
    setPasswordResetValue("");
    setPasswordResetConfirm("");
    setPasswordResetError("");
    setSavingPasswordReset(false);
  };

  const handleAddPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          gender: newPlayerGender,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to add player");
      }

      setSuccess(`Player profile for "${name}" added to community.`);
      setName("");
      setNewPlayerGender(PlayerGender.MALE);
      setIsCreatePlayerOpen(false);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    }
  };

  const handleSavePlayerName = async (player: CommunityAdminPlayer) => {
    const nextName = editorName.trim();
    if (!nextName || nextName === player.name) {
      setEditorName(player.name);
      return;
    }

    setSavingName(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player name");
      }

      setSuccess(`Player name updated to "${nextName}".`);
      setEditorName(nextName);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update player name"
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePlayerRating = async (player: CommunityAdminPlayer) => {
    const nextRating = parseInt(editorRating, 10);
    if (Number.isNaN(nextRating) || nextRating === player.elo) return;

    setSavingRating(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elo: nextRating }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update rating");
      }

      setSuccess(`${player.name}'s rating updated to ${nextRating}.`);
      setEditorRating(String(nextRating));
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update rating");
    } finally {
      setSavingRating(false);
    }
  };

  const handleRemovePlayer = async (player: CommunityAdminPlayer) => {
    if (!confirm(`Remove ${player.name} from this community?`)) {
      return false;
    }

    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove player");
      }

      setSuccess(`${player.name} removed from community.`);
      closePlayerEditor();
      await fetchCommunityAndPlayers();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
      return false;
    }
  };

  const handleResetPlayerPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordResetTarget) return;

    setError("");
    setSuccess("");
    setPasswordResetError("");

    if (passwordResetValue.trim().length < 8) {
      setPasswordResetError("Password must be at least 8 characters.");
      return;
    }

    if (passwordResetValue !== passwordResetConfirm) {
      setPasswordResetError("Passwords do not match.");
      return;
    }

    setSavingPasswordReset(true);

    try {
      const res = await fetch(
        `/api/communities/${communityId}/members/${passwordResetTarget.id}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: passwordResetValue }),
        }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      setSuccess(
        `Password reset for ${passwordResetTarget.name}. Share the new password with them directly.`
      );
      closePasswordResetModal();
    } catch (err: unknown) {
      setPasswordResetError(
        err instanceof Error ? err.message : "Failed to reset password"
      );
      setSavingPasswordReset(false);
    }
  };

  const handlePromotePlayer = async (player: CommunityAdminPlayer) => {
    if (!confirm(`Promote ${player.name} to admin?`)) {
      return;
    }

    setSavingRole(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to promote player");
      }

      setSuccess(`${player.name} promoted to admin.`);
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to promote player"
      );
    } finally {
      setSavingRole(false);
    }
  };

  const handleUpdatePreferences = async (
    player: CommunityAdminPlayer,
    updates: { gender?: PlayerGender; partnerPreference?: PartnerPreference }
  ) => {
    if (
      updates.gender === undefined &&
      updates.partnerPreference === undefined
    ) {
      return;
    }

    setSavingPreferences(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player preferences");
      }

      setPlayers((prev) =>
        prev.map((item) =>
          item.id === player.id
            ? {
                ...item,
                gender:
                  typeof data.gender === "string"
                    ? (data.gender as PlayerGender)
                    : item.gender,
                partnerPreference:
                  typeof data.partnerPreference === "string"
                    ? (data.partnerPreference as PartnerPreference)
                    : item.partnerPreference,
              }
            : item
        )
      );
      setSuccess("Player preferences updated.");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update player preferences"
      );
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleResetCommunity = async () => {
    const confirmation = prompt(
      "This will DELETE ALL TOURNAMENTS in this community and reset member ratings to 1000. Type 'RESET' to confirm:"
    );
    if (confirmation !== "RESET") {
      if (confirmation !== null) {
        alert("Reset cancelled. You must type RESET exactly.");
      }
      return;
    }

    setError("");
    setSuccess("");
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
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to reset community"
      );
    } finally {
      setResettingCommunity(false);
    }
  };

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
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update community"
      );
    } finally {
      setSavingCommunitySettings(false);
    }
  };

  const handleDeleteCommunity = async () => {
    const confirmation = prompt(
      "This will permanently DELETE this community and all related data. Type 'DELETE' to confirm:"
    );
    if (confirmation !== "DELETE") {
      if (confirmation !== null) {
        alert("Delete cancelled. You must type DELETE exactly.");
      }
      return;
    }

    setError("");
    setSuccess("");
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

      router.push("/");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete community"
      );
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
      await fetchCommunityAndPlayers();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to review claim request"
      );
    } finally {
      setReviewingClaimRequestId(null);
    }
  };

  const claimedPlayersCount = players.filter((player) => player.isClaimed).length;
  const adminPlayersCount = players.filter(
    (player) => player.role === "ADMIN"
  ).length;
  const searchQuery = playerSearch.trim().toLowerCase();
  const filteredPlayers = players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((player) => {
      if (!searchQuery) return true;
      return (
        player.name.toLowerCase().includes(searchQuery) ||
        player.email?.toLowerCase().includes(searchQuery) ||
        getCommunityAdminGenderPillLabel(player).toLowerCase().includes(searchQuery)
      );
    });
  const editingPlayer = editingPlayerId
    ? players.find((player) => player.id === editingPlayerId) ?? null
    : null;

  return {
    status,
    currentUserId: session?.user?.id,
    communityId,
    community,
    players,
    claimRequests,
    loading,
    error,
    success,
    setError,
    setSuccess,
    communityNameInput,
    setCommunityNameInput,
    communityPasswordInput,
    setCommunityPasswordInput,
    savingCommunitySettings,
    activeSection,
    setActiveSection,
    playerSearch,
    setPlayerSearch,
    isCreatePlayerOpen,
    name,
    setName,
    newPlayerGender,
    setNewPlayerGender,
    editingPlayer,
    editorName,
    setEditorName,
    editorRating,
    setEditorRating,
    savingName,
    savingRating,
    savingRole,
    savingPreferences,
    reviewingClaimRequestId,
    resettingCommunity,
    deletingCommunity,
    passwordResetTarget,
    passwordResetValue,
    setPasswordResetValue,
    passwordResetConfirm,
    setPasswordResetConfirm,
    passwordResetError,
    savingPasswordReset,
    claimedPlayersCount,
    adminPlayersCount,
    filteredPlayers,
    fetchCommunityAndPlayers,
    openCreatePlayerModal,
    closeCreatePlayerModal,
    openPlayerEditor,
    closePlayerEditor,
    openPasswordResetModal,
    closePasswordResetModal,
    handleAddPlayer,
    handleSavePlayerName,
    handleSavePlayerRating,
    handleRemovePlayer,
    handleResetPlayerPassword,
    handlePromotePlayer,
    handleUpdatePreferences,
    handleResetCommunity,
    handleUpdateCommunitySettings,
    handleDeleteCommunity,
    handleReviewClaimRequest,
  };
}
