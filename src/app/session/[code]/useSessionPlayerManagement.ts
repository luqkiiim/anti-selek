"use client";

import { useEffect, useState } from "react";
import type {
  CommunityUser,
  PreferenceEditorState,
  SessionData,
} from "@/components/session/sessionTypes";
import {
  applyGuestAdded,
  applyPlayerNameUpdate,
  applyPlayerPaused,
  applyPlayerPreferenceUpdate,
  applyPlayerRemoval,
  applyQueuedMatch,
  mergeSessionSnapshot,
} from "./sessionDataMutations";
import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
} from "@/types/enums";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";

interface UseSessionPlayerManagementArgs {
  code: string;
  sessionData: SessionData | null;
  safeJson: (res: Response) => Promise<any>;
  patchSessionData: (updater: (current: SessionData) => SessionData) => void;
  scheduleSessionRefresh: (delay?: number) => void;
  setError: (message: string) => void;
}

function parseCommunityPlayers(data: unknown): CommunityUser[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((player) => {
      if (typeof player !== "object" || player === null) return null;
      const candidate = player as {
        id?: unknown;
        name?: unknown;
        elo?: unknown;
        gender?: unknown;
        partnerPreference?: unknown;
      };

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.elo !== "number"
      ) {
        return null;
      }

      const gender =
        typeof candidate.gender === "string" &&
        [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
          candidate.gender as PlayerGender
        )
          ? (candidate.gender as PlayerGender)
          : PlayerGender.UNSPECIFIED;
      const partnerPreference =
        typeof candidate.partnerPreference === "string" &&
        [PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
          candidate.partnerPreference as PartnerPreference
        )
          ? (candidate.partnerPreference as PartnerPreference)
          : gender === PlayerGender.FEMALE
            ? PartnerPreference.FEMALE_FLEX
            : PartnerPreference.OPEN;

      return {
        id: candidate.id,
        name: candidate.name,
        elo: candidate.elo,
        gender,
        partnerPreference,
      };
    })
    .filter((player): player is CommunityUser => player !== null);
}

