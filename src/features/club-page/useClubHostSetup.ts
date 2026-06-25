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
  SessionCollabFormat,
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
  const [collabFormat, setCollabFormatState] = useState<SessionCollabFormat>(
    SessionCollabFormat.FREE_PLAY
  );
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
  const [
    selectedPlayerRepresentingClubs,
    setSelectedPlayerRepresentingClubs,
  ] = useState<Record<string, string | null>>({});
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestGenderInput, setGuestGenderInput] = useState<PlayerGender>(
    PlayerGender.MALE
  );
  const [guestMixedSideOverrideInput, setGuestMixedSideOverrideInput] =
    useState<MixedSide | null>(null);
  const [guestPoolInput, setGuestPoolInput] = useState<SessionPool>(
    SessionPool.A
  );
  const [guestRepresentingClubInput, setGuestRepresentingClubInput] =
    useState("");
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
    setCollabFormatState(SessionCollabFormat.FREE_PLAY);
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
    setSelectedPlayerRepresentingClubs({});
    setGuestConfigs([]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestMixedSideOverrideInput(null);
    setGuestPoolInput(SessionPool.A);
    setGuestRepresentingClubInput("");
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
  const interclubClubIds = partnerClubId ? [clubId, partnerClubId] : [];
  const isInterclub = collabFormat === SessionCollabFormat.INTERCLUB;

  function getEligibleRepresentingClubIds(player: ClubPageMember) {
    if (!partnerClubId) {
      return [];
    }

    const validIds = new Set([clubId, partnerClubId]);
    const badges = [
      ...(player.communityBadges ?? []),
      ...(player.linkedClubBadges ?? []),
    ];

    return Array.from(
      new Set(
        badges
          .map((badge) => badge.id)
          .filter((badgeClubId) => validIds.has(badgeClubId))
      )
    );
  }

  function getDefaultRepresentingClubId(playerId: string) {
    if (!isInterclub) {
      return null;
    }

    const player = effectiveSelectablePlayers.find(
      (candidate) => candidate.id === playerId
    );
    if (!player) {
      return null;
    }

    const eligibleClubIds = getEligibleRepresentingClubIds(player);
    return eligibleClubIds.length === 1 ? eligibleClubIds[0] : null;
  }

  useEffect(() => {
    const availableIds = new Set(
      effectiveSelectablePlayers.map((player) => player.id)
    );
    setSelectedPlayerIds((current) =>
      current.filter((playerId) => availableIds.has(playerId))
    );
    setSelectedPlayerRepresentingClubs((current) => {
      const next: Record<string, string | null> = {};
      for (const [playerId, representingClubId] of Object.entries(current)) {
        if (availableIds.has(playerId)) {
          next[playerId] = representingClubId;
        }
      }
      return next;
    });
  }, [effectiveSelectablePlayers]);

  const setCollabFormat = (nextFormat: SessionCollabFormat) => {
    setCollabFormatState(nextFormat);

    if (nextFormat === SessionCollabFormat.INTERCLUB) {
      setPoolsEnabled(false);
      setMatchmakingStyle(SessionMatchmakingStyle.BALANCED);
      setBalanceMetric(SessionBalanceMetric.RATING);
      setSelectedPlayerRepresentingClubs((current) => {
        const next = { ...current };
        for (const playerId of selectedPlayerIds) {
          if (next[playerId] === undefined) {
            next[playerId] = getDefaultRepresentingClubId(playerId);
          }
        }
        return next;
      });
      if (!guestRepresentingClubInput && interclubClubIds.length > 0) {
        setGuestRepresentingClubInput(interclubClubIds[0]);
      }
      setGuestConfigs((current) =>
        current.map((guest) => ({
          ...guest,
          representingClubId:
            guest.representingClubId ?? interclubClubIds[0] ?? null,
        }))
      );
      return;
    }

    setSelectedPlayerRepresentingClubs({});
    setGuestRepresentingClubInput("");
    setGuestConfigs((current) =>
      current.map((guest) => ({ ...guest, representingClubId: null }))
    );
  };

  const setPoolsEnabledForFormat = (nextPoolsEnabled: boolean) => {
    if (isInterclub && nextPoolsEnabled) {
      setPoolsEnabled(false);
      return;
    }

    setPoolsEnabled(nextPoolsEnabled);
  };

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

    if (isInterclub) {
      if (!partnerClubId) {
        setError("Choose a partner club before creating club vs club.");
        return false;
      }

      const invalidPlayer = selectedPlayerIds
        .map((playerId) =>
          effectiveSelectablePlayers.find((player) => player.id === playerId)
        )
        .find((player) => {
          if (!player) return true;
          const representingClubId =
            selectedPlayerRepresentingClubs[player.id] ??
            getDefaultRepresentingClubId(player.id);
          return (
            !representingClubId ||
            !getEligibleRepresentingClubIds(player).includes(representingClubId)
          );
        });

      if (invalidPlayer) {
        setError("Assign every selected player to a club side.");
        return false;
      }

      if (
        guestConfigs.some(
          (guest) => !guest.representingClubId || !interclubClubIds.includes(guest.representingClubId)
        )
      ) {
        setError("Assign every guest to a club side.");
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
          collabFormat,
          partnerClubId: partnerClubId || undefined,
          playerIds: selectedPlayerIds,
          playerConfigs: selectedPlayerIds.map((userId) => ({
            userId,
            pool: poolsEnabled
              ? (selectedPlayerPools[userId] ?? SessionPool.A)
              : SessionPool.A,
            representingClubId: isInterclub
              ? (selectedPlayerRepresentingClubs[userId] ??
                getDefaultRepresentingClubId(userId))
              : null,
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
      setCollabFormatState(SessionCollabFormat.FREE_PLAY);
      setPartnerClubId("");
      setPartnerClubSearch("");
      setSelectedPartnerClub(null);
      setCollabCandidates([]);
      setCollabRoster([]);
      setLoadingCollabRoster(false);
      setSelectedPlayerRepresentingClubs({});
      setGuestRepresentingClubInput("");
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
      setSelectedPlayerRepresentingClubs((current) => {
        if (!isInterclub || current[playerId] !== undefined) {
          return current;
        }

        return {
          ...current,
          [playerId]: getDefaultRepresentingClubId(playerId),
        };
      });
    }

    setSelectedPlayerIds((prev) =>
      isSelected ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );
    if (isSelected) {
      setSelectedPlayerRepresentingClubs((current) => {
        const next = { ...current };
        delete next[playerId];
        return next;
      });
    }
  };

  const toggleAllPlayers = () => {
    const allOtherIds = effectiveSelectablePlayers.map((player) => player.id);
    if (selectedPlayerIds.length === allOtherIds.length) {
      setSelectedPlayerIds([]);
      setSelectedPlayerRepresentingClubs({});
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
    if (isInterclub) {
      setSelectedPlayerRepresentingClubs((current) => {
        const next = { ...current };
        for (const playerId of allOtherIds) {
          if (next[playerId] === undefined) {
            next[playerId] = getDefaultRepresentingClubId(playerId);
          }
        }
        return next;
      });
    }
  };

  const updateSelectedPlayerPool = (playerId: string, pool: SessionPool) => {
    setSelectedPlayerPools((current) => ({
      ...current,
      [playerId]: pool,
    }));
  };

  const updateSelectedPlayerRepresentingClub = (
    playerId: string,
    representingClubId: string | null
  ) => {
    setSelectedPlayerRepresentingClubs((current) => ({
      ...current,
      [playerId]: representingClubId,
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
        representingClubId: isInterclub
          ? guestRepresentingClubInput || interclubClubIds[0] || null
          : null,
      },
    ]);
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestMixedSideOverrideInput(null);
    setGuestPoolInput(SessionPool.A);
    if (isInterclub) {
      setGuestRepresentingClubInput(interclubClubIds[0] ?? "");
    }
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
    setSelectedPlayerRepresentingClubs({});
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
    setSelectedPlayerRepresentingClubs({});
    setCollabFormatState(SessionCollabFormat.FREE_PLAY);
    setGuestRepresentingClubInput("");
    setGuestConfigs((current) =>
      current.map((guest) => ({ ...guest, representingClubId: null }))
    );
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
    setPoolsEnabled: setPoolsEnabledForFormat,
    collabFormat,
    setCollabFormat,
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
    selectedPlayerRepresentingClubs,
    selectedPoolCounts,
    guestNameInput,
    setGuestNameInput,
    guestGenderInput,
    guestMixedSideOverrideInput,
    setGuestMixedSideOverrideInput,
    guestPoolInput,
    setGuestPoolInput,
    guestRepresentingClubInput,
    setGuestRepresentingClubInput,
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
    updateSelectedPlayerRepresentingClub,
    addGuestName,
    removeGuestName,
    handleGuestGenderChange,
    openPlayersModal,
    closePlayersModal,
    openGuestsModal,
    closeGuestsModal,
  };
}
