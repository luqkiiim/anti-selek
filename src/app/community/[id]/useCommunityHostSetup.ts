"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  CommunityGuestConfig,
  CommunityPageMember,
} from "@/components/community/communityTypes";
import {
  getMixedSideOverrideOptionForGender,
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { safeJson } from "./communityPageApi";
import {
  MixedSide,
  PlayerGender,
  SessionMode,
  SessionType,
} from "@/types/enums";

const DEFAULT_GUEST_INITIAL_ELO = 1000;

interface CommunityPageRouter {
  push: (href: string) => void;
}

export function useCommunityHostSetup({
  communityId,
  router,
  selectablePlayers,
  mixedModeLabel,
  setError,
  setSuccess,
}: {
  communityId: string;
  router: CommunityPageRouter;
  selectablePlayers: CommunityPageMember[];
  mixedModeLabel: string;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const [newSessionName, setNewSessionName] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>(
    SessionType.POINTS
  );
  const [sessionMode, setSessionMode] = useState<SessionMode>(
    SessionMode.MEXICANO
  );
  const [courtCount, setCourtCount] = useState(3);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestGenderInput, setGuestGenderInput] = useState<PlayerGender>(
    PlayerGender.MALE
  );
  const [guestMixedSideOverrideInput, setGuestMixedSideOverrideInput] =
    useState<MixedSide | null>(null);
  const [guestConfigs, setGuestConfigs] = useState<CommunityGuestConfig[]>([]);
  const [creatingSession, setCreatingSession] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");

  useEffect(() => {
    setNewSessionName("");
    setSessionType(SessionType.POINTS);
    setSessionMode(SessionMode.MEXICANO);
    setCourtCount(3);
    setSelectedPlayerIds([]);
    setGuestConfigs([]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestMixedSideOverrideInput(null);
    setPlayerSearch("");
    setShowPlayersModal(false);
    setShowGuestsModal(false);
  }, [communityId]);

  const createSession = async () => {
    if (!newSessionName.trim() || !communityId) return;

    if (sessionMode === SessionMode.MIXICANO) {
      const invalidGuest = guestConfigs.find(
        (guest) =>
          ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guest.gender)
      );
      if (invalidGuest) {
        setError(
          `${mixedModeLabel} requires MALE/FEMALE gender for guest ${invalidGuest.name}`
        );
        return;
      }
    }

    setCreatingSession(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSessionName,
          type: sessionType,
          mode: sessionMode,
          courtCount,
          communityId,
          playerIds: selectedPlayerIds,
          guestConfigs,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to create tournament");
        return;
      }

      setNewSessionName("");
      setSelectedPlayerIds([]);
      setGuestConfigs([]);
      setGuestNameInput("");
      setGuestGenderInput(PlayerGender.MALE);
      setGuestMixedSideOverrideInput(null);
      setCourtCount(3);
      router.push(`/session/${data.code}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create tournament"
      );
    } finally {
      setCreatingSession(false);
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const toggleAllPlayers = () => {
    const allOtherIds = selectablePlayers.map((player) => player.id);
    if (selectedPlayerIds.length === allOtherIds.length) {
      setSelectedPlayerIds([]);
      return;
    }
    setSelectedPlayerIds(allOtherIds);
  };

  const addGuestName = () => {
    const trimmed = guestNameInput.trim();
    if (!trimmed) return;
    if (
      sessionMode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guestGenderInput)
    ) {
      setError(
        `Choose MALE/FEMALE for guest before adding in ${mixedModeLabel}`
      );
      return;
    }
    if (
      guestConfigs.some(
        (guest) => guest.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setGuestNameInput("");
      return;
    }
    const resolvedMixedState = resolveMixedSideState({
      gender: guestGenderInput,
      mixedSideOverride: guestMixedSideOverrideInput,
    });
    setGuestConfigs((prev) => [
      ...prev,
      {
        name: trimmed,
        gender: guestGenderInput,
        partnerPreference: resolvedMixedState.partnerPreference,
        mixedSideOverride: resolvedMixedState.mixedSideOverride,
        initialElo: DEFAULT_GUEST_INITIAL_ELO,
      },
    ]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestMixedSideOverrideInput(null);
  };

  const removeGuestName = (nameToRemove: string) => {
    setGuestConfigs((prev) =>
      prev.filter((guest) => guest.name !== nameToRemove)
    );
  };

  const handleGuestGenderChange = (nextGender: PlayerGender) => {
    setGuestGenderInput(nextGender);
    setGuestMixedSideOverrideInput(null);
  };

  const openPlayersModal = () => {
    setShowPlayersModal(true);
  };

  const closePlayersModal = () => {
    setShowPlayersModal(false);
    setPlayerSearch("");
  };

  const openGuestsModal = () => {
    setShowGuestsModal(true);
  };

  const closeGuestsModal = () => {
    setShowGuestsModal(false);
    setGuestNameInput("");
  };

  return {
    newSessionName,
    setNewSessionName,
    sessionType,
    setSessionType,
    sessionMode,
    setSessionMode,
    courtCount,
    setCourtCount,
    selectedPlayerIds,
    guestNameInput,
    setGuestNameInput,
    guestGenderInput,
    guestMixedSideOverrideInput,
    setGuestMixedSideOverrideInput,
    guestConfigs,
    creatingSession,
    showPlayersModal,
    showGuestsModal,
    playerSearch,
    setPlayerSearch,
    createSession,
    togglePlayerSelection,
    toggleAllPlayers,
    addGuestName,
    removeGuestName,
    handleGuestGenderChange,
    openPlayersModal,
    closePlayersModal,
    openGuestsModal,
    closeGuestsModal,
  };
}
