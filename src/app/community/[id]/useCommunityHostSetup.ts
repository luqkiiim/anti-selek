"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  CommunityGuestConfig,
  CommunityPageMember,
} from "@/components/community/communityTypes";
import {
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { safeJson } from "./communityPageApi";
import {
  MixedSide,
  PlayerGender,
  SessionMode,
  SessionPool,
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
  const [isTestSession, setIsTestSession] = useState(false);
  const [courtCount, setCourtCount] = useState(3);
  const [poolsEnabled, setPoolsEnabled] = useState(false);
  const [poolAName, setPoolAName] = useState("Open");
  const [poolBName, setPoolBName] = useState("Regular");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedPlayerPools, setSelectedPlayerPools] = useState<
    Record<string, SessionPool>
  >({});
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestGenderInput, setGuestGenderInput] = useState<PlayerGender>(
    PlayerGender.MALE
  );
  const [guestMixedSideOverrideInput, setGuestMixedSideOverrideInput] =
    useState<MixedSide | null>(null);
  const [guestPoolInput, setGuestPoolInput] = useState<SessionPool>(
    SessionPool.A
  );
  const [guestConfigs, setGuestConfigs] = useState<CommunityGuestConfig[]>([]);
  const [creatingSession, setCreatingSession] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");

  useEffect(() => {
    setNewSessionName("");
    setSessionType(SessionType.POINTS);
    setSessionMode(SessionMode.MEXICANO);
    setIsTestSession(false);
    setCourtCount(3);
    setPoolsEnabled(false);
    setPoolAName("Open");
    setPoolBName("Regular");
    setSelectedPlayerIds([]);
    setSelectedPlayerPools({});
    setGuestConfigs([]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestMixedSideOverrideInput(null);
    setGuestPoolInput(SessionPool.A);
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
          isTest: isTestSession,
          courtCount,
          communityId,
          playerIds: selectedPlayerIds,
          playerConfigs: selectedPlayerIds.map((userId) => ({
            userId,
            pool: poolsEnabled
              ? (selectedPlayerPools[userId] ?? SessionPool.A)
              : SessionPool.A,
          })),
          guestConfigs,
          poolsEnabled,
          poolAName,
          poolBName,
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
      setGuestPoolInput(SessionPool.A);
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
    const isSelected = selectedPlayerIds.includes(playerId);
    if (!isSelected) {
      setSelectedPlayerPools((current) =>
        current[playerId]
          ? current
          : {
              ...current,
              [playerId]: SessionPool.A,
            }
      );
    }

    setSelectedPlayerIds((prev) =>
      isSelected ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );
  };

  const toggleAllPlayers = () => {
    const allOtherIds = selectablePlayers.map((player) => player.id);
    if (selectedPlayerIds.length === allOtherIds.length) {
      setSelectedPlayerIds([]);
      return;
    }
    setSelectedPlayerPools((current) => {
      const next = { ...current };
      for (const playerId of allOtherIds) {
        if (!next[playerId]) {
          next[playerId] = SessionPool.A;
        }
      }
      return next;
    });
    setSelectedPlayerIds(allOtherIds);
  };

  const updateSelectedPlayerPool = (playerId: string, pool: SessionPool) => {
    setSelectedPlayerPools((current) => ({
      ...current,
      [playerId]: pool,
    }));
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
        pool: poolsEnabled ? guestPoolInput : SessionPool.A,
        initialElo: DEFAULT_GUEST_INITIAL_ELO,
      },
    ]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestMixedSideOverrideInput(null);
    setGuestPoolInput(SessionPool.A);
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

  const selectedPoolCounts = selectedPlayerIds.reduce(
    (counts, playerId) => {
      const pool = selectedPlayerPools[playerId] ?? SessionPool.A;
      counts[pool] += 1;
      return counts;
    },
    {
      [SessionPool.A]: 0,
      [SessionPool.B]: 0,
    }
  );

  const guestPoolCounts = guestConfigs.reduce(
    (counts, guest) => {
      counts[guest.pool] += 1;
      return counts;
    },
    {
      [SessionPool.A]: 0,
      [SessionPool.B]: 0,
    }
  );

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
    isTestSession,
    setIsTestSession,
    courtCount,
    setCourtCount,
    poolsEnabled,
    setPoolsEnabled,
    poolAName,
    setPoolAName,
    poolBName,
    setPoolBName,
    selectedPlayerIds,
    selectedPlayerPools,
    selectedPoolCounts,
    guestNameInput,
    setGuestNameInput,
    guestGenderInput,
    guestMixedSideOverrideInput,
    setGuestMixedSideOverrideInput,
    guestPoolInput,
    setGuestPoolInput,
    guestConfigs,
    guestPoolCounts,
    creatingSession,
    showPlayersModal,
    showGuestsModal,
    playerSearch,
    setPlayerSearch,
    createSession,
    togglePlayerSelection,
    toggleAllPlayers,
    updateSelectedPlayerPool,
    addGuestName,
    removeGuestName,
    handleGuestGenderChange,
    openPlayersModal,
    closePlayersModal,
    openGuestsModal,
    closeGuestsModal,
  };
}
