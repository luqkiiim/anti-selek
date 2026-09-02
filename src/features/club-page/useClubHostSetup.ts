"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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
  getSessionCreationIssues,
  hasMissingRequiredGender,
} from "./sessionCreationIssues";
import {
  DEFAULT_SESSION_POOL_A_NAME,
  DEFAULT_SESSION_POOL_B_NAME,
} from "@/lib/sessionPools";
import { getPlayerGroupLabel } from "@/lib/playerGroups";
import {
  MixedSide,
  PlayerGender,
  SessionBalanceMetric,
  SessionCrossoverFrequency,
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
  refreshClubData,
}: {
  clubId: string;
  router: ClubPageRouter;
  selectablePlayers: ClubPageMember[];
  mixedModeLabel: string;
  setError: Dispatch<SetStateAction<string>>;
  setSuccess: Dispatch<SetStateAction<string>>;
  refreshClubData: () => Promise<void>;
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
  const [crossoverFrequency, setCrossoverFrequency] =
    useState<SessionCrossoverFrequency>(
      SessionCrossoverFrequency.BALANCED
    );
  const [collabFormat, setCollabFormatState] = useState<SessionCollabFormat>(
    SessionCollabFormat.FREE_PLAY
  );
  const poolAName = DEFAULT_SESSION_POOL_A_NAME;
  const poolBName = DEFAULT_SESSION_POOL_B_NAME;
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
    SessionPool.B
  );
  const [guestInitialEloInput, setGuestInitialEloInput] = useState(
    DEFAULT_GUEST_INITIAL_ELO
  );
  const [guestRepresentingClubInput, setGuestRepresentingClubInput] =
    useState("");
  const [guestConfigs, setGuestConfigs] = useState<ClubGuestConfig[]>([]);
  const [guestFormError, setGuestFormError] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [savingPreferredPoolPlayerId, setSavingPreferredPoolPlayerId] =
    useState<string | null>(null);

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
    setGuestPoolInput(SessionPool.B);
    setGuestInitialEloInput(DEFAULT_GUEST_INITIAL_ELO);
    setGuestRepresentingClubInput("");
    setGuestFormError("");
    setPlayerSearch("");
    setShowPlayersModal(false);
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
  const preferredPoolByPlayerId = useMemo(
    () =>
      new Map(
        effectiveSelectablePlayers.map((player) => [
          player.id,
          player.preferredPool ?? SessionPool.B,
        ])
      ),
    [effectiveSelectablePlayers]
  );

  const getPreferredPool = (playerId: string) =>
    preferredPoolByPlayerId.get(playerId) ?? SessionPool.B;

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

  const hasMissingMixedGender =
    sessionMode === SessionMode.MIXICANO &&
    hasMissingRequiredGender({
      players: effectiveSelectablePlayers,
      selectedPlayerIds,
      guestGenders: guestConfigs.map((guest) => guest.gender),
    });
  const missingMixedGenderNames =
    sessionMode === SessionMode.MIXICANO
      ? [
          ...selectedPlayerIds.flatMap((playerId) => {
            const player = effectiveSelectablePlayers.find(
              (candidate) => candidate.id === playerId
            );
            return player &&
              ![PlayerGender.MALE, PlayerGender.FEMALE].includes(player.gender)
              ? [player.name]
              : [];
          }),
          ...guestConfigs
            .filter(
              (guest) =>
                ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guest.gender)
            )
            .map((guest) => guest.name),
        ]
      : [];

  const hasInvalidInterclubRepresentation =
    isInterclub &&
    (selectedPlayerIds.some((playerId) => {
      const player = effectiveSelectablePlayers.find(
        (candidate) => candidate.id === playerId
      );
      if (!player) return true;

      const representingClubId =
        selectedPlayerRepresentingClubs[player.id] ??
        getDefaultRepresentingClubId(player.id);
      return (
        !representingClubId ||
        !getEligibleRepresentingClubIds(player).includes(representingClubId)
      );
    }) ||
      guestConfigs.some(
        (guest) =>
          !guest.representingClubId ||
          !interclubClubIds.includes(guest.representingClubId)
      ));

  const selectedPoolCounts = selectedPlayerIds.reduce(
    (counts, playerId) => {
      const pool =
        selectedPlayerPools[playerId] ?? getPreferredPool(playerId);
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

  const creationIssues = getSessionCreationIssues({
    name: newSessionName,
    participantCount: selectedPlayerIds.length + guestConfigs.length,
    poolsEnabled,
    competitiveCount:
      selectedPoolCounts[SessionPool.A] + guestPoolCounts[SessionPool.A],
    socialCount:
      selectedPoolCounts[SessionPool.B] + guestPoolCounts[SessionPool.B],
    isMixed: sessionMode === SessionMode.MIXICANO,
    hasMissingMixedGender,
    missingMixedGenderNames,
    mixedModeLabel,
    isInterclub,
    hasPartnerClub: Boolean(partnerClubId),
    hasInvalidInterclubRepresentation,
  });

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
      setCrossoverFrequency(SessionCrossoverFrequency.BALANCED);
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
    if (!nextPoolsEnabled) {
      setCrossoverFrequency(SessionCrossoverFrequency.BALANCED);
    }
  };

  const createSession = async () => {
    if (!clubId) return false;

    if (creationIssues.length > 0) {
      setError(creationIssues[0]);
      return false;
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
            pool: selectedPlayerPools[userId] ?? getPreferredPool(userId),
            representingClubId: isInterclub
              ? (selectedPlayerRepresentingClubs[userId] ??
                getDefaultRepresentingClubId(userId))
              : null,
          })),
          guestConfigs,
          poolsEnabled,
          crossoverFrequency,
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
      setGuestPoolInput(SessionPool.B);
      setGuestInitialEloInput(DEFAULT_GUEST_INITIAL_ELO);
      setGuestFormError("");
      setAutoQueueEnabled(false);
      setRespectPlayerRest(true);
      setCourtCount(DEFAULT_COURT_COUNT);
      setMatchmakingStyle(SessionMatchmakingStyle.BALANCED);
      setBalanceMetric(SessionBalanceMetric.SESSION_POINTS);
      setPairingMode(SessionPairingMode.OPEN);
      setCrossoverFrequency(SessionCrossoverFrequency.BALANCED);
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
              [playerId]: getPreferredPool(playerId),
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
          next[playerId] = getPreferredPool(playerId);
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

  const updateSavedPlayerPreferredPool = async (
    playerId: string,
    preferredPool: SessionPool
  ) => {
    if (!clubId || savingPreferredPoolPlayerId) return;

    setSavingPreferredPoolPlayerId(playerId);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/clubs/${clubId}/members/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredPool }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Failed to update preferred game group");
      }

      const immediateCount =
        typeof data.preferencePropagation?.immediateSessionCount === "number"
          ? data.preferencePropagation.immediateSessionCount
          : 0;
      const deferredCount =
        typeof data.preferencePropagation?.deferredSessionCount === "number"
          ? data.preferencePropagation.deferredSessionCount
          : 0;
      await refreshClubData();
      setSuccess(
        `Saved ${getPlayerGroupLabel(preferredPool)} as the club preference. ${immediateCount} current tournament${immediateCount === 1 ? "" : "s"} updated now; ${deferredCount} change${deferredCount === 1 ? "" : "s"} deferred.`
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update preferred game group"
      );
    } finally {
      setSavingPreferredPoolPlayerId(null);
    }
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

  const resetGuestDraft = () => {
    setGuestNameInput("");
    setGuestGenderInput(PlayerGender.MALE);
    setGuestMixedSideOverrideInput(null);
    setGuestPoolInput(SessionPool.B);
    setGuestInitialEloInput(DEFAULT_GUEST_INITIAL_ELO);
    setGuestFormError("");
    if (isInterclub) {
      setGuestRepresentingClubInput(interclubClubIds[0] ?? "");
    }
  };

  const addGuestName = () => {
    const trimmed = guestNameInput.trim();
    setGuestFormError("");
    if (trimmed.length < 2) {
      setGuestFormError("Guest name must be at least 2 characters.");
      return false;
    }
    if (
      effectiveSelectablePlayers.some(
        (player) => player.name.trim().toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setGuestFormError("A club player with this name already exists.");
      return false;
    }
    if (
      sessionMode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(guestGenderInput)
    ) {
      setGuestFormError(
        `Choose MALE/FEMALE for guest before adding in ${mixedModeLabel}`
      );
      return false;
    }
    if (
      guestConfigs.some(
        (guest) => guest.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setGuestFormError("This guest has already been added.");
      return false;
    }
    if (isInterclub && !guestRepresentingClubInput) {
      setGuestFormError("Choose a club side for this guest.");
      return false;
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
        pool: guestPoolInput,
        initialElo: guestInitialEloInput,
        representingClubId: isInterclub
          ? guestRepresentingClubInput || interclubClubIds[0] || null
          : null,
      },
    ]);
    resetGuestDraft();
    return true;
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
    resetGuestDraft();
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
    crossoverFrequency,
    setCrossoverFrequency,
    collabFormat,
    setCollabFormat,
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
    savingPreferredPoolPlayerId,
    selectedPlayerRepresentingClubs,
    selectedPoolCounts,
    guestNameInput,
    setGuestNameInput,
    guestGenderInput,
    guestMixedSideOverrideInput,
    setGuestMixedSideOverrideInput,
    guestPoolInput,
    setGuestPoolInput,
    guestInitialEloInput,
    setGuestInitialEloInput,
    guestRepresentingClubInput,
    setGuestRepresentingClubInput,
    guestConfigs,
    guestPoolCounts,
    guestFormError,
    setGuestFormError,
    creatingSession,
    creationIssues,
    showPlayersModal,
    playerSearch,
    setPlayerSearch,
    createSession,
    togglePlayerSelection,
    toggleAllPlayers,
    updateSelectedPlayerPool,
    updateSavedPlayerPreferredPool,
    updateSelectedPlayerRepresentingClub,
    addGuestName,
    removeGuestName,
    resetGuestDraft,
    handleGuestGenderChange,
    openPlayersModal,
    closePlayersModal,
  };
}
