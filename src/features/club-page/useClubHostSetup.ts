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
  const [autoQueueEnabled, setAutoQueueEnabled] = useState(false);
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
  const loadingCollabRoster = false;
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
    setAutoQueueEnabled(false);
    setCourtCount(DEFAULT_COURT_COUNT);
    setPoolsEnabled(false);
    setCollabFormatState(SessionCollabFormat.FREE_PLAY);
    setSelectedPlayerIds([]);
    setPartnerClubId("");
    setPartnerClubSearch("");
    setCollabCandidates([]);
    setSelectedPartnerClub(null);
    setLoadingCollabCandidates(false);
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

  const effectiveSelectablePlayers = selectablePlayers;
  const interclubClubIds = partnerClubId ? [clubId] : [];
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

  function getEligibleRepresentingClubIds() {
    return partnerClubId ? [clubId] : [];
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

    const eligibleClubIds = getEligibleRepresentingClubIds();
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
        !getEligibleRepresentingClubIds().includes(representingClubId)
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
    participantCount: partnerClubId ? Math.max(2, selectedPlayerIds.length + guestConfigs.length) : selectedPlayerIds.length + guestConfigs.length,
    poolsEnabled: partnerClubId ? false : poolsEnabled,
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
          autoQueueEnabled,
          respectPlayerRest: true,
          courtCount,
          clubId,
          collabFormat,
          partnerClubId: partnerClubId || undefined,
          ...(partnerClubId ? {collaborationVersion:2,schedulingMode:"FREE_PLAY",scoringFormat:"SINGLE_GAME",ratingMode:isInterclub?"UNRATED":"RATED"} : {}),
          playerIds: selectedPlayerIds.map((selectionId) => {
            const player = effectiveSelectablePlayers.find(
              (candidate) => candidate.id === selectionId
            );
            const profileClubId = isInterclub
              ? selectedPlayerRepresentingClubs[selectionId] ??
                getDefaultRepresentingClubId(selectionId)
              : player?.profileClubId ?? clubId;
            const membership = player?.linkedClubBadges?.find(
              (badge) => badge.id === profileClubId
            );
            return membership?.userId ?? player?.id ?? selectionId;
          }),
          playerConfigs: selectedPlayerIds.map((selectionId) => {
            const player = effectiveSelectablePlayers.find(
              (candidate) => candidate.id === selectionId
            );
            const representingClubId = isInterclub
              ? selectedPlayerRepresentingClubs[selectionId] ??
                getDefaultRepresentingClubId(selectionId)
              : null;
            const profileClubId = representingClubId ??
              player?.profileClubId ??
              clubId;
            const membership = player?.linkedClubBadges?.find(
              (badge) => badge.id === profileClubId
            );
            return {
              playerId: membership?.userId ?? player?.id ?? selectionId,
              profileClubId,
              pool:
                selectedPlayerPools[selectionId] ??
                getPreferredPool(selectionId),
              representingClubId,
            };
          }),
          guestConfigs: partnerClubId ? guestConfigs.map(guest=>({...guest,representingClubId:clubId})) : guestConfigs,
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
    setSelectedPlayerRepresentingClubs(Object.fromEntries(selectedPlayerIds.map(id=>[id,clubId])));
    setGuestConfigs(current=>current.map(guest=>({...guest,representingClubId:clubId})));
  };

  const clearPartnerClub = () => {
    setSelectedPartnerClub(null);
    setPartnerClubId("");
    setPartnerClubSearch("");
    setCollabCandidates([]);
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
    autoQueueEnabled,
    setAutoQueueEnabled,
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
