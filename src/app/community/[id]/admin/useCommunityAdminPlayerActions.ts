"use client";

import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { CommunityAdminPlayer } from "@/components/community-admin/communityAdminTypes";
import { MixedSide, PlayerGender } from "@/types/enums";
import { safeJson } from "./communityAdminApi";

interface PendingPlayerAction {
  kind: "remove" | "promote";
  player: CommunityAdminPlayer;
}

export function useCommunityAdminPlayerActions({
  communityId,
  players,
  setPlayers,
  refreshCommunityData,
  setError,
  setSuccess,
}: {
  communityId: string;
  players: CommunityAdminPlayer[];
  setPlayers: Dispatch<SetStateAction<CommunityAdminPlayer[]>>;
  refreshCommunityData: () => Promise<void>;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const [isCreatePlayerOpen, setIsCreatePlayerOpen] = useState(false);
  const [name, setName] = useState("");
  const [newPlayerGender, setNewPlayerGender] = useState<PlayerGender>(
    PlayerGender.MALE
  );
  const [newPlayerMixedSideOverride, setNewPlayerMixedSideOverride] =
    useState<MixedSide | null>(null);

  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorRating, setEditorRating] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [removingPlayer, setRemovingPlayer] = useState(false);

  const [passwordResetTarget, setPasswordResetTarget] =
    useState<CommunityAdminPlayer | null>(null);
  const [passwordResetValue, setPasswordResetValue] = useState("");
  const [passwordResetConfirm, setPasswordResetConfirm] = useState("");
  const [passwordResetError, setPasswordResetError] = useState("");
  const [savingPasswordReset, setSavingPasswordReset] = useState(false);

  const [pendingPlayerAction, setPendingPlayerAction] =
    useState<PendingPlayerAction | null>(null);

  const editingPlayer = useMemo(
    () =>
      editingPlayerId
        ? players.find((player) => player.id === editingPlayerId) ?? null
        : null,
    [editingPlayerId, players]
  );

  const openCreatePlayerModal = () => {
    setName("");
    setNewPlayerGender(PlayerGender.MALE);
    setNewPlayerMixedSideOverride(null);
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
          mixedSideOverride: newPlayerMixedSideOverride,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to add player");
      }

      setSuccess(`Player profile for "${name}" added to community.`);
      setName("");
      setNewPlayerGender(PlayerGender.MALE);
      setNewPlayerMixedSideOverride(null);
      setIsCreatePlayerOpen(false);
      await refreshCommunityData();
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
      await refreshCommunityData();
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
      await refreshCommunityData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update rating");
    } finally {
      setSavingRating(false);
    }
  };

  const requestRemovePlayer = (player: CommunityAdminPlayer) => {
    setError("");
    setSuccess("");
    setPendingPlayerAction({ kind: "remove", player });
  };

  const requestPromotePlayer = (player: CommunityAdminPlayer) => {
    setError("");
    setSuccess("");
    setPendingPlayerAction({ kind: "promote", player });
  };

  const closePendingPlayerAction = () => {
    if (removingPlayer || savingRole) return;
    setPendingPlayerAction(null);
  };

  const confirmPendingPlayerAction = async () => {
    if (!pendingPlayerAction) return false;

    const { kind, player } = pendingPlayerAction;
    setError("");
    setSuccess("");

    if (kind === "remove") {
      setRemovingPlayer(true);
      try {
        const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
          method: "DELETE",
        });
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(data.error || "Failed to remove player");
        }

        setSuccess(`${player.name} removed from community.`);
        setPendingPlayerAction(null);
        closePlayerEditor();
        await refreshCommunityData();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to remove player");
        return false;
      } finally {
        setRemovingPlayer(false);
      }
    }

    setSavingRole(true);
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
      setPendingPlayerAction(null);
      await refreshCommunityData();
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to promote player"
      );
      return false;
    } finally {
      setSavingRole(false);
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

  const handleUpdatePreferences = async (
    player: CommunityAdminPlayer,
    updates: { gender?: PlayerGender; mixedSideOverride?: MixedSide | null }
  ) => {
    if (
      updates.gender === undefined &&
      updates.mixedSideOverride === undefined
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
                    ? data.partnerPreference
                    : item.partnerPreference,
                mixedSideOverride:
                  typeof data.mixedSideOverride === "string"
                    ? (data.mixedSideOverride as MixedSide)
                    : data.mixedSideOverride === null
                      ? null
                      : item.mixedSideOverride,
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

  return {
    isCreatePlayerOpen,
    name,
    setName,
    newPlayerGender,
    setNewPlayerGender,
    newPlayerMixedSideOverride,
    setNewPlayerMixedSideOverride,
    editingPlayer,
    editorName,
    setEditorName,
    editorRating,
    setEditorRating,
    savingName,
    savingRating,
    savingRole,
    savingPreferences,
    removingPlayer,
    passwordResetTarget,
    passwordResetValue,
    setPasswordResetValue,
    passwordResetConfirm,
    setPasswordResetConfirm,
    passwordResetError,
    savingPasswordReset,
    pendingPlayerAction,
    openCreatePlayerModal,
    closeCreatePlayerModal,
    openPlayerEditor,
    closePlayerEditor,
    openPasswordResetModal,
    closePasswordResetModal,
    handleAddPlayer,
    handleSavePlayerName,
    handleSavePlayerRating,
    handleRemovePlayer: requestRemovePlayer,
    requestRemovePlayer,
    handlePromotePlayer: requestPromotePlayer,
    requestPromotePlayer,
    closePendingPlayerAction,
    confirmPendingPlayerAction,
    handleResetPlayerPassword,
    handleUpdatePreferences,
  };
}
