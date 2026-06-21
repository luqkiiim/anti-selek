"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  ClubCollabCandidate,
  ClubGuestConfig,
  ClubPageMember,
} from "@/components/club/clubTypes";
import {
  resolveMixedSideState,
} from "@/lib/mixedSide";
import { safeJson } from "./clubPageApi";
import {
  MixedSide,
  PlayerGender,
  SessionBalanceMetric,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionPool,
  SessionScoringType,
} from "@/types/enums";

const DEFAULT_GUEST_INITIAL_ELO = 1000;
const DEFAULT_COURT_COUNT = 2;

interface ClubPageRouter {
  push: (href: string) => void;
}

export function useClubHostSetup({
  clubId,
  router,
  selectablePlayers,
  mixedModeLabel,
  setError,
  setSuccess,
}: {
  clubId: string;
  router: ClubPageRouter;
  selectablePlayers: ClubPageMember[];
  mixedModeLabel: string;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
}) {
  const [newSessionName, setNewSessionName] = useState("");
  const [matchmakingStyle, setMatchmakingStyle] =
    useState<SessionMatchmakingStyle>(
      SessionMatchmakingStyle.BALANCED
    );
  const [balanceMetric, setBalanceMetric] = useState<SessionBalanceMetric>(
    SessionBalanceMetric.SESSION_POINTS
  );
  const [pairingMode, setPairingMode] = useState<SessionPairingMode>(
    SessionPairingMode.OPEN
  );
  const sessionMode =
    pairingMode === SessionPairingMode.MIXED
      ? SessionMode.MIXICANO
      : SessionMode.MEXICANO;
  const [isTestSession, setIsTestSession] = useState(false);
  const [autoQueueEnabled, setAutoQueueEnabled] = useState(false);
  const [respectPlayerRest, setRespectPlayerRest] = useState(true);
  const [courtCount, setCourtCount] = useState(DEFAULT_COURT_COUNT);
  const [poolsEnabled, setPoolsEnabled] = useState(false);
  const [poolAName, setPoolAName] = useState("Open");
  const [poolBName, setPoolBName] = useState("Regular");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [partnerClubId, setPartnerClubId] = useState("");
  const [partnerClubSearch, setPartnerClubSearch] = useState("");
  const [collabCandidates, setCollabCandidates] = useState<
    ClubCollabCandidate[]
  >([]);
  const [selectedPartnerClub, setSelectedPartnerClub] =
    useState<ClubCollabCandidate | null>(null);
  const [loadingCollabCandidates, setLoadingCollabCandidates] = useState(false);
  const [collabRoster, setCollabRoster] = useState<ClubPageMember[]>([]);
  const [loadingCollabRoster, setLoadingCollabRoster] = useState(false);
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
  const [guestConfigs, setGuestConfigs] = useState<ClubGuestConfig[]>([]);
  const [creatingSession, setCreatingSession] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [showGuestsModal, setShowGuestsModal] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");

  useEffect(() => {
    setNewSessionName("");
    setMatchmakingStyle(SessionMatchmakingStyle.BALANCED);
    setBalanceMetric(SessionBalanceMetric.SESSION_POINTS);
    setPairingMode(SessionPairingMode.OPEN);
    setIsTestSession(false);
    setAutoQueueEnabled(false);
    setRespectPlayerRest(true);
    setCourtCount(DEFAULT_COURT_COUNT);
    setPoolsEnabled(false);
    setPoolAName("Open");
    setPoolBName("Regular");
    setSelectedPlayerIds([]);
    setPartnerClubId("");
    setPartnerClubSearch("");
    setCollabCandidates([]);
    setSelectedPartnerClub(null);
    setLoadingCollabCandidates(false);
    setCollabRoster([]);
    setLoadingCollabRoster(false);
    setSelectedPlayerPools({});
    setGuestConfigs([]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestMixedSideOverrideInput(null);
    setGuestPoolInput(SessionPool.A);
    setPlayerSearch("");
    setShowPlayersModal(false);
    setShowGuestsModal(false);
  }, [clubId]);

  useEffect(() => {
    if (!clubId || partnerClubId) {
      setCollabCandidates([]);
      setLoadingCollabCandidates(false);
      return;
    }

    const search = partnerClubSearch.trim();
    if (search.length < 2) {
      setCollabCandidates([]);
      setLoadingCollabCandidates(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoadingCollabCandidates(true);
        setError("");
        try {
          const res = await fetch(
            `/api/clubs/${clubId}/collab-candidates?search=${encodeURIComponent(search)}`
          );
          const data = await safeJson(res);
          if (!res.ok) {
            throw new Error(data.error || "Failed to search clubs");
          }
          if (!cancelled) {
            setCollabCandidates(Array.isArray(data) ? data : []);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            setCollabCandidates([]);
            setError(
              err instanceof Error ? err.message : "Failed to search clubs"
            );
          }
        } finally {
          if (!cancelled) {
            setLoadingCollabCandidates(false);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [clubId, partnerClubId, partnerClubSearch, setError]);

  useEffect(() => {
    if (!partnerClubId || !clubId) {
      setCollabRoster([]);
      setLoadingCollabRoster(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoadingCollabRoster(true);
      setError("");
      try {
        const res = await fetch(
          `/api/clubs/${clubId}/collab-roster?partnerClubId=${encodeURIComponent(partnerClubId)}`
        );
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(data.error || "Failed to load collab roster");
        }
        if (!cancelled) {
          setCollabRoster(Array.isArray(data) ? data : []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setCollabRoster([]);
          setError(
            err instanceof Error ? err.message : "Failed to load collab roster"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCollabRoster(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clubId, partnerClubId, setError]);

  const effectiveSelectablePlayers = partnerClubId
    ? collabRoster
    : selectablePlayers;

  useEffect(() => {
    const availableIds = new Set(
      effectiveSelectablePlayers.map((player) => player.id)
    );
    setSelectedPlayerIds((current) =>
      current.filter((playerId) => availableIds.has(playerId))
    );
  }, [effectiveSelectablePlayers]);

  const createSession = async () => {
    if (!newSessionName.trim() || !clubId) return false;

    if (sessionMode === SessionMode.MIXICANO) {
      const invalidGuest = guestConfigs.find(
        (guest) =>
          ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guest.gender)
      );
      if (invalidGuest) {
        setError(
          `${mixedModeLabel} requires MALE/FEMALE gender for guest ${invalidGuest.name}`
        );
        return false;
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
          scoringType: SessionScoringType.POINTS,
          matchmakingStyle,
          balanceMetric,
          pairingMode,
          isTest: isTestSession,
          autoQueueEnabled,
          respectPlayerRest,
          courtCount,
          clubId,
          partnerClubId: partnerClubId || undefined,
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
        return false;
      }

      setNewSessionName("");
      setSelectedPlayerIds([]);
      setGuestConfigs([]);
      setGuestNameInput("");
      setGuestGenderInput(PlayerGender.MALE);
      setGuestMixedSideOverrideInput(null);
      setGuestPoolInput(SessionPool.A);
      setAutoQueueEnabled(false);
      setRespectPlayerRest(true);
      setCourtCount(DEFAULT_COURT_COUNT);
      setMatchmakingStyle(SessionMatchmakingStyle.BALANCED);
      setBalanceMetric(SessionBalanceMetric.SESSION_POINTS);
      setPairingMode(SessionPairingMode.OPEN);
      setPartnerClubId("");
      setPartnerClubSearch("");
      setSelectedPartnerClub(null);
      setCollabCandidates([]);
      setCollabRoster([]);
      setLoadingCollabRoster(false);
      router.push(`/session/${data.code}`);
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create tournament"
      );
      return false;
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
    const allOtherIds = effectiveSelectablePlayers.map((player) => player.id);
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

  const selectPartnerClub = (candidate: ClubCollabCandidate) => {
    setSelectedPartnerClub(candidate);
    setPartnerClubId(candidate.id);
    setPartnerClubSearch("");
    setCollabCandidates([]);
    setSelectedPlayerIds([]);
    setSelectedPlayerPools({});
  };

  const clearPartnerClub = () => {
    setSelectedPartnerClub(null);
    setPartnerClubId("");
    setPartnerClubSearch("");
    setCollabCandidates([]);
    setCollabRoster([]);
    setLoadingCollabRoster(false);
    setSelectedPlayerIds([]);
    setSelectedPlayerPools({});
  };

  return {
    newSessionName,
    setNewSessionName,
    matchmakingStyle,
    setMatchmakingStyle,
    balanceMetric,
    setBalanceMetric,
    pairingMode,
    setPairingMode,
    sessionMode,
    isTestSession,
    setIsTestSession,
    autoQueueEnabled,
    setAutoQueueEnabled,
    respectPlayerRest,
    setRespectPlayerRest,
    courtCount,
    setCourtCount,
    poolsEnabled,
    setPoolsEnabled,
    poolAName,
    setPoolAName,
    poolBName,
    setPoolBName,
    partnerClubId,
    partnerClubSearch,
    setPartnerClubSearch,
    collabCandidates,
    selectedPartnerClub,
    loadingCollabCandidates,
    selectPartnerClub,
    clearPartnerClub,
    loadingCollabRoster,
    selectablePlayers: effectiveSelectablePlayers,
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
