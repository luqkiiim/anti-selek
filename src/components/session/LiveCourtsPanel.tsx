"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { QueuePromotionAnimation } from "@/app/session/[code]/sessionMatchActionTypes";
import { SectionCard } from "@/components/ui/chrome";
import {
  getSessionPoolBadgeLabel,
  summarizeSessionPoolMembership,
} from "@/lib/sessionPools";
import { SessionStatus } from "@/types/enums";
import type { Court, Match, MatchScores, Player, QueuedMatch } from "./sessionTypes";
import { LiveCourtCard } from "./LiveCourtCard";
import { QueuedMatchCard } from "./QueuedMatchCard";

interface LiveCourtsPanelProps {
  sessionStatus: string;
  courts: Court[];
  players: Player[];
  queuedMatch: QueuedMatch | null;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  currentUserId: string;
  isAdmin: boolean;
  isClaimedUser: boolean;
  confirmingScoreMatchId: string | null;
  activeMatchesCount: number;
  readyCourtsCount: number;
  creatableOpenCourtCount: number;
  creatableOpenCourtIds: string[];
  creatingOpenMatches: boolean;
  creatingOpenCourtCount: number;
  canQueueNextMatch: boolean;
  creatingQueuedMatch: boolean;
  manualQueueOpen: boolean;
  clearingQueuedMatch: boolean;
  reshufflingQueuedPlayerId: string | null;
  replacingQueuedPlayerId: string | null;
  reshufflingQueuedMatch: boolean;
  reshufflingCourtId: string | null;
  reshufflingCourtPlayerId: string | null;
  replacingCourtPlayerId: string | null;
  undoingCourtId: string | null;
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
  queuePromotionAnimation: QueuePromotionAnimation | null;
  onCreateMatchesForCourts: (courtIds: string[]) => void;
  onQueueNextMatch: () => void;
  onClearQueuedMatch: () => void;
  onOpenManualQueuedMatchModal: () => void;
  onReshuffleQueuedMatch: () => void;
  onReshuffleQueuedMatchWithoutPlayer: (userId: string) => void;
  onReplaceQueuedMatchPlayer: (userId: string) => void;
  onOpenManualMatchModal: (courtId: string) => void;
  onReshuffleMatch: (courtId: string) => void;
  onReshuffleMatchWithoutPlayer: (courtId: string, userId: string) => void;
  onReplaceMatchPlayer: (courtId: string, userId: string) => void;
  onUndoMatchSelection: (courtId: string) => void;
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
  onQueuePromotionAnimationComplete: () => void;
}

interface RectSnapshot {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PromotionGhostState {
  id: string;
  match: QueuedMatch;
  sourceRect: RectSnapshot;
  targetRect: RectSnapshot;
  flying: boolean;
}

const COURT_PULSE_CLEAR_MS = 760;
const GHOST_MOVE_MS = 680;
const GHOST_FADE_MS = 260;
const COURT_PULSE_DELAY_MS = 250;
const QUEUE_REVEAL_DELAY_MS = 520;
const GHOST_REMOVE_DELAY_MS = 920;
const QUEUE_RESET_DELAY_MS = 1140;
const ANIMATION_COMPLETE_DELAY_MS = 1280;

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePreference);
      return () => mediaQuery.removeEventListener("change", updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  return prefersReducedMotion;
}

function QueuePromotionGhostTeamNames({
  players,
  align = "left",
}: {
  players: [QueuedMatch["team1User1"], QueuedMatch["team1User2"]];
  align?: "left" | "right";
}) {
  const textAlignClass = align === "right" ? "text-right" : "text-left";

  return (
    <div className={`min-w-0 space-y-1 ${textAlignClass}`}>
      {players.map((player) => (
        <p
          key={player.id}
          className="truncate text-[14px] font-bold leading-tight text-gray-900 sm:text-base md:text-[1.35rem] xl:text-base"
        >
          {player.name}
        </p>
      ))}
    </div>
  );
}

