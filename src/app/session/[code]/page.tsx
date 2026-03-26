"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { FlashMessage } from "@/components/ui/chrome";
import { LiveCourtsPanel } from "@/components/session/LiveCourtsPanel";
import { SessionMobileSectionNav } from "@/components/session/SessionMobileSectionNav";
import { LiveStandingsTable } from "@/components/session/LiveStandingsTable";
import { ManualMatchModal } from "@/components/session/ManualMatchModal";
import { SessionActionConfirmModal } from "@/components/session/SessionActionConfirmModal";
import { SessionOverviewPanel } from "@/components/session/SessionOverviewPanel";
import { SessionPodium } from "@/components/session/SessionPodium";
import { SessionPreferenceEditorPortal } from "@/components/session/SessionPreferenceEditorPortal";
import { SessionRosterModal } from "@/components/session/SessionRosterModal";
import type { CurrentUser } from "@/components/session/sessionTypes";
import { SessionStatus } from "@/types/enums";
import { mergeSessionSnapshot } from "./sessionDataMutations";
import { buildSessionViewModel } from "./sessionViewModel";
import { useSessionData } from "./useSessionData";
import { useSessionMatchActions } from "./useSessionMatchActions";
import { useSessionPlayerManagement } from "./useSessionPlayerManagement";

const EMPTY_PLAYER_SESSION_STATS = {
  played: 0,
  wins: 0,
  losses: 0,
};

type SessionMobileSection = "session" | "courts" | "standings" | "results";

const LIVE_MOBILE_SECTIONS: Array<{
  id: SessionMobileSection;
  label: string;
}> = [
  { id: "session", label: "Session" },
  { id: "courts", label: "Courts" },
  { id: "standings", label: "Standings" },
];

const COMPLETED_MOBILE_SECTIONS: Array<{
  id: SessionMobileSection;
  label: string;
}> = [
  { id: "session", label: "Session" },
  { id: "results", label: "Results" },
];