export function useSessionPlayerManagement({
  code,
  sessionData,
  safeJson,
  patchSessionData,
  scheduleSessionRefresh,
  setError,
}: UseSessionPlayerManagementArgs) {
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [rosterSearch, setRosterSearch] = useState("");
  const [communityPlayers, setCommunityPlayers] = useState<CommunityUser[]>([]);
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestGender, setGuestGender] = useState<PlayerGender>(PlayerGender.MALE);
  const [guestPreference, setGuestPreference] =
    useState<PartnerPreference>(PartnerPreference.OPEN);
  const [guestInitialElo, setGuestInitialElo] = useState<number>(1000);
  const [addingGuest, setAddingGuest] = useState(false);
  const [savingPreferencesFor, setSavingPreferencesFor] = useState<string | null>(null);
  const [togglingPausePlayerId, setTogglingPausePlayerId] = useState<string | null>(
    null
  );
  const [guestRenameDraft, setGuestRenameDraft] = useState<{
    userId: string;
    currentName: string;
  } | null>(null);
  const [guestRenameInput, setGuestRenameInput] = useState("");
  const [renamingGuestId, setRenamingGuestId] = useState<string | null>(null);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  const [removePlayerDraft, setRemovePlayerDraft] = useState<{
    userId: string;
    playerName: string;
  } | null>(null);
  const [openPreferenceEditor, setOpenPreferenceEditor] =
    useState<PreferenceEditorState | null>(null);

  const togglePreferenceEditor = (userId: string, triggerEl: HTMLElement) => {
    setOpenPreferenceEditor((prev) => {
      if (prev?.userId === userId) return null;

      const rect = triggerEl.getBoundingClientRect();
      const panelWidth = 176;
      const panelHeight =
        sessionData?.mode === SessionMode.MIXICANO ? 220 : 124;
      const margin = 8;
      const openUp = window.innerHeight - rect.bottom < panelHeight + margin;

      const left = Math.min(
        Math.max(margin, rect.right - panelWidth),
        Math.max(margin, window.innerWidth - panelWidth - margin)
      );
      const preferredTop = openUp
        ? rect.top - panelHeight - margin
        : rect.bottom + margin;
      const top = Math.min(
        Math.max(margin, preferredTop),
        Math.max(margin, window.innerHeight - panelHeight - margin)
      );

      return { userId, top, left };
    });
  };

  useEffect(() => {
    if (!openPreferenceEditor) return;

    const close = () => setOpenPreferenceEditor(null);
    const attachListenerTimeout = window.setTimeout(() => {
      window.addEventListener("resize", close);
      window.addEventListener("scroll", close, true);
    }, 0);

    return () => {
      window.clearTimeout(attachListenerTimeout);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [openPreferenceEditor]);

  const fetchCommunityPlayers = async () => {
    if (!sessionData?.communityId) return;
    try {
      const res = await fetch(
        `/api/communities/${sessionData.communityId}/members`
      );
      const data = await safeJson(res);
      if (res.ok) {
        setCommunityPlayers(parseCommunityPlayers(data));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const resetGuestInputs = () => {
    setGuestName("");
    setGuestGender(PlayerGender.MALE);
    setGuestPreference(PartnerPreference.OPEN);
    setGuestInitialElo(1000);
  };

  const resetRosterInputs = () => {
    setRosterSearch("");
    resetGuestInputs();
  };

  const closeRosterModal = () => {
    resetRosterInputs();
    setShowRosterModal(false);
  };

  const openRosterModal = () => {
    void fetchCommunityPlayers();
    resetRosterInputs();
    setShowRosterModal(true);
  };

  const handleGuestGenderChange = (nextGender: PlayerGender) => {
    setGuestGender(nextGender);
    setGuestPreference(
      nextGender === PlayerGender.FEMALE
        ? PartnerPreference.FEMALE_FLEX
        : PartnerPreference.OPEN
    );
  };

  const requestRemovePlayerFromSession = (
    userId: string,
    playerName: string
  ) => {
    setOpenPreferenceEditor(null);
    setError("");
    setRemovePlayerDraft({ userId, playerName });
  };

  const requestRenameGuest = (userId: string, currentName: string) => {
    setOpenPreferenceEditor(null);
    setError("");
    setGuestRenameDraft({ userId, currentName });
    setGuestRenameInput(currentName);
  };

  const closeGuestRenameModal = () => {
    if (guestRenameDraft && renamingGuestId === guestRenameDraft.userId) {
      return;
    }

    setGuestRenameDraft(null);
    setGuestRenameInput("");
  };

  const closeRemovePlayerConfirm = () => {
    if (removePlayerDraft && removingPlayerId === removePlayerDraft.userId) {
      return;
    }
    setRemovePlayerDraft(null);
  };

  const togglePausePlayer = async (
    userId: string,
    currentPaused: boolean
  ) => {
    if (togglingPausePlayerId) return;

    setTogglingPausePlayerId(userId);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/pause-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isPaused: !currentPaused }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        patchSessionData((current) => {
          let updated = applyPlayerPaused(
            current,
            userId,
            !currentPaused,
            typeof data.ladderEntryAt === "string" ? data.ladderEntryAt : undefined
          );

          if (data.queuedMatchAffected) {
            updated = applyQueuedMatch(updated, data.queuedMatch ?? null);
          }

          return updated;
        });
        scheduleSessionRefresh();
      } else {
        setError(data.error || "Failed to update player status");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update player status");
    } finally {
      setTogglingPausePlayerId(null);
    }
  };

  const pauseQueuedPlayer = async (userId: string) => {
    await togglePausePlayer(userId, false);
  };

  const renameGuestInSession = async () => {
    if (!guestRenameDraft) return;

    const nextName = guestRenameInput.trim();
    if (nextName.length < 2) {
      setError("Guest name must be at least 2 characters");
      return;
    }

    setRenamingGuestId(guestRenameDraft.userId);
    setError("");

    try {
      const res = await fetch(
        `/api/sessions/${code}/players/${guestRenameDraft.userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextName }),
        }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to rename guest");
        return;
      }

      patchSessionData((current) =>
        applyPlayerNameUpdate(
          current,
          guestRenameDraft.userId,
          typeof data.name === "string" ? data.name : nextName
        )
      );
      setGuestRenameDraft(null);
      setGuestRenameInput("");
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to rename guest");
    } finally {
      setRenamingGuestId(null);
    }
  };

  const removePlayerFromSession = async () => {
    if (!removePlayerDraft) return;

    setRemovingPlayerId(removePlayerDraft.userId);
    try {
      const res = await fetch(
        `/api/sessions/${code}/players/${removePlayerDraft.userId}`,
        {
          method: "DELETE",
        }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to remove player");
        return;
      }

      const removedUserId = removePlayerDraft.userId;
      setRemovePlayerDraft(null);
      patchSessionData((current) => applyPlayerRemoval(current, removedUserId));
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to remove player");
    } finally {
      setRemovingPlayerId(null);
    }
  };

  const addPlayerToSession = async (userId: string) => {
    setAddingPlayerId(userId);
    try {
      const adminRes = await fetch(`/api/sessions/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (adminRes.ok) {
        const data = await safeJson(adminRes);
        patchSessionData((current) => mergeSessionSnapshot(current, data));
        scheduleSessionRefresh();
      } else {
        const data = await safeJson(adminRes);
        setError(data.error || "Failed to add player");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingPlayerId(null);
    }
  };

  const addGuestToSession = async () => {
    const name = guestName.trim();
    if (!name) return;
    if (
      sessionData?.mode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guestGender)
    ) {
      setError(
        `${getSessionModeLabel(SessionMode.MIXICANO)} requires selecting MALE/FEMALE for guests`
      );
      return;
    }

    setAddingGuest(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${code}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          initialElo: guestInitialElo,
          gender: guestGender,
          partnerPreference: guestPreference,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to add guest");
        return;
      }

      resetGuestInputs();
      patchSessionData((current) => applyGuestAdded(current, data));
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to add guest");
    } finally {
      setAddingGuest(false);
    }
  };

  const updatePlayerPreference = async (
    userId: string,
    nextGender: PlayerGender,
    nextPreference: PartnerPreference
  ) => {
    setSavingPreferencesFor(userId);
    setError("");
    try {
      const res = await fetch(
        `/api/sessions/${code}/players/${userId}/preferences`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gender: nextGender,
            partnerPreference: nextPreference,
          }),
        }
      );
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to update preference");
        return;
      }
      patchSessionData((current) => applyPlayerPreferenceUpdate(current, data));
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Failed to update preference");
    } finally {
      setSavingPreferencesFor(null);
    }
  };

  return {
    showRosterModal,
    rosterSearch,
    communityPlayers,
    addingPlayerId,
    guestName,
    guestGender,
    guestPreference,
    guestInitialElo,
    addingGuest,
    savingPreferencesFor,
    togglingPausePlayerId,
    guestRenameDraft,
    guestRenameInput,
    renamingGuestId,
    removingPlayerId,
    removePlayerDraft,
    openPreferenceEditor,
    setRosterSearch,
    setGuestName,
    setGuestPreference,
    setGuestInitialElo,
    setGuestRenameInput,
    setOpenPreferenceEditor,
    togglePreferenceEditor,
    openRosterModal,
    closeRosterModal,
    requestRenameGuest,
    closeGuestRenameModal,
    handleGuestGenderChange,
    addPlayerToSession,
    addGuestToSession,
    togglePausePlayer,
    pauseQueuedPlayer,
    renameGuestInSession,
    requestRemovePlayerFromSession,
    closeRemovePlayerConfirm,
    removePlayerFromSession,
    updatePlayerPreference,
  };
}