function QueuePromotionGhostScoreSlot() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-100 bg-white text-lg font-black tabular-nums text-gray-300 sm:h-11 sm:w-11 sm:text-xl md:h-14 md:w-14 md:text-[2rem] xl:h-11 xl:w-11 xl:text-xl">
      -
    </div>
  );
}

function QueuePromotionGhost({ ghost }: { ghost: PromotionGhostState }) {
  if (typeof document === "undefined") {
    return null;
  }

  const translateX = ghost.targetRect.left - ghost.sourceRect.left;
  const translateY = ghost.targetRect.top - ghost.sourceRect.top;
  const scaleX = ghost.targetRect.width / Math.max(ghost.sourceRect.width, 1);
  const scaleY = ghost.targetRect.height / Math.max(ghost.sourceRect.height, 1);

  return createPortal(
    <div
      aria-hidden="true"
      data-queue-promotion-ghost="true"
      className="pointer-events-none fixed z-[70]"
      style={{
        top: ghost.sourceRect.top,
        left: ghost.sourceRect.left,
        width: ghost.sourceRect.width,
        height: ghost.sourceRect.height,
        transformOrigin: "top left",
        transform: ghost.flying
          ? `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`
          : "translate(0px, 0px) scale(1, 1)",
        opacity: ghost.flying ? 0.9 : 1,
        transition:
          `transform ${GHOST_MOVE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${GHOST_FADE_MS}ms ease`,
      }}
    >
      <div className="h-full rounded-2xl border border-blue-100 bg-blue-50/40 p-3 shadow-[0_24px_60px_-28px_rgba(13,63,136,0.5)] md:p-3.5">
        <div className="grid h-full grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_minmax(0,1fr)] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] sm:gap-3 md:grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_minmax(0,1fr)] md:gap-4 xl:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] xl:gap-3">
          <QueuePromotionGhostTeamNames
            players={[ghost.match.team1User1, ghost.match.team1User2]}
          />
          <QueuePromotionGhostScoreSlot />
          <QueuePromotionGhostScoreSlot />
          <QueuePromotionGhostTeamNames
            players={[ghost.match.team2User1, ghost.match.team2User2]}
            align="right"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function LiveCourtsPanel({
  sessionStatus,
  courts,
  players,
  queuedMatch,
  poolsEnabled,
  poolAName,
  poolBName,
  currentUserId,
  isAdmin,
  isClaimedUser,
  confirmingScoreMatchId,
  activeMatchesCount,
  readyCourtsCount,
  creatableOpenCourtCount,
  creatableOpenCourtIds,
  creatingOpenMatches,
  creatingOpenCourtCount,
  canQueueNextMatch,
  creatingQueuedMatch,
  manualQueueOpen,
  clearingQueuedMatch,
  reshufflingQueuedPlayerId,
  replacingQueuedPlayerId,
  reshufflingQueuedMatch,
  reshufflingCourtId,
  reshufflingCourtPlayerId,
  replacingCourtPlayerId,
  undoingCourtId,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  queuePromotionAnimation,
  onCreateMatchesForCourts,
  onQueueNextMatch,
  onClearQueuedMatch,
  onOpenManualQueuedMatchModal,
  onReshuffleQueuedMatch,
  onReshuffleQueuedMatchWithoutPlayer,
  onReplaceQueuedMatchPlayer,
  onOpenManualMatchModal,
  onReshuffleMatch,
  onReshuffleMatchWithoutPlayer,
  onReplaceMatchPlayer,
  onUndoMatchSelection,
  onHandleScoreChange,
  onRequestScoreSubmitConfirmation,
  onCancelScoreSubmitConfirmation,
  onSubmitScore,
  onApproveScore,
  onReopenScoreForEdit,
  onQueuePromotionAnimationComplete,
}: LiveCourtsPanelProps) {
  const orderedCourts = useMemo(
    () => courts.slice().sort((a, b) => a.courtNumber - b.courtNumber),
    [courts]
  );
  const prefersReducedMotion = usePrefersReducedMotion();
  const courtSurfaceRefs = useRef(new Map<string, HTMLDivElement | null>());
  const queuedSurfaceRef = useRef<HTMLDivElement | null>(null);
  const queuedSurfaceSnapshotRef = useRef<RectSnapshot | null>(null);
  const [ghostPromotion, setGhostPromotion] = useState<PromotionGhostState | null>(
    null
  );
  const [highlightedCourtId, setHighlightedCourtId] = useState<string | null>(null);
  const [queuedPromotionState, setQueuedPromotionState] = useState<
    "normal" | "suppressed" | "entering"
  >("normal");
  const showCreateMatchesAction =
    sessionStatus === SessionStatus.ACTIVE &&
    isAdmin &&
    !queuedMatch &&
    !canQueueNextMatch;
  const showQueueAction =
    sessionStatus === SessionStatus.ACTIVE &&
    isAdmin &&
    !queuedMatch &&
    canQueueNextMatch;
  const showQueuedMatchSlot = Boolean(queuedMatch) || canQueueNextMatch;
  const showCourtCountPills = courts.length >= 5;
  const canCreateMatches = creatableOpenCourtCount > 0 && !creatingOpenMatches;
  const optimisticCreatingCount = creatingOpenMatches ? creatingOpenCourtCount : 0;
  const displayedActiveMatchesCount = activeMatchesCount + optimisticCreatingCount;
  const displayedReadyCourtsCount = Math.max(
    0,
    readyCourtsCount - optimisticCreatingCount
  );
  const playerPoolById = new Map(players.map((player) => [player.userId, player.pool]));
  const setCourtSurfaceRef = useCallback(
    (courtId: string, node: HTMLDivElement | null) => {
      if (node) {
        courtSurfaceRefs.current.set(courtId, node);
        return;
      }

      courtSurfaceRefs.current.delete(courtId);
    },
    []
  );
  const setQueuedSurfaceNode = useCallback((node: HTMLDivElement | null) => {
    queuedSurfaceRef.current = node;
  }, []);

  useLayoutEffect(() => {
    const node = queuedSurfaceRef.current;
    if (!node) {
      return;
    }

    const updateSnapshot = () => {
      queuedSurfaceSnapshotRef.current = snapshotRect(node.getBoundingClientRect());
    };

    updateSnapshot();
    window.addEventListener("resize", updateSnapshot);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", updateSnapshot);
      };
    }

    const observer = new ResizeObserver(() => {
      updateSnapshot();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSnapshot);
    };
  }, [queuedMatch?.id, showQueuedMatchSlot]);

  useEffect(() => {
    if (!queuePromotionAnimation) {
      return;
    }

    const sourceRect =
      queuedSurfaceSnapshotRef.current ??
      (queuedSurfaceRef.current
        ? snapshotRect(queuedSurfaceRef.current.getBoundingClientRect())
        : null);
    const targetNode =
      courtSurfaceRefs.current.get(queuePromotionAnimation.targetCourtId) ?? null;
    const targetRect = targetNode
      ? snapshotRect(targetNode.getBoundingClientRect())
      : null;
    const shouldAnimateQueuedReplacement =
      queuePromotionAnimation.replacementQueuedMatchId !== null;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;

    const clearTargetPulse = () => {
      setHighlightedCourtId((current) =>
        current === queuePromotionAnimation.targetCourtId ? null : current
      );
    };

    const clearQueuedAnimationState = () => {
      setQueuedPromotionState((current) =>
        current === "suppressed" || current === "entering" ? "normal" : current
      );
    };

    const startCourtPulse = () => {
      setHighlightedCourtId(queuePromotionAnimation.targetCourtId);
      timers.push(setTimeout(clearTargetPulse, COURT_PULSE_CLEAR_MS));
    };

    if (!sourceRect || !targetRect || prefersReducedMotion) {
      timers.push(setTimeout(startCourtPulse, 0));
      if (shouldAnimateQueuedReplacement) {
        timers.push(setTimeout(() => setQueuedPromotionState("entering"), 0));
        timers.push(setTimeout(clearQueuedAnimationState, 420));
      } else {
        timers.push(setTimeout(clearQueuedAnimationState, 0));
      }
      timers.push(setTimeout(onQueuePromotionAnimationComplete, 520));

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
        clearTargetPulse();
        clearQueuedAnimationState();
      };
    }

    firstFrameId = window.requestAnimationFrame(() => {
      setQueuedPromotionState("suppressed");
      setGhostPromotion({
        id: queuePromotionAnimation.id,
        match: queuePromotionAnimation.sourceQueuedMatch,
        sourceRect,
        targetRect,
        flying: false,
      });

      secondFrameId = window.requestAnimationFrame(() => {
        setGhostPromotion((current) =>
          current?.id === queuePromotionAnimation.id
            ? { ...current, flying: true }
            : current
        );
      });
    });

    timers.push(setTimeout(startCourtPulse, COURT_PULSE_DELAY_MS));
    timers.push(
      setTimeout(() => {
        setQueuedPromotionState(
          shouldAnimateQueuedReplacement ? "entering" : "normal"
        );
      }, QUEUE_REVEAL_DELAY_MS)
    );
    timers.push(
      setTimeout(() => {
        setGhostPromotion((current) =>
          current?.id === queuePromotionAnimation.id ? null : current
        );
      }, GHOST_REMOVE_DELAY_MS)
    );
    timers.push(setTimeout(clearQueuedAnimationState, QUEUE_RESET_DELAY_MS));
    timers.push(
      setTimeout(onQueuePromotionAnimationComplete, ANIMATION_COMPLETE_DELAY_MS)
    );

    return () => {
      if (firstFrameId !== null) {
        window.cancelAnimationFrame(firstFrameId);
      }
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
      timers.forEach((timer) => clearTimeout(timer));
      setGhostPromotion((current) =>
        current?.id === queuePromotionAnimation.id ? null : current
      );
      clearTargetPulse();
      clearQueuedAnimationState();
    };
  }, [
    onQueuePromotionAnimationComplete,
    prefersReducedMotion,
    queuePromotionAnimation,
  ]);

  const getMatchPoolLabel = (match: Match | null) => {
    if (!poolsEnabled || !match) {
      return null;
    }

    return getSessionPoolBadgeLabel(
      {
        poolsEnabled,
        poolAName,
        poolBName,
      },
      summarizeSessionPoolMembership(
        [
          match.team1User1.id,
          match.team1User2.id,
          match.team2User1.id,
          match.team2User2.id,
        ],
        playerPoolById
      )
    );
  };
  const queuedPoolLabel =
    poolsEnabled && queuedMatch
      ? queuedMatch.targetPool
        ? (queuedMatch.targetPool === "A"
            ? (poolAName ?? "Open")
            : (poolBName ?? "Regular"))
        : getSessionPoolBadgeLabel(
            {
              poolsEnabled,
              poolAName,
              poolBName,
            },
            summarizeSessionPoolMembership(
              [
                queuedMatch.team1User1.id,
                queuedMatch.team1User2.id,
                queuedMatch.team2User1.id,
                queuedMatch.team2User2.id,
              ],
              playerPoolById
            )
          )
      : null;

  return (
    <SectionCard
      eyebrow={sessionStatus === SessionStatus.ACTIVE ? "Court board" : "Court layout"}
      eyebrowClassName="app-section-eyebrow"
      action={
        <div className="flex w-full min-w-0 items-start justify-between gap-3 sm:w-auto sm:justify-end">
          {showCourtCountPills ? (
            <div className="flex min-w-0 flex-col items-start gap-2">
              <span className="app-chip app-chip-accent">
                {displayedActiveMatchesCount} in use
              </span>
              <span className="app-chip app-chip-neutral">
                {displayedReadyCourtsCount} ready
              </span>
            </div>
          ) : null}
          {showCreateMatchesAction ? (
            <button
              type="button"
              onClick={() => onCreateMatchesForCourts(creatableOpenCourtIds)}
              disabled={!canCreateMatches}
              className="app-button-primary shrink-0 whitespace-nowrap px-4 py-2.5"
            >
              {creatingOpenMatches ? "Creating..." : "Create Matches"}
            </button>
          ) : null}
          {showQueueAction ? (
            <button
              type="button"
              onClick={onQueueNextMatch}
              disabled={creatingQueuedMatch}
              className="app-button-primary shrink-0 whitespace-nowrap px-4 py-2.5"
            >
              {creatingQueuedMatch ? "Queueing..." : "Queue Next Match"}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
        {orderedCourts.map((court) => (
          <LiveCourtCard
            key={court.id}
            sessionStatus={sessionStatus}
            court={court}
            poolLabel={getMatchPoolLabel(court.currentMatch)}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            isClaimedUser={isClaimedUser}
            confirmingScoreMatchId={confirmingScoreMatchId}
            reshufflingCourtId={reshufflingCourtId}
            reshufflingCourtPlayerId={reshufflingCourtPlayerId}
            replacingCourtPlayerId={replacingCourtPlayerId}
            undoingCourtId={undoingCourtId}
            reopeningMatchId={reopeningMatchId}
            submittingMatchId={submittingMatchId}
            matchScores={matchScores}
            promotionSurfaceRef={(node) => setCourtSurfaceRef(court.id, node)}
            isPromotionTarget={highlightedCourtId === court.id}
            onOpenManualMatchModal={onOpenManualMatchModal}
            onReshuffleMatch={onReshuffleMatch}
            onReshuffleMatchWithoutPlayer={onReshuffleMatchWithoutPlayer}
            onReplaceMatchPlayer={onReplaceMatchPlayer}
            onUndoMatchSelection={onUndoMatchSelection}
            onHandleScoreChange={onHandleScoreChange}
            onRequestScoreSubmitConfirmation={onRequestScoreSubmitConfirmation}
            onCancelScoreSubmitConfirmation={onCancelScoreSubmitConfirmation}
            onSubmitScore={onSubmitScore}
            onApproveScore={onApproveScore}
            onReopenScoreForEdit={onReopenScoreForEdit}
          />
        ))}
        {showQueuedMatchSlot ? (
          <QueuedMatchCard
            queuedMatch={queuedMatch}
            poolLabel={queuedPoolLabel}
            canReshuffleQueuedPlayers={isAdmin}
            canOpenManualQueue={isAdmin && !queuedMatch}
            clearingQueuedMatch={clearingQueuedMatch}
            creatingQueuedMatch={creatingQueuedMatch}
            creatingManualQueuedMatch={manualQueueOpen}
            reshufflingQueuedPlayerId={reshufflingQueuedPlayerId}
            replacingQueuedPlayerId={replacingQueuedPlayerId}
            reshufflingQueuedMatch={reshufflingQueuedMatch}
            promotionSurfaceRef={setQueuedSurfaceNode}
            promotionState={queuedPromotionState}
            onClearQueuedMatch={onClearQueuedMatch}
            onOpenManualQueuedMatchModal={onOpenManualQueuedMatchModal}
            onReshuffleQueuedMatch={onReshuffleQueuedMatch}
            onReshuffleQueuedPlayer={onReshuffleQueuedMatchWithoutPlayer}
            onReplaceQueuedPlayer={onReplaceQueuedMatchPlayer}
          />
        ) : null}
      </div>
      {ghostPromotion ? <QueuePromotionGhost ghost={ghostPromotion} /> : null}
    </SectionCard>
  );
}
