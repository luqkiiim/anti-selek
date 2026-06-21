"use client";

import {
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { ClubAdminPlayer } from "@/components/club-admin/clubAdminTypes";
import { deleteUserAvatar, uploadUserAvatar } from "@/lib/avatarClient";
import {
  ClubRole,
  ClubPlayerStatus,
  MixedSide,
  PlayerGender,
} from "@/types/enums";
import { safeJson } from "./clubAdminApi";

interface PendingPlayerAction {
  kind: "remove" | "promote" | "demote-admin";
  player: ClubAdminPlayer;
  role?: ClubRole.STAFF | ClubRole.MEMBER;
}

interface ClubAdminRouter {
  replace: (href: string) => void;
}

export function useClubAdminPlayerActions({
  communityId,
  currentUserId,
  players,
  setPlayers,
  refreshClubData,
  router,
  setError,
  setSuccess,
}: {
  communityId: string;
  currentUserId?: string | null;
  players: ClubAdminPlayer[];
  setPlayers: Dispatch<SetStateAction<ClubAdminPlayer[]>>;
  refreshClubData: () => Promise<void>;
  router: ClubAdminRouter;
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
  const [newPlayerStatus, setNewPlayerStatus] = useState<ClubPlayerStatus>(
    ClubPlayerStatus.CORE
  );

  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorRating, setEditorRating] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [removingPlayer, setRemovingPlayer] = useState(false);

  const [passwordResetTarget, setPasswordResetTarget] =
    useState<ClubAdminPlayer | null>(null);
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
    setNewPlayerStatus(ClubPlayerStatus.CORE);
    setIsCreatePlayerOpen(true);
  };

  const closeCreatePlayerModal = () => {
    setIsCreatePlayerOpen(false);
  };

  const openPlayerEditor = (player: ClubAdminPlayer) => {
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

  const openPasswordResetModal = (player: ClubAdminPlayer) => {
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
          status: newPlayerStatus,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to add player");
      }

      setSuccess(`Player profile for "${name}" added to club.`);
      setName("");
      setNewPlayerGender(PlayerGender.MALE);
      setNewPlayerMixedSideOverride(null);
      setNewPlayerStatus(ClubPlayerStatus.CORE);
      setIsCreatePlayerOpen(false);
      await refreshClubData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    }
  };

  const handleSavePlayerName = async (player: ClubAdminPlayer) => {
    if (player.isClaimed) {
      setError("Claimed members manage their own account name.");
      return;
    }

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
      await refreshClubData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update player name"
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePlayerRating = async (player: ClubAdminPlayer) => {
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
      await refreshClubData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update rating");
    } finally {
      setSavingRating(false);
    }
  };

  const requestRemovePlayer = (player: ClubAdminPlayer) => {
    setError("");
    setSuccess("");
    setPendingPlayerAction({ kind: "remove", player });
  };

  const requestPromotePlayer = (player: ClubAdminPlayer) => {
    setError("");
    setSuccess("");
    setPendingPlayerAction({ kind: "promote", player });
  };

  const requestDemoteAdmin = (
    player: ClubAdminPlayer,
    role: ClubRole.STAFF | ClubRole.MEMBER
  ) => {
    setError("");
    setSuccess("");
    setPendingPlayerAction({ kind: "demote-admin", player, role });
  };

  const updatePlayerRole = async (
    player: ClubAdminPlayer,
    role: ClubRole.STAFF | ClubRole.MEMBER,
    successMessage: string
  ) => {
    setSavingRole(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update role");
      }

      setPlayers((prev) =>
        prev.map((item) =>
          item.id === player.id
            ? {
                ...item,
                role: data.role === ClubRole.STAFF ? "STAFF" : "MEMBER",
              }
            : item
        )
      );
      setSuccess(successMessage);
      await refreshClubData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingRole(false);
    }
  };

  const handleGrantStaff = (player: ClubAdminPlayer) =>
    updatePlayerRole(
      player,
      ClubRole.STAFF,
      `${player.name} can now host and run live sessions.`
    );

  const handleRevokeStaff = (player: ClubAdminPlayer) =>
    updatePlayerRole(
      player,
      ClubRole.MEMBER,
      `${player.name} is back to member access.`
    );

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

        const isSelfRemoval = player.id === currentUserId;
        setSuccess(
          isSelfRemoval
            ? "You left the club."
            : `${player.name} removed from club.`
        );
        setPendingPlayerAction(null);
        closePlayerEditor();
        if (isSelfRemoval) {
          router.replace(`/community/${communityId}`);
          return true;
        }

        await refreshClubData();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to remove player");
        return false;
      } finally {
        setRemovingPlayer(false);
      }
    }

    if (kind === "demote-admin") {
      if (!pendingPlayerAction.role) return false;

      setSavingRole(true);
      try {
        const res = await fetch(`/api/communities/${communityId}/members/${player.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: pendingPlayerAction.role }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(data.error || "Failed to change admin role");
        }

        setSuccess(
          pendingPlayerAction.role === ClubRole.STAFF
            ? `${player.name} changed to staff.`
            : `${player.name} changed to member.`
        );
        setPendingPlayerAction(null);
        await refreshClubData();
        return true;
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to change admin role"
        );
        return false;
      } finally {
        setSavingRole(false);
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
      await refreshClubData();
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
        `Emergency password reset for ${passwordResetTarget.name}. Share the new password securely.`
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
    player: ClubAdminPlayer,
    updates: {
      gender?: PlayerGender;
      mixedSideOverride?: MixedSide | null;
      status?: ClubPlayerStatus;
    }
  ) => {
    if (
      updates.gender === undefined &&
      updates.mixedSideOverride === undefined &&
      updates.status === undefined
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
                status:
                  data.status === ClubPlayerStatus.OCCASIONAL
                    ? ClubPlayerStatus.OCCASIONAL
                    : data.status === ClubPlayerStatus.CORE
                      ? ClubPlayerStatus.CORE
                      : item.status,
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

  const handleUploadPlayerAvatar = async (
    player: ClubAdminPlayer,
    file: File
  ) => {
    setError("");
    setSuccess("");

    const { avatarUrl } = await uploadUserAvatar(player.id, file, communityId);
    setPlayers((prev) =>
      prev.map((item) =>
        item.id === player.id
          ? {
              ...item,
              avatarUrl,
            }
          : item
      )
    );
    setSuccess(`${player.name}'s profile photo updated.`);
  };

  const handleRemovePlayerAvatar = async (player: ClubAdminPlayer) => {
    setError("");
    setSuccess("");

    await deleteUserAvatar(player.id, communityId);
    setPlayers((prev) =>
      prev.map((item) =>
        item.id === player.id
          ? {
              ...item,
              avatarUrl: null,
            }
          : item
      )
    );
    setSuccess(`${player.name}'s profile photo removed.`);
  };

  return {
    isCreatePlayerOpen,
    name,
    setName,
    newPlayerGender,
    setNewPlayerGender,
    newPlayerMixedSideOverride,
    setNewPlayerMixedSideOverride,
    newPlayerStatus,
    setNewPlayerStatus,
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
    handleDemoteAdmin: requestDemoteAdmin,
    handleGrantStaff,
    handleRevokeStaff,
    requestPromotePlayer,
    closePendingPlayerAction,
    confirmPendingPlayerAction,
    handleResetPlayerPassword,
    handleUpdatePreferences,
    handleUploadPlayerAvatar,
    handleRemovePlayerAvatar,
  };
}