export default function SessionPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  const mobilePagerRef = useRef<HTMLDivElement | null>(null);
  const previousCompletedSessionRef = useRef(false);
  const pendingPagerScrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const pagerSnapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  const [endingSession, setEndingSession] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [mobileSection, setMobileSection] =
    useState<SessionMobileSection>("courts");

  const safeJson = useCallback(async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      console.error("Failed to parse JSON:", text);
      return { error: "Invalid server response" };
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user/me");
      if (!res.ok) return;

      const data = await safeJson(res);
      if (data.user) {
        setUser(data.user as CurrentUser);
      }
    } catch (err) {
      console.error(err);
    }
  }, [safeJson]);

  const { sessionData, patchSessionData, scheduleSessionRefresh } =
    useSessionData({
      code,
      enabled: !!session?.user?.id,
      safeJson,
      setError,
    });

  const {
    matchScores,
    submittingMatchId,
    confirmingScoreMatchId,
    reopeningMatchId,
    reshufflingCourtId,
    undoingCourtId,
    courtActionDraft,
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
    closeCourtActionDraft,
    confirmCourtAction,
    handleScoreChange,
    requestScoreSubmitConfirmation,
    cancelScoreSubmitConfirmation,
    submitScore,
    approveScore,
    reopenScoreForEdit,
  } = useSessionMatchActions({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    setError,
  });

  const {
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
    removingPlayerId,
    removePlayerDraft,
    openPreferenceEditor,
    setRosterSearch,
    setGuestName,
    setGuestPreference,
    setGuestInitialElo,
    setOpenPreferenceEditor,
    togglePreferenceEditor,
    openRosterModal,
    closeRosterModal,
    handleGuestGenderChange,
    addPlayerToSession,
    addGuestToSession,
    togglePausePlayer,
    requestRemovePlayerFromSession,
    closeRemovePlayerConfirm,
    removePlayerFromSession,
    updatePlayerPreference,
  } = useSessionPlayerManagement({
    code,
    sessionData,
    safeJson,
    patchSessionData,
    scheduleSessionRefresh,
    setError,
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id && code) {
      void fetchUser();
    }
  }, [session, code, fetchUser]);

  const startSession = async () => {
    try {
      const res = await fetch(`/api/sessions/${code}/start`, { method: "POST" });
      if (res.ok) {
        const data = await safeJson(res);
        patchSessionData((current) => mergeSessionSnapshot(current, data));
        scheduleSessionRefresh();
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
        const data = await safeJson(res);
        setShowEndSessionConfirm(false);
        patchSessionData((current) => mergeSessionSnapshot(current, data));
        scheduleSessionRefresh();
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
  const isAdmin =
    !!sessionData?.viewerCanManage || !!user?.isAdmin || !!session?.user?.isAdmin;
  const isClaimedUser = user?.isClaimed === true;
  const currentUserId = session?.user?.id || "";
  const sessionView = useMemo(() => {
    if (!sessionData) {
      return null;
    }

    return buildSessionViewModel({
      sessionData,
      communityPlayers,
      rosterSearch,
      manualMatchForm,
      manualCourtId,
      openPreferenceEditor,
    });
  }, [
    communityPlayers,
    manualCourtId,
    manualMatchForm,
    openPreferenceEditor,
    rosterSearch,
    sessionData,
  ]);
  const mobileSections = useMemo(
    () =>
      sessionView?.isCompletedSession
        ? COMPLETED_MOBILE_SECTIONS
        : LIVE_MOBILE_SECTIONS,
    [sessionView?.isCompletedSession]
  );
  const activeMobileSection = mobileSections.some(
    (section) => section.id === mobileSection
  )
    ? mobileSection
    : mobileSections[0]?.id ?? "session";

  const scrollMobilePagerToSection = useCallback(
    (sectionId: SessionMobileSection, behavior: ScrollBehavior = "auto") => {
      const container = mobilePagerRef.current;
      if (!container) return;

      const sectionIndex = mobileSections.findIndex(
        (section) => section.id === sectionId
      );
      if (sectionIndex < 0) return;

      const nextLeft = sectionIndex * container.clientWidth;
      if (Math.abs(container.scrollLeft - nextLeft) < 4) {
        return;
      }

      if (typeof container.scrollTo === "function") {
        container.scrollTo({
          left: nextLeft,
          behavior,
        });
        return;
      }

      container.scrollLeft = nextLeft;
    },
    [mobileSections]
  );

  const updateMobileSection = useCallback(
    (sectionId: SessionMobileSection, behavior: ScrollBehavior = "smooth") => {
      pendingPagerScrollBehaviorRef.current = behavior;
      setMobileSection(sectionId);
    },
    []
  );

  useEffect(() => {
    const behavior = pendingPagerScrollBehaviorRef.current;
    pendingPagerScrollBehaviorRef.current = "auto";
    scrollMobilePagerToSection(activeMobileSection, behavior);
  }, [activeMobileSection, scrollMobilePagerToSection]);

  useEffect(() => {
    if (!sessionView) {
      previousCompletedSessionRef.current = false;
      return;
    }

    const wasCompleted = previousCompletedSessionRef.current;

    if (sessionView.isCompletedSession) {
      if (!wasCompleted || activeMobileSection !== "results") {
        updateMobileSection("results", "auto");
      }
    } else if (wasCompleted || activeMobileSection === "results") {
      updateMobileSection("courts", "auto");
    }

    previousCompletedSessionRef.current = sessionView.isCompletedSession;
  }, [
    activeMobileSection,
    sessionView?.isCompletedSession,
    updateMobileSection,
  ]);

  useEffect(() => {
    const handleResize = () => {
      scrollMobilePagerToSection(activeMobileSection, "auto");
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [activeMobileSection, scrollMobilePagerToSection]);

  useEffect(() => {
    return () => {
      if (pagerSnapTimeoutRef.current) {
        clearTimeout(pagerSnapTimeoutRef.current);
      }
    };
  }, []);

  const handleMobilePagerScroll = useCallback(() => {
    const container = mobilePagerRef.current;
    if (!container) return;

    if (pagerSnapTimeoutRef.current) {
      clearTimeout(pagerSnapTimeoutRef.current);
    }

    const sectionIndex = Math.round(
      container.scrollLeft / Math.max(container.clientWidth, 1)
    );
    const nextSection = mobileSections[sectionIndex]?.id;

    if (nextSection && nextSection !== activeMobileSection) {
      pendingPagerScrollBehaviorRef.current = "auto";
      setMobileSection(nextSection);
    }

    pagerSnapTimeoutRef.current = setTimeout(() => {
      const settledIndex = Math.round(
        container.scrollLeft / Math.max(container.clientWidth, 1)
      );
      const settledSection = mobileSections[settledIndex]?.id;

      if (settledSection) {
        scrollMobilePagerToSection(settledSection, "smooth");
      }
    }, 90);
  }, [activeMobileSection, mobileSections, scrollMobilePagerToSection]);

  if (status === "loading" || !sessionData || !sessionView) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel flex flex-col items-center gap-4 px-8 py-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="app-eyebrow">Loading session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <nav className="app-topbar">
        <div className="app-topbar-inner max-w-7xl">
          <div className="min-w-0 flex items-center gap-3">
            <button
              onClick={() =>
                router.push(
                  sessionData.communityId
                    ? `/community/${sessionData.communityId}`
                    : "/"
                )
              }
              className="app-button-secondary px-4 py-2"
            >
              Back
            </button>
            <div className="min-w-0 flex flex-col">
              <h1 className="truncate text-lg font-semibold leading-tight text-gray-900 sm:text-xl">
                {sessionData.name}
              </h1>
            </div>
          </div>
        </div>
      </nav>

      <main className="app-shell max-w-7xl space-y-4 sm:space-y-6">
        <div className="sticky top-[4.75rem] z-20 sm:hidden">
          <SessionMobileSectionNav
            sections={mobileSections}
            activeSection={activeMobileSection}
            onSelect={(sectionId) =>
              updateMobileSection(sectionId as SessionMobileSection)
            }
          />
        </div>

        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}

        <div
          ref={mobilePagerRef}
          onScroll={handleMobilePagerScroll}
          className="app-swipe-track -mx-1 overflow-x-auto overscroll-x-contain scroll-smooth sm:mx-0 sm:overflow-visible"
        >
          <div className="flex snap-x snap-mandatory sm:block sm:space-y-6">
            <section className="w-full shrink-0 snap-center sm:w-auto sm:shrink sm:snap-none">
              <SessionOverviewPanel
                sessionTypeLabel={sessionView.sessionTypeLabel}
                sessionModeLabel={sessionView.sessionModeLabel}
                playersCount={sessionData.players.length}
                guestPlayersCount={sessionView.guestPlayersCount}
                activeMatchesCount={sessionView.activeMatchesCount}
                completedMatchesCount={sessionView.completedMatchesCount}
                pausedPlayersCount={sessionView.pausedPlayersCount}
                sessionStatus={sessionData.status}
                canStartSession={
                  isAdmin && sessionData.status === SessionStatus.WAITING
                }
                canEndSession={
                  isAdmin && sessionData.status === SessionStatus.ACTIVE
                }
                canOpenRoster={isAdmin && !sessionView.isCompletedSession}
                onStartSession={startSession}
                onOpenRoster={openRosterModal}
                onEndSession={openEndSessionConfirm}
                onOpenMatchHistory={() => router.push(`/session/${code}/history`)}
              />
            </section>

            {!sessionView.isCompletedSession ? (
              <section className="w-full shrink-0 snap-center sm:w-auto sm:shrink sm:snap-none">
                <LiveCourtsPanel
                  sessionStatus={sessionData.status}
                  courts={sessionData.courts}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  isClaimedUser={isClaimedUser}
                  confirmingScoreMatchId={confirmingScoreMatchId}
                  activeMatchesCount={sessionView.activeMatchesCount}
                  readyCourtsCount={sessionView.readyCourtsCount}
                  creatableOpenCourtCount={sessionView.creatableOpenCourtCount}
                  creatableOpenCourtIds={sessionView.creatableOpenCourtIds}
                  creatingOpenMatches={creatingOpenMatches}
                  reshufflingCourtId={reshufflingCourtId}
                  undoingCourtId={undoingCourtId}
                  reopeningMatchId={reopeningMatchId}
                  submittingMatchId={submittingMatchId}
                  matchScores={matchScores}
                  onCreateMatchesForCourts={createMatchesForCourts}
                  onOpenManualMatchModal={openManualMatchModal}
                  onReshuffleMatch={reshuffleMatch}
                  onUndoMatchSelection={undoMatchSelection}
                  onHandleScoreChange={handleScoreChange}
                  onRequestScoreSubmitConfirmation={
                    requestScoreSubmitConfirmation
                  }
                  onCancelScoreSubmitConfirmation={
                    cancelScoreSubmitConfirmation
                  }
                  onSubmitScore={submitScore}
                  onApproveScore={approveScore}
                  onReopenScoreForEdit={reopenScoreForEdit}
                />
              </section>
            ) : null}

            <section className="w-full shrink-0 snap-center sm:w-auto sm:shrink sm:snap-none">
              <div className="space-y-6">
                {sessionView.isCompletedSession ? (
                  <SessionPodium
                    sessionType={sessionData.type}
                    players={sessionView.sortedPlayers}
                    pointDiffByUserId={sessionView.pointDiffByUserId}
                    playerStatsByUserId={sessionView.playerStatsByUserId}
                  />
                ) : null}

                <LiveStandingsTable
                  sessionType={sessionData.type}
                  sessionStatus={sessionData.status}
                  players={sessionView.sortedPlayers}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  pointDiffByUserId={sessionView.pointDiffByUserId}
                  savingPreferencesFor={savingPreferencesFor}
                  getPlayerProfileHref={sessionView.getPlayerProfileHref}
                  calculatePlayerSessionStats={(userId) =>
                    sessionView.playerStatsByUserId.get(userId) ??
                    EMPTY_PLAYER_SESSION_STATS
                  }
                  onTogglePause={togglePausePlayer}
                  onTogglePreferenceEditor={togglePreferenceEditor}
                />
              </div>
            </section>
          </div>
        </div>
      </main>

      {courtActionDraft ? (
        <SessionActionConfirmModal
          title={
            courtActionDraft.action === "reshuffle"
              ? "Reshuffle match?"
              : "Undo match selection?"
          }
          subtitle={
            courtActionDraft.action === "reshuffle"
              ? `This will replace the current lineup on Court ${courtActionDraft.courtNumber} with a new one.`
              : `This will clear Court ${courtActionDraft.courtNumber} and return these players to the pool.`
          }
          details={
            <div className="space-y-4">
              <div className="app-panel-muted space-y-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Court {courtActionDraft.courtNumber}
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {courtActionDraft.team1Names[0]} &amp;{" "}
                  {courtActionDraft.team1Names[1]}
                </p>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                  vs
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {courtActionDraft.team2Names[0]} &amp;{" "}
                  {courtActionDraft.team2Names[1]}
                </p>
              </div>
            </div>
          }
          confirmLabel={
            courtActionDraft.action === "reshuffle"
              ? "Confirm Reshuffle"
              : "Confirm Undo"
          }
          cancelLabel="Keep Match"
          isSubmitting={
            courtActionDraft.action === "reshuffle"
              ? reshufflingCourtId === courtActionDraft.courtId
              : undoingCourtId === courtActionDraft.courtId
          }
          onClose={closeCourtActionDraft}
          onConfirm={() => void confirmCourtAction()}
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
                {sessionView.activeMatchesCount} active courts
              </p>
              <p className="text-sm text-gray-600">
                {sessionView.completedMatchesCount} recorded matches will remain
                in history.
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
                If this player already has protected match history, the server
                may block removal.
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
        activePreferencePlayer={sessionView.activePreferencePlayer}
        isAdmin={isAdmin}
        isCompletedSession={sessionView.isCompletedSession}
        isMixicano={sessionView.isMixicano}
        removingPlayerId={removingPlayerId}
        onClose={() => setOpenPreferenceEditor(null)}
        onUpdatePreference={updatePlayerPreference}
        onRemovePlayer={requestRemovePlayerFromSession}
      />

      <SessionRosterModal
        open={showRosterModal}
        isAdmin={isAdmin}
        isMixicano={sessionView.isMixicano}
        rosterSearch={rosterSearch}
        guestName={guestName}
        guestGender={guestGender}
        guestPreference={guestPreference}
        guestInitialElo={guestInitialElo}
        addingGuest={addingGuest}
        addingPlayerId={addingPlayerId}
        playersNotInSession={sessionView.playersNotInSession}
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
        court={sessionView.activeManualCourt}
        manualMatchForm={manualMatchForm}
        manualMatchPlayerOptions={sessionView.manualMatchPlayerOptions}
        selectedManualPlayerIds={sessionView.selectedManualPlayerIds}
        creatingManualMatch={creatingManualMatch}
        onClose={closeManualMatchModal}
        onUpdateSlot={updateManualMatchSlot}
        onCreateMatch={createManualMatch}
      />
    </div>
  );
}
