"use client";

import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { canApprovePendingSubmission } from "@/lib/matchApprovalRules";
import { MatchStatus } from "@/types/enums";
import type { Match, MatchScores } from "./sessionTypes";
import { PendingApprovalActions } from "./PendingApprovalActions";
import { ScoreEntryControls } from "./ScoreEntryControls";

interface LiveMatchCardProps {
  match: Match;
  currentUserId: string;
  isAdmin: boolean;
  isClaimedUser: boolean;
  confirmingScoreMatchId: string | null;
  reshufflingCourtPlayerId: string | null;
  replacingCourtPlayerId: string | null;
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
  onReshuffleWithoutPlayer: (userId: string) => void;
  onReplacePlayer: (userId: string) => void;
  onHandleScoreChange: (
    matchId: string,
    team: "team1" | "team2",
    value: string
  ) => void;
  onRequestScoreSubmitConfirmation: (matchId: string) => void;
  onCancelScoreSubmitConfirmation: (matchId: string) => void;
  onSubmitScore: (matchId: string) => void;
  onApproveScore: (matchId: string) => void;
  onReopenScoreForEdit: (matchId: string) => void;
  lineupRef?: Ref<HTMLDivElement>;
}

interface TeamNamesProps {
  matchId: string;
  players: [Match["team1User1"], Match["team1User2"]];
  align?: "left" | "right";
  canReshuffleWithoutPlayer: boolean;
  activeActionPlayerId: string | null;
  reshufflingCourtPlayerId: string | null;
  replacingCourtPlayerId: string | null;
  actionDisabled: boolean;
  onTogglePlayerAction: (actionKey: string) => void;
  onReshuffleWithoutPlayer: (userId: string) => void;
  onReplacePlayer: (userId: string) => void;
}

