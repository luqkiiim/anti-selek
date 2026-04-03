"use client";

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
  reshufflingQueuedMatch: boolean;
  reshufflingCourtId: string | null;
  reshufflingCourtPlayerId: string | null;
  undoingCourtId: string | null;
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
  onCreateMatchesForCourts: (courtIds: string[]) => void;
  onQueueNextMatch: () => void;
  onClearQueuedMatch: () => void;
  onOpenManualQueuedMatchModal: () => void;
  onReshuffleQueuedMatch: () => void;
  onReshuffleQueuedMatchWithoutPlayer: (userId: string) => void;
  onOpenManualMatchModal: (courtId: string) => void;
  onReshuffleMatch: (courtId: string) => void;
  onReshuffleMatchWithoutPlayer: (courtId: string, userId: string) => void;
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
  reshufflingQueuedMatch,
  reshufflingCourtId,
  reshufflingCourtPlayerId,
  undoingCourtId,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  onCreateMatchesForCourts,
  onQueueNextMatch,
  onClearQueuedMatch,
  onOpenManualQueuedMatchModal,
  onReshuffleQueuedMatch,
  onReshuffleQueuedMatchWithoutPlayer,
  onOpenManualMatchModal,
  onReshuffleMatch,
  onReshuffleMatchWithoutPlayer,
  onUndoMatchSelection,
  onHandleScoreChange,
  onRequestScoreSubmitConfirmation,
  onCancelScoreSubmitConfirmation,
  onSubmitScore,
  onApproveScore,
  onReopenScoreForEdit,
}: LiveCourtsPanelProps) {
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
        {courts
          .slice()
          .sort((a, b) => a.courtNumber - b.courtNumber)
          .map((court) => (
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
              undoingCourtId={undoingCourtId}
              reopeningMatchId={reopeningMatchId}
              submittingMatchId={submittingMatchId}
              matchScores={matchScores}
              onOpenManualMatchModal={onOpenManualMatchModal}
              onReshuffleMatch={onReshuffleMatch}
              onReshuffleMatchWithoutPlayer={onReshuffleMatchWithoutPlayer}
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
            reshufflingQueuedMatch={reshufflingQueuedMatch}
            onClearQueuedMatch={onClearQueuedMatch}
            onOpenManualQueuedMatchModal={onOpenManualQueuedMatchModal}
            onReshuffleQueuedMatch={onReshuffleQueuedMatch}
            onReshuffleQueuedPlayer={onReshuffleQueuedMatchWithoutPlayer}
          />
        ) : null}
      </div>
    </SectionCard>
  );
}
