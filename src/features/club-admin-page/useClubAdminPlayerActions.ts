"use client";

import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { ClubAdminPlayer } from "@/components/club-admin/clubAdminTypes";
import {
  ClubRole,
  ClubPlayerStatus,
  MixedSide,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import { useAdminRefresh } from "./useAdminRefresh";
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
  clubId,
  currentPlayerId,
  players,
  setPlayers,
  refreshClubData: refresh,
  onMutationStart,
  router,
  setError,
  setSuccess,
}: {
  clubId: string;
  currentPlayerId?: string | null;
  players: ClubAdminPlayer[];
  setPlayers: Dispatch<SetStateAction<ClubAdminPlayer[]>>;
  refreshClubData: () => Promise<void>;
  onMutationStart?: () => void;
  router: ClubAdminRouter;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const { refreshClubData, refreshWarning, refreshing, retryRefresh, uncertain, request, guard } = useAdminRefresh(refresh, onMutationStart);
  const createLock = useRef(false);
  const [creatingPlayer, setCreatingPlayer] = useState(false);
  const applyMember = (data: Partial<ClubAdminPlayer>) => {
    if (!data.id) return;
    setPlayers(prev => prev.some(item => item.id === data.id)
      ? prev.map(item => item.id === data.id ? { ...item, ...data } : item)
      : [...prev, data as ClubAdminPlayer]);
  };
  const [playerSaveWarning, setPlayerSaveWarning] = useState("");
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
  const [newPlayerPreferredPool, setNewPlayerPreferredPool] =
    useState<SessionPool>(SessionPool.B);

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
    setNewPlayerPreferredPool(SessionPool.B);
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
    if (createLock.current || uncertain) return;
    createLock.current = true;
    setCreatingPlayer(true);
    setError("");
    setSuccess("");

    try {
      const res = await request(`/api/clubs/${clubId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          gender: newPlayerGender,
          mixedSideOverride: newPlayerMixedSideOverride,
          status: newPlayerStatus,
          preferredPool: newPlayerPreferredPool,
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to add player");
      }

      applyMember(data);
      setSuccess(`Player profile for "${name}" added to club.`);
      setName("");
      setNewPlayerGender(PlayerGender.MALE);
      setNewPlayerMixedSideOverride(null);
      setNewPlayerStatus(ClubPlayerStatus.CORE);
      setNewPlayerPreferredPool(SessionPool.B);
      setIsCreatePlayerOpen(false);
      refreshClubData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally { createLock.current = false; setCreatingPlayer(false); }
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
      const res = await request(`/api/clubs/${clubId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player name");
      }

      applyMember(data);
      setSuccess(`Player name updated to "${nextName}".`);
      setEditorName(nextName);
      refreshClubData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update player name"
      );
    } finally {
      setSavingName(false);
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
      const res = await request(`/api/clubs/${clubId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update role");
      }

      applyMember(data);
      setSuccess(successMessage);
      refreshClubData();
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
      `${player.name} can now host and run live tournaments.`
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
        const res = await request(`/api/clubs/${clubId}/members/${player.id}`, {
          method: "DELETE",
        });
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(data.error || "Failed to remove player");
        }

        setPlayers(prev => prev.filter(item => item.id !== player.id));
        const isSelfRemoval = player.id === currentPlayerId;
        setSuccess(
          isSelfRemoval
            ? "You left the club."
            : `${player.name} removed from club.`
        );
        setPendingPlayerAction(null);
        closePlayerEditor();
        if (isSelfRemoval) {
          router.replace(`/club/${clubId}`);
          return true;
        }

        refreshClubData();
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
        const res = await request(`/api/clubs/${clubId}/members/${player.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: pendingPlayerAction.role }),
        });
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(data.error || "Failed to change admin role");
        }

        applyMember(data);
        setSuccess(
          pendingPlayerAction.role === ClubRole.STAFF
            ? `${player.name} changed to staff.`
            : `${player.name} changed to member.`
        );
        setPendingPlayerAction(null);
        refreshClubData();
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
      const res = await request(`/api/clubs/${clubId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to promote player");
      }

      applyMember(data);
      setSuccess(`${player.name} promoted to admin.`);
      setPendingPlayerAction(null);
      refreshClubData();
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
      const res = await request(
        `/api/clubs/${clubId}/members/${passwordResetTarget.id}/password`,
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
      preferredPool?: SessionPool;
    }
  ) => {
    const changed = Object.fromEntries(Object.entries(updates).filter(([key, value]) =>
      value !== undefined && value !== player[key as keyof ClubAdminPlayer] &&
      (!(player.isClaimed && player.id !== currentPlayerId) || !["gender", "mixedSideOverride"].includes(key))
    ));
    if (Object.keys(changed).length === 0) return;

    setSavingPreferences(true);
    setError("");
    setSuccess("");

    try {
      const res = await request(`/api/clubs/${clubId}/members/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changed),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update player preferences");
      }

      applyMember(data);
      setPlayerSaveWarning(Array.isArray(data.warnings) ? data.warnings.map((warning: { message: string }) => warning.message).join(" ") : "");
      refreshClubData();
      const immediateCount =
        typeof data.preferencePropagation?.immediateSessionCount === "number"
          ? data.preferencePropagation.immediateSessionCount
          : 0;
      const deferredCount =
        typeof data.preferencePropagation?.deferredSessionCount === "number"
          ? data.preferencePropagation.deferredSessionCount
          : 0;
      setSuccess(
        updates.preferredPool !== undefined
          ? `Preferred game group updated. ${immediateCount} current tournament${immediateCount === 1 ? "" : "s"} updated now; ${deferredCount} change${deferredCount === 1 ? "" : "s"} will apply after the current match.`
          : "Player preferences updated."
      );
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

    const body = new FormData();
    body.append("avatar", file);
    const res = await request(`/api/users/${encodeURIComponent(player.id)}/avatar?clubId=${encodeURIComponent(clubId)}`, { method: "POST", body });
    const { avatarUrl } = await safeJson(res);
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

    await request(`/api/users/${encodeURIComponent(player.id)}/avatar?clubId=${encodeURIComponent(clubId)}`, { method: "DELETE" });
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
    refreshWarning, refreshing, retryRefresh, uncertain,
    playerSaveWarning,
    creatingPlayer,
    isCreatePlayerOpen,
    name,
    setName,
    newPlayerGender,
    setNewPlayerGender,
    newPlayerMixedSideOverride,
    setNewPlayerMixedSideOverride,
    newPlayerStatus,
    setNewPlayerStatus,
    newPlayerPreferredPool,
    setNewPlayerPreferredPool,
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
    handleAddPlayer: guard(handleAddPlayer),
    handleSavePlayerName: guard(handleSavePlayerName),
    handleRemovePlayer: requestRemovePlayer,
    requestRemovePlayer,
    handlePromotePlayer: requestPromotePlayer,
    handleDemoteAdmin: requestDemoteAdmin,
    handleGrantStaff: guard(handleGrantStaff),
    handleRevokeStaff: guard(handleRevokeStaff),
    requestPromotePlayer,
    closePendingPlayerAction,
    confirmPendingPlayerAction: guard(confirmPendingPlayerAction),
    handleResetPlayerPassword: guard(handleResetPlayerPassword),
    handleUpdatePreferences: guard(handleUpdatePreferences),
    handleUploadPlayerAvatar: guard(handleUploadPlayerAvatar, true),
    handleRemovePlayerAvatar: guard(handleRemovePlayerAvatar, true),
  };
}