function TeamNames({
  matchId,
  players,
  align = "left",
  canReshuffleWithoutPlayer,
  activeActionPlayerId,
  reshufflingCourtPlayerId,
  replacingCourtPlayerId,
  actionDisabled,
  onTogglePlayerAction,
  onReshuffleWithoutPlayer,
  onReplacePlayer,
}: TeamNamesProps) {
  const textAlignClass = align === "right" ? "text-right" : "text-left";
  const popoverPositionClass = align === "right" ? "right-0" : "left-0";

  return (
    <div className={`min-w-0 space-y-1 ${textAlignClass}`}>
      {players.map((player) => {
        const actionKey = `${matchId}:${player.id}`;
        const actionOpen = activeActionPlayerId === actionKey;
        const isReshuffling = reshufflingCourtPlayerId === player.id;
        const isReplacing = replacingCourtPlayerId === player.id;

        return (
          <div
            key={player.id}
            className={`relative min-w-0 ${textAlignClass}`}
            data-live-player-action-root={actionKey}
          >
            {canReshuffleWithoutPlayer ? (
              <button
                type="button"
                onClick={() => onTogglePlayerAction(actionKey)}
                disabled={actionDisabled}
                aria-expanded={actionOpen}
                className={`min-w-0 max-w-full truncate text-[14px] font-bold leading-tight text-gray-900 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base md:text-[1.35rem] xl:text-base ${textAlignClass}`}
              >
                {player.name}
              </button>
            ) : (
              <p className="truncate text-[14px] font-bold leading-tight text-gray-900 sm:text-base md:text-[1.35rem] xl:text-base">
                {player.name}
              </p>
            )}

            {canReshuffleWithoutPlayer && actionOpen ? (
              <div
                className={`absolute top-full z-20 mt-2 w-40 max-w-[calc(100vw-3rem)] ${popoverPositionClass}`}
              >
                <div className="relative space-y-2 rounded-2xl border border-gray-900 bg-gray-950 p-2 shadow-[0_18px_40px_-22px_rgba(15,23,42,0.55)]">
                  <div
                    className={`absolute top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-gray-900 bg-gray-950 ${
                      align === "right" ? "right-4" : "left-4"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => onReshuffleWithoutPlayer(player.id)}
                    disabled={actionDisabled}
                    className="w-full rounded-xl border border-blue-200/80 bg-blue-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isReshuffling ? "Reshuffling..." : "Reshuffle Without"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplacePlayer(player.id)}
                    disabled={actionDisabled}
                    className="w-full rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isReplacing ? "Replacing..." : "Replace"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface ScoreSlotProps {
  matchId: string;
  canEdit: boolean;
  scoreValue: string;
  readonlyScore?: string | number;
  pendingScore?: number;
  onScoreChange: (value: string) => void;
  onScoreFocus?: () => void;
  onScoreBlur?: () => void;
}

function ScoreSlot({
  matchId,
  canEdit,
  scoreValue,
  readonlyScore,
  pendingScore,
  onScoreChange,
  onScoreFocus,
  onScoreBlur,
}: ScoreSlotProps) {
  if (canEdit) {
    return (
      <input
        type="number"
        inputMode="numeric"
        data-live-score-input="true"
        data-score-input-match-id={matchId}
        value={scoreValue}
        onChange={(event) => onScoreChange(event.target.value)}
        onFocus={onScoreFocus}
        onBlur={onScoreBlur}
        className="h-10 w-10 rounded-lg border border-blue-200 bg-white text-center text-lg font-black tabular-nums text-gray-900 focus:border-blue-500 focus:outline-none sm:h-11 sm:w-11 sm:text-xl md:h-14 md:w-14 md:text-[2rem] xl:h-11 xl:w-11 xl:text-xl"
        placeholder="0"
      />
    );
  }

  const displayScore =
    readonlyScore ??
    (typeof pendingScore === "number" ? pendingScore.toString() : null);

  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-white text-lg font-black tabular-nums sm:h-11 sm:w-11 sm:text-xl md:h-14 md:w-14 md:text-[2rem] xl:h-11 xl:w-11 xl:text-xl ${
        displayScore !== null
          ? "border-gray-200 text-gray-900"
          : "border-gray-100 text-gray-300"
      }`}
    >
      {displayScore ?? "-"}
    </div>
  );
}

export function LiveMatchCard({
  match,
  currentUserId,
  isAdmin,
  isClaimedUser,
  confirmingScoreMatchId,
  reshufflingCourtPlayerId,
  replacingCourtPlayerId,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  onReshuffleWithoutPlayer,
  onReplacePlayer,
  onHandleScoreChange,
  onRequestScoreSubmitConfirmation,
  onCancelScoreSubmitConfirmation,
  onSubmitScore,
  onApproveScore,
  onReopenScoreForEdit,
  lineupRef,
}: LiveMatchCardProps) {
  const scoreInputScrollRestoreRef = useRef<{
    scrollY: number | null;
    viewportHeight: number | null;
    blurTimerId: number | null;
    restoreTimerId: number | null;
  }>({
    scrollY: null,
    viewportHeight: null,
    blurTimerId: null,
    restoreTimerId: null,
  });
  const [activeActionPlayerId, setActiveActionPlayerId] = useState<string | null>(
    null
  );
  const isParticipant = [
    match.team1User1.id,
    match.team1User2.id,
    match.team2User1.id,
    match.team2User2.id,
  ].includes(currentUserId);
  const canEdit =
    match.status === MatchStatus.IN_PROGRESS && (isAdmin || isParticipant);
  const canConfirmPending =
    match.status === MatchStatus.PENDING_APPROVAL &&
    (match.scoreSubmittedByUserId
      ? canApprovePendingSubmission({
          match: {
            team1User1Id: match.team1User1.id,
            team1User2Id: match.team1User2.id,
            team2User1Id: match.team2User1.id,
            team2User2Id: match.team2User2.id,
          },
          approverUserId: currentUserId,
          approverIsAdmin: isAdmin,
          approverIsClaimed: isClaimedUser,
          scoreSubmittedByUserId: match.scoreSubmittedByUserId,
        })
      : isAdmin || isParticipant);
  const scores = matchScores[match.id] || { team1: "", team2: "" };
  const isPendingApproval = match.status === MatchStatus.PENDING_APPROVAL;
  const isConfirmingSubmission = confirmingScoreMatchId === match.id;
  const canEditScores = canEdit && !isConfirmingSubmission;
  const canReshuffleWithoutPlayer =
    isAdmin && match.status === MatchStatus.IN_PROGRESS;
  const actionDisabled =
    reshufflingCourtPlayerId !== null || replacingCourtPlayerId !== null;
  const clearScoreInputRestoreTimers = useCallback(() => {
    const restoreState = scoreInputScrollRestoreRef.current;
    if (restoreState.blurTimerId !== null) {
      window.clearTimeout(restoreState.blurTimerId);
      restoreState.blurTimerId = null;
    }
    if (restoreState.restoreTimerId !== null) {
      window.clearTimeout(restoreState.restoreTimerId);
      restoreState.restoreTimerId = null;
    }
  }, []);

  const clearSavedScoreInputScrollPosition = useCallback(() => {
    clearScoreInputRestoreTimers();
    scoreInputScrollRestoreRef.current.scrollY = null;
    scoreInputScrollRestoreRef.current.viewportHeight = null;
  }, [clearScoreInputRestoreTimers]);

  const isTouchScrollRestoreSupported = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return navigator.maxTouchPoints > 0;
  }, []);

  const isScoreInputElement = useCallback((element: Element | null) => {
    return element?.getAttribute("data-live-score-input") === "true";
  }, []);

  const isOwnScoreInputElement = useCallback(
    (element: Element | null) => {
      return (
        isScoreInputElement(element) &&
        element?.getAttribute("data-score-input-match-id") === match.id
      );
    },
    [isScoreInputElement, match.id]
  );

  const restoreSavedScoreInputScrollPosition = useCallback(() => {
    if (!isTouchScrollRestoreSupported()) {
      return;
    }

    const restoreState = scoreInputScrollRestoreRef.current;
    if (restoreState.scrollY === null) {
      return;
    }

    clearScoreInputRestoreTimers();

    const targetScrollY = restoreState.scrollY;
    const initialViewportHeight = restoreState.viewportHeight;
    const startedAt = Date.now();

    const attemptRestore = () => {
      const currentViewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const keyboardLikelyClosed =
        initialViewportHeight === null ||
        currentViewportHeight >= initialViewportHeight - 48;
      const waitedLongEnough = Date.now() - startedAt >= 900;

      if (!keyboardLikelyClosed && !waitedLongEnough) {
        restoreState.restoreTimerId = window.setTimeout(attemptRestore, 80);
        return;
      }

      restoreState.restoreTimerId = null;
      restoreState.scrollY = null;
      restoreState.viewportHeight = null;

      if (Math.abs(window.scrollY - targetScrollY) < 4) {
        return;
      }

      const prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      window.scrollTo({
        top: targetScrollY,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    };

    restoreState.restoreTimerId = window.setTimeout(attemptRestore, 120);
  }, [clearScoreInputRestoreTimers, isTouchScrollRestoreSupported]);

  const handleScoreInputFocus = useCallback(() => {
    if (!isTouchScrollRestoreSupported()) {
      return;
    }

    const restoreState = scoreInputScrollRestoreRef.current;
    if (restoreState.scrollY === null) {
      restoreState.scrollY = window.scrollY;
      restoreState.viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
    }

    clearScoreInputRestoreTimers();
  }, [clearScoreInputRestoreTimers, isTouchScrollRestoreSupported]);

  const handleScoreInputBlur = useCallback(() => {
    if (!isTouchScrollRestoreSupported()) {
      return;
    }

    const restoreState = scoreInputScrollRestoreRef.current;
    if (restoreState.blurTimerId !== null) {
      window.clearTimeout(restoreState.blurTimerId);
    }

    restoreState.blurTimerId = window.setTimeout(() => {
      restoreState.blurTimerId = null;

      const activeElement =
        document.activeElement instanceof Element ? document.activeElement : null;

      if (isOwnScoreInputElement(activeElement)) {
        return;
      }

      if (isScoreInputElement(activeElement)) {
        clearSavedScoreInputScrollPosition();
        return;
      }

      restoreSavedScoreInputScrollPosition();
    }, 40);
  }, [
    clearSavedScoreInputScrollPosition,
    isOwnScoreInputElement,
    isScoreInputElement,
    isTouchScrollRestoreSupported,
    restoreSavedScoreInputScrollPosition,
  ]);

  useEffect(() => {
    if (!activeActionPlayerId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const actionRoot = event.target.closest("[data-live-player-action-root]");
      if (
        actionRoot?.getAttribute("data-live-player-action-root") ===
        activeActionPlayerId
      ) {
        return;
      }

      setActiveActionPlayerId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveActionPlayerId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeActionPlayerId]);

  useEffect(() => {
    const activePlayerId = reshufflingCourtPlayerId ?? replacingCourtPlayerId;
    if (!activePlayerId) {
      return;
    }

    setActiveActionPlayerId(`${match.id}:${activePlayerId}`);
  }, [match.id, replacingCourtPlayerId, reshufflingCourtPlayerId]);

  const handleTogglePlayerAction = (actionKey: string) => {
    if (actionDisabled) return;
    setActiveActionPlayerId((current) =>
      current === actionKey ? null : actionKey
    );
  };

  const handleReshuffleWithoutPlayer = (userId: string) => {
    setActiveActionPlayerId(`${match.id}:${userId}`);
    onReshuffleWithoutPlayer(userId);
  };

  const handleReplacePlayer = (userId: string) => {
    setActiveActionPlayerId(`${match.id}:${userId}`);
    onReplacePlayer(userId);
  };

  useEffect(() => {
    if (canEditScores) {
      return;
    }

    restoreSavedScoreInputScrollPosition();
  }, [canEditScores, restoreSavedScoreInputScrollPosition]);

  useEffect(() => {
    return () => {
      clearSavedScoreInputScrollPosition();
    };
  }, [clearSavedScoreInputScrollPosition]);

  return (
    <div className="space-y-3">
      <div
        ref={lineupRef}
        data-court-promotion-surface={match.id}
        className={`rounded-2xl border p-3 transition-all md:p-3.5 ${
          isPendingApproval
            ? "border-orange-200 bg-orange-50/60"
            : "border-blue-100 bg-blue-50/40"
        }`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_minmax(0,1fr)] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] sm:gap-3 md:grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_minmax(0,1fr)] md:gap-4 xl:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] xl:gap-3">
          <TeamNames
            matchId={match.id}
            players={[match.team1User1, match.team1User2]}
            canReshuffleWithoutPlayer={canReshuffleWithoutPlayer}
            activeActionPlayerId={activeActionPlayerId}
            reshufflingCourtPlayerId={reshufflingCourtPlayerId}
            replacingCourtPlayerId={replacingCourtPlayerId}
            actionDisabled={actionDisabled}
            onTogglePlayerAction={handleTogglePlayerAction}
            onReshuffleWithoutPlayer={handleReshuffleWithoutPlayer}
            onReplacePlayer={handleReplacePlayer}
          />
          <ScoreSlot
            matchId={match.id}
            canEdit={canEditScores}
            scoreValue={scores.team1}
            readonlyScore={isConfirmingSubmission ? scores.team1 : undefined}
            pendingScore={isPendingApproval ? match.team1Score : undefined}
            onScoreChange={(value) => onHandleScoreChange(match.id, "team1", value)}
            onScoreFocus={handleScoreInputFocus}
            onScoreBlur={handleScoreInputBlur}
          />
          <ScoreSlot
            matchId={match.id}
            canEdit={canEditScores}
            scoreValue={scores.team2}
            readonlyScore={isConfirmingSubmission ? scores.team2 : undefined}
            pendingScore={isPendingApproval ? match.team2Score : undefined}
            onScoreChange={(value) => onHandleScoreChange(match.id, "team2", value)}
            onScoreFocus={handleScoreInputFocus}
            onScoreBlur={handleScoreInputBlur}
          />
          <TeamNames
            matchId={match.id}
            players={[match.team2User1, match.team2User2]}
            align="right"
            canReshuffleWithoutPlayer={canReshuffleWithoutPlayer}
            activeActionPlayerId={activeActionPlayerId}
            reshufflingCourtPlayerId={reshufflingCourtPlayerId}
            replacingCourtPlayerId={replacingCourtPlayerId}
            actionDisabled={actionDisabled}
            onTogglePlayerAction={handleTogglePlayerAction}
            onReshuffleWithoutPlayer={handleReshuffleWithoutPlayer}
            onReplacePlayer={handleReplacePlayer}
          />
        </div>
      </div>

      {canEdit ? (
        <ScoreEntryControls
          canSubmit={!!scores.team1 && !!scores.team2}
          isConfirming={isConfirmingSubmission}
          isSubmitting={submittingMatchId === match.id}
          onSubmit={() => onRequestScoreSubmitConfirmation(match.id)}
          onConfirm={() => onSubmitScore(match.id)}
          onEdit={() => onCancelScoreSubmitConfirmation(match.id)}
        />
      ) : null}

      {isPendingApproval ? (
        <PendingApprovalActions
          canConfirmPending={!!canConfirmPending}
          isAdmin={isAdmin}
          isReopening={reopeningMatchId === match.id}
          onApprove={() => onApproveScore(match.id)}
          onReopen={() => onReopenScoreForEdit(match.id)}
        />
      ) : null}

      {match.status === MatchStatus.IN_PROGRESS && !canEdit ? (
        <div className="py-2 text-center">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-800">
            Match Active
          </span>
        </div>
      ) : null}
    </div>
  );
}
