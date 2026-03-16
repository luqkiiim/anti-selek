"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { FlashMessage } from "@/components/ui/chrome";
import { LiveCourtsPanel } from "@/components/session/LiveCourtsPanel";
import { ManualMatchModal } from "@/components/session/ManualMatchModal";
import { SessionOverviewPanel } from "@/components/session/SessionOverviewPanel";
import { SessionPreferenceEditorPortal } from "@/components/session/SessionPreferenceEditorPortal";
import { SessionRosterModal } from "@/components/session/SessionRosterModal";
import { LiveStandingsTable } from "@/components/session/LiveStandingsTable";
import { SessionPodium } from "@/components/session/SessionPodium";
import { ScoreSubmissionModal } from "@/components/session/ScoreSubmissionModal";
import { SessionActionConfirmModal } from "@/components/session/SessionActionConfirmModal";
import type {
  CommunityUser,
  CurrentUser,
  Player,
  PreferenceEditorState,
  SessionData,
} from "@/components/session/sessionTypes";
import { getSessionModeLabel, getSessionTypeLabel } from "@/lib/sessionModeLabels";
import { compareSessionStandings } from "@/lib/sessionStandings";
import { useSessionMatchActions } from "./useSessionMatchActions";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
} from "@/types/enums";

export default function SessionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  
  // Late joiner state
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [rosterSearch, setRosterSearch] = useState("");
  const [communityPlayers, setCommunityPlayers] = useState<CommunityUser[]>([]);
  const [addingPlayerId, setAddingPlayerId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestGender, setGuestGender] = useState<PlayerGender>(PlayerGender.MALE);
  const [guestPreference, setGuestPreference] = useState<PartnerPreference>(PartnerPreference.OPEN);
  const [guestInitialElo, setGuestInitialElo] = useState<number>(1000);
  const [addingGuest, setAddingGuest] = useState(false);
  const [savingPreferencesFor, setSavingPreferencesFor] = useState<string | null>(null);
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
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
      const panelWidth = 176; // matches w-44
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
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [openPreferenceEditor]);

  // Helper to safely parse JSON
  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      console.error("Failed to parse JSON:", text);
      return { error: "Invalid server response" };
    }
  }, []);

  const fetchSession = useCallback(async () => {
    if (!code) return;
    try {
      const res = await fetch(`/api/sessions/${code}`);
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to load session");
        return;
      }
      setSessionData(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load session");
    }
  }, [code, safeJson]);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me");
      if (res.ok) {
        const data = await safeJson(res);
        if (data.user) {
          setUser(data.user as CurrentUser);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [safeJson]);

  const {
    matchScores,
    submittingMatchId,
    scoreSubmissionDraft,
    reopeningMatchId,
    undoingCourtId,
    creatingOpenMatches,
    manualCourtId,
    creatingManualMatch,
    manualMatchForm,
    createMatchesForCourts,
    openManualMatchModal,
    closeManualMatchModal,
    updateManualMatchSlot,
    createManualMatch,
    reshuffleMatch,
    undoMatchSelection,
    handleScoreChange,
    openScoreSubmissionDraft,
    closeScoreSubmissionDraft,
    submitScore,
    approveScore,
    reopenScoreForEdit,
  } = useSessionMatchActions({
    code,
    sessionData,
    safeJson,
    fetchSession,
    setError,
  });

  const fetchCommunityPlayers = async () => {
    if (!sessionData?.communityId) return;
    try {
      const res = await fetch(`/api/communities/${sessionData.communityId}/members`);
      const data = await safeJson(res);
      if (res.ok) {
        setCommunityPlayers(
          Array.isArray(data)
            ? data
                .map((p: unknown) => {
                  if (typeof p !== "object" || p === null) return null;
                  const candidate = p as {
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
                .filter((p): p is CommunityUser => p !== null)
            : []
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id && code) {
      fetchUser();
      fetchSession();
      const interval = setInterval(fetchSession, 3000);
      return () => clearInterval(interval);
    }
  }, [session, code, fetchSession, fetchUser]);

  const startSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${code}/start`, { method: "POST" });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to start session");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEndSessionConfirm = () => {
    setError("");
    setShowEndSessionConfirm(true);
  };

  const closeEndSessionConfirm = () => {
    if (endingSession) return;
    setShowEndSessionConfirm(false);
  };

  const endSession = async () => {
    setEndingSession(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/end`, { method: "POST" });
      if (res.ok) {
        setShowEndSessionConfirm(false);
        await fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to end session");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to end session");
    } finally {
      setEndingSession(false);
    }
  };

  const requestRemovePlayerFromSession = (userId: string, playerName: string) => {
    setOpenPreferenceEditor(null);
    setError("");
    setRemovePlayerDraft({ userId, playerName });
  };

  const closeRemovePlayerConfirm = () => {
    if (removePlayerDraft && removingPlayerId === removePlayerDraft.userId) {
      return;
    }
    setRemovePlayerDraft(null);
  };

  const togglePausePlayer = async (userId: string, currentPaused: boolean) => {
    try {
      const res = await fetch(`/api/sessions/${code}/pause-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isPaused: !currentPaused }),
      });
      if (res.ok) {
        fetchSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to update player status");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removePlayerFromSession = async () => {
    if (!removePlayerDraft) return;

    setRemovingPlayerId(removePlayerDraft.userId);
    try {
      const res = await fetch(`/api/sessions/${code}/players/${removePlayerDraft.userId}`, {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to remove player");
        return;
      }
      setRemovePlayerDraft(null);
      await fetchSession();
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
        fetchSession();
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

      setGuestName("");
      setGuestGender(PlayerGender.MALE);
      setGuestPreference(PartnerPreference.OPEN);
      setGuestInitialElo(1000);
      fetchSession();
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
      const res = await fetch(`/api/sessions/${code}/players/${userId}/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender: nextGender,
          partnerPreference: nextPreference,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError(data.error || "Failed to update preference");
        return;
      }
      fetchSession();
    } catch (err) {
      console.error(err);
      setError("Failed to update preference");
    } finally {
      setSavingPreferencesFor(null);
    }
  };

  if (status === "loading" || !sessionData) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading session</p>
        </div>
      </div>
    );
  }

  const isAdmin = !!sessionData.viewerCanManage || !!user?.isAdmin || !!session?.user?.isAdmin;
  const isClaimedUser = user?.isClaimed === true;
  const currentUserId = session?.user?.id || "";
  const isMixicano = sessionData.mode === SessionMode.MIXICANO;
  const busySessionPlayerIds = new Set<string>();
  sessionData.courts.forEach((court) => {
    if (!court.currentMatch) return;
    busySessionPlayerIds.add(court.currentMatch.team1User1.id);
    busySessionPlayerIds.add(court.currentMatch.team1User2.id);
    busySessionPlayerIds.add(court.currentMatch.team2User1.id);
    busySessionPlayerIds.add(court.currentMatch.team2User2.id);
  });
  const manualMatchPlayerOptions = sessionData.players
    .filter((player) => !player.isPaused && !busySessionPlayerIds.has(player.userId))
    .slice()
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
  const selectedManualPlayerIds = new Set(
    Object.values(manualMatchForm).filter((value) => value.length > 0)
  );
  const activeManualCourt = manualCourtId
    ? sessionData.courts.find((court) => court.id === manualCourtId) ?? null
    : null;

  // Helper to calculate player stats for the session
  const calculatePlayerSessionStats = (userId: string) => {
    const sessionMatches = sessionData.matches || [];
    let played = 0;
    let wins = 0;
    let losses = 0;

    sessionMatches.forEach(m => {
      const isTeam1 = m.team1User1Id === userId || m.team1User2Id === userId;
      const isTeam2 = m.team2User1Id === userId || m.team2User2Id === userId;

      if (isTeam1 || isTeam2) {
        played++;
        if (isTeam1 && m.winnerTeam === 1) wins++;
        else if (isTeam2 && m.winnerTeam === 2) wins++;
        else losses++;
      }
    });

    return { played, wins, losses };
  };

  const calculatePlayerPointDiff = (userId: string) => {
    const sessionMatches = sessionData.matches || [];
    let pointDiff = 0;

    sessionMatches.forEach((m) => {
      if (m.status !== MatchStatus.COMPLETED) return;
      if (typeof m.team1Score !== "number" || typeof m.team2Score !== "number") return;

      const isTeam1 = m.team1User1Id === userId || m.team1User2Id === userId;
      const isTeam2 = m.team2User1Id === userId || m.team2User2Id === userId;
      if (isTeam1) pointDiff += m.team1Score - m.team2Score;
      if (isTeam2) pointDiff += m.team2Score - m.team1Score;
    });

    return pointDiff;
  };

  // Filter out players already in session AND apply search
  const playersNotInSession = communityPlayers
    .filter(cp => !sessionData.players.some(sp => sp.userId === cp.id))
    .filter(cp => cp.name.toLowerCase().includes(rosterSearch.toLowerCase()));
  const activeMatchesCount = sessionData.courts.filter((court) => court.currentMatch !== null).length;
  const readyCourtsCount = sessionData.courts.length - activeMatchesCount;
  const openCourts = sessionData.courts
    .filter((court) => !court.currentMatch)
    .slice()
    .sort((a, b) => a.courtNumber - b.courtNumber);
  const availableAutoMatchPlayersCount = sessionData.players.filter(
    (player) => !player.isPaused && !busySessionPlayerIds.has(player.userId)
  ).length;
  const creatableOpenCourtCount = Math.min(
    openCourts.length,
    Math.floor(availableAutoMatchPlayersCount / 4)
  );
  const creatableOpenCourtIds = openCourts
    .slice(0, creatableOpenCourtCount)
    .map((court) => court.id);
  const completedMatchesCount = sessionData.matches?.length ?? 0;
  const pausedPlayersCount = sessionData.players.filter((player) => player.isPaused).length;
  const guestPlayersCount = sessionData.players.filter((player) => player.isGuest).length;
  const isCompletedSession = sessionData.status === SessionStatus.COMPLETED;
  const pointDiffByUserId = new Map(
    sessionData.players.map((player) => [
      player.userId,
      calculatePlayerPointDiff(player.userId),
    ])
  );
  const sortedPlayers = sessionData.players
    .slice()
    .sort((a, b) =>
      compareSessionStandings(
        {
          name: a.user.name,
          pointDiff: pointDiffByUserId.get(a.userId) ?? 0,
          sessionPoints: a.sessionPoints,
        },
        {
          name: b.user.name,
          pointDiff: pointDiffByUserId.get(b.userId) ?? 0,
          sessionPoints: b.sessionPoints,
        }
      )
    );
  const activePreferencePlayer = openPreferenceEditor
    ? sessionData.players.find((player) => player.userId === openPreferenceEditor.userId) ?? null
    : null;
  const sessionModeLabel = getSessionModeLabel(sessionData.mode);
  const sessionTypeLabel = getSessionTypeLabel(sessionData.type);
  const getSessionPlayerProfileHref = (player: Player) =>
    sessionData.communityId && !player.isGuest
      ? `/profile/${player.user.id}?communityId=${sessionData.communityId}`
      : `/profile/${player.user.id}`;
  const resetRosterInputs = () => {
    setRosterSearch("");
    setGuestName("");
    setGuestGender(PlayerGender.MALE);
    setGuestPreference(PartnerPreference.OPEN);
    setGuestInitialElo(1000);
  };
  const closeRosterModal = () => {
    resetRosterInputs();
    setShowRosterModal(false);
  };
  const handleGuestGenderChange = (nextGender: PlayerGender) => {
    setGuestGender(nextGender);
    setGuestPreference(
      nextGender === PlayerGender.FEMALE
        ? PartnerPreference.FEMALE_FLEX
        : PartnerPreference.OPEN
    );
  };
  const openRosterModal = () => {
    fetchCommunityPlayers();
    resetRosterInputs();
    setShowRosterModal(true);
  };

  return (
    <div className="app-page">
      <nav className="app-topbar">
        <div className="app-topbar-inner max-w-7xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                router.push(sessionData.communityId ? `/community/${sessionData.communityId}` : "/")
              }
              className="app-button-secondary px-4 py-2"
            >
              Back
            </button>
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold text-gray-900 leading-tight truncate max-w-[180px] sm:max-w-[280px] md:max-w-[420px]">
                {sessionData.name}
              </h1>
              <div className="flex items-center gap-2">
                <span className="app-chip app-chip-neutral">{sessionData.status}</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="app-shell max-w-7xl space-y-6">
        <SessionOverviewPanel
          sessionTypeLabel={sessionTypeLabel}
          sessionModeLabel={sessionModeLabel}
          playersCount={sessionData.players.length}
          guestPlayersCount={guestPlayersCount}
          activeMatchesCount={activeMatchesCount}
          completedMatchesCount={completedMatchesCount}
          pausedPlayersCount={pausedPlayersCount}
          sessionStatus={sessionData.status}
          canStartSession={isAdmin && sessionData.status === SessionStatus.WAITING}
          canEndSession={isAdmin && sessionData.status === SessionStatus.ACTIVE}
          canOpenRoster={isAdmin && !isCompletedSession}
          onStartSession={startSession}
          onOpenRoster={openRosterModal}
          onEndSession={openEndSessionConfirm}
          onOpenMatchHistory={() => router.push(`/session/${code}/history`)}
        />

        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}

        {!isCompletedSession ? (
          <LiveCourtsPanel
            sessionStatus={sessionData.status}
            courts={sessionData.courts}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            isClaimedUser={isClaimedUser}
            activeMatchesCount={activeMatchesCount}
            readyCourtsCount={readyCourtsCount}
            creatableOpenCourtCount={creatableOpenCourtCount}
            creatableOpenCourtIds={creatableOpenCourtIds}
            creatingOpenMatches={creatingOpenMatches}
            undoingCourtId={undoingCourtId}
            reopeningMatchId={reopeningMatchId}
            submittingMatchId={submittingMatchId}
            matchScores={matchScores}
            onCreateMatchesForCourts={createMatchesForCourts}
            onOpenManualMatchModal={openManualMatchModal}
            onReshuffleMatch={reshuffleMatch}
            onUndoMatchSelection={undoMatchSelection}
            onHandleScoreChange={handleScoreChange}
            onOpenScoreSubmissionDraft={openScoreSubmissionDraft}
            onApproveScore={approveScore}
            onReopenScoreForEdit={reopenScoreForEdit}
          />
        ) : null}

        {isCompletedSession ? (
          <SessionPodium players={sortedPlayers} pointDiffByUserId={pointDiffByUserId} />
        ) : null}

        <LiveStandingsTable
          sessionType={sessionData.type}
          sessionStatus={sessionData.status}
          players={sortedPlayers}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          pointDiffByUserId={pointDiffByUserId}
          savingPreferencesFor={savingPreferencesFor}
          getPlayerProfileHref={getSessionPlayerProfileHref}
          calculatePlayerSessionStats={calculatePlayerSessionStats}
          onTogglePause={togglePausePlayer}
          onTogglePreferenceEditor={togglePreferenceEditor}
        />
      </main>

      {scoreSubmissionDraft ? (
        <ScoreSubmissionModal
          team1Names={scoreSubmissionDraft.team1Names}
          team2Names={scoreSubmissionDraft.team2Names}
          team1Score={scoreSubmissionDraft.team1Score}
          team2Score={scoreSubmissionDraft.team2Score}
          isSubmitting={submittingMatchId === scoreSubmissionDraft.matchId}
          onClose={closeScoreSubmissionDraft}
          onConfirm={() => void submitScore(scoreSubmissionDraft)}
        />
      ) : null}

      {showEndSessionConfirm ? (
        <SessionActionConfirmModal
          title="End session?"
          subtitle="This will close the live session and lock in the final standings."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Session summary
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {activeMatchesCount} active courts
              </p>
              <p className="text-sm text-gray-600">
                {completedMatchesCount} recorded matches will remain in history.
              </p>
            </div>
          }
          confirmLabel="Confirm End Session"
          cancelLabel="Keep Session Live"
          isSubmitting={endingSession}
          onClose={closeEndSessionConfirm}
          onConfirm={() => void endSession()}
        />
      ) : null}

      {removePlayerDraft ? (
        <SessionActionConfirmModal
          title="Remove player?"
          subtitle="This will remove the player from the current session roster."
          details={
            <div className="app-panel-muted space-y-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Player
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {removePlayerDraft.playerName}
              </p>
              <p className="text-sm text-gray-600">
                If this player already has protected match history, the server may block removal.
              </p>
            </div>
          }
          confirmLabel="Confirm Remove Player"
          cancelLabel="Keep Player"
          isSubmitting={removingPlayerId === removePlayerDraft.userId}
          onClose={closeRemovePlayerConfirm}
          onConfirm={() => void removePlayerFromSession()}
        />
      ) : null}

      <SessionPreferenceEditorPortal
        openPreferenceEditor={openPreferenceEditor}
        activePreferencePlayer={activePreferencePlayer}
        isAdmin={isAdmin}
        isCompletedSession={isCompletedSession}
        isMixicano={isMixicano}
        removingPlayerId={removingPlayerId}
        onClose={() => setOpenPreferenceEditor(null)}
        onUpdatePreference={updatePlayerPreference}
        onRemovePlayer={requestRemovePlayerFromSession}
      />

      <SessionRosterModal
        open={showRosterModal}
        isAdmin={isAdmin}
        isMixicano={isMixicano}
        rosterSearch={rosterSearch}
        guestName={guestName}
        guestGender={guestGender}
        guestPreference={guestPreference}
        guestInitialElo={guestInitialElo}
        addingGuest={addingGuest}
        addingPlayerId={addingPlayerId}
        playersNotInSession={playersNotInSession}
        onClose={closeRosterModal}
        onRosterSearchChange={setRosterSearch}
        onGuestNameChange={setGuestName}
        onGuestGenderChange={handleGuestGenderChange}
        onGuestPreferenceChange={setGuestPreference}
        onGuestInitialEloChange={setGuestInitialElo}
        onAddGuest={addGuestToSession}
        onAddPlayer={addPlayerToSession}
      />

      <ManualMatchModal
        open={manualCourtId !== null}
        court={activeManualCourt}
        manualMatchForm={manualMatchForm}
        manualMatchPlayerOptions={manualMatchPlayerOptions}
        selectedManualPlayerIds={selectedManualPlayerIds}
        creatingManualMatch={creatingManualMatch}
        onClose={closeManualMatchModal}
        onUpdateSlot={updateManualMatchSlot}
        onCreateMatch={createManualMatch}
      />
    </div>
  );
}

