"use client";

import { SectionCard } from "@/components/ui/chrome";
import { canApprovePendingSubmission } from "@/lib/matchApprovalRules";
import { MatchStatus, SessionStatus } from "@/types/enums";
import type { Court, Match, MatchScores } from "./sessionTypes";

interface LiveCourtsPanelProps {
  sessionStatus: string;
  courts: Court[];
  currentUserId: string;
  isAdmin: boolean;
  isClaimedUser: boolean;
  activeMatchesCount: number;
  readyCourtsCount: number;
  creatableOpenCourtCount: number;
  creatableOpenCourtIds: string[];
  creatingOpenMatches: boolean;
  undoingCourtId: string | null;
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
  onCreateMatchesForCourts: (courtIds: string[]) => void;
  onOpenManualMatchModal: (courtId: string) => void;
  onReshuffleMatch: (courtId: string) => void;
  onUndoMatchSelection: (courtId: string) => void;
  onHandleScoreChange: (
    matchId: string,
    team: "team1" | "team2",
    value: string
  ) => void;
  onOpenScoreSubmissionDraft: (match: Match) => void;
  onApproveScore: (matchId: string) => void;
  onReopenScoreForEdit: (matchId: string) => void;
}

export function LiveCourtsPanel({
  sessionStatus,
  courts,
  currentUserId,
  isAdmin,
  isClaimedUser,
  activeMatchesCount,
  readyCourtsCount,
  creatableOpenCourtCount,
  creatableOpenCourtIds,
  creatingOpenMatches,
  undoingCourtId,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  onCreateMatchesForCourts,
  onOpenManualMatchModal,
  onReshuffleMatch,
  onUndoMatchSelection,
  onHandleScoreChange,
  onOpenScoreSubmissionDraft,
  onApproveScore,
  onReopenScoreForEdit,
}: LiveCourtsPanelProps) {
  return (
    <SectionCard
      title={sessionStatus === SessionStatus.ACTIVE ? "Live Courts" : "Courts"}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="app-chip app-chip-info">{activeMatchesCount} in use</span>
          <span className="app-chip app-chip-neutral">{readyCourtsCount} ready</span>
          {sessionStatus === SessionStatus.ACTIVE &&
          isAdmin &&
          creatableOpenCourtCount > 0 ? (
            <button
              type="button"
              onClick={() => onCreateMatchesForCourts(creatableOpenCourtIds)}
              disabled={creatingOpenMatches}
              className="app-button-primary"
            >
              {creatingOpenMatches
                ? creatableOpenCourtCount === 1
                  ? "Creating..."
                  : `Creating ${creatableOpenCourtCount}...`
                : creatableOpenCourtCount === 1
                  ? "Create Match"
                  : `Create ${creatableOpenCourtCount} Matches`}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {courts
          .slice()
          .sort((a, b) => a.courtNumber - b.courtNumber)
          .map((court) => {
            const currentMatch = court.currentMatch;
            const isParticipant =
              currentMatch &&
              [
                currentMatch.team1User1.id,
                currentMatch.team1User2.id,
                currentMatch.team2User1.id,
                currentMatch.team2User2.id,
              ].includes(currentUserId);

            const canEdit =
              currentMatch?.status === MatchStatus.IN_PROGRESS &&
              (isAdmin || isParticipant);
            const canConfirmPending =
              currentMatch?.status === MatchStatus.PENDING_APPROVAL &&
              (currentMatch.scoreSubmittedByUserId
                ? canApprovePendingSubmission({
                    match: {
                      team1User1Id: currentMatch.team1User1.id,
                      team1User2Id: currentMatch.team1User2.id,
                      team2User1Id: currentMatch.team2User1.id,
                      team2User2Id: currentMatch.team2User2.id,
                    },
                    approverUserId: currentUserId,
                    approverIsAdmin: isAdmin,
                    approverIsClaimed: isClaimedUser,
                    scoreSubmittedByUserId: currentMatch.scoreSubmittedByUserId,
                  })
                : isAdmin || isParticipant);
            const scores = currentMatch
              ? matchScores[currentMatch.id] || { team1: "", team2: "" }
              : { team1: "", team2: "" };

            return (
              <div
                key={court.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-3 py-2.5">
                  <h2 className="text-sm font-black uppercase tracking-widest text-gray-500">
                    Court {court.courtNumber}
                  </h2>
                  <div className="flex gap-2">
                    {sessionStatus === SessionStatus.ACTIVE &&
                    !court.currentMatch &&
                    isAdmin ? (
                      <button
                        onClick={() => onOpenManualMatchModal(court.id)}
                        className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-all active:scale-95"
                      >
                        Manual
                      </button>
                    ) : null}
                    {currentMatch &&
                    currentMatch.status === MatchStatus.IN_PROGRESS &&
                    isAdmin ? (
                      <button
                        onClick={() => onReshuffleMatch(court.id)}
                        className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-600 transition-all active:scale-95"
                        title="Pick different players"
                      >
                        Reshuffle
                      </button>
                    ) : null}
                    {currentMatch &&
                    currentMatch.status === MatchStatus.IN_PROGRESS &&
                    isAdmin ? (
                      <button
                        onClick={() => onUndoMatchSelection(court.id)}
                        disabled={undoingCourtId === court.id}
                        className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-700 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Put selected players back in pool"
                      >
                        {undoingCourtId === court.id ? "Undoing..." : "Undo"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-center p-3">
                  {currentMatch ? (
                    <div className="space-y-3">
                      <div
                        className={`rounded-xl border-2 p-3 transition-all ${
                          currentMatch.status === MatchStatus.PENDING_APPROVAL
                            ? "border-gray-100 bg-gray-50"
                            : "border-blue-100 bg-blue-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-blue-600">
                              Team 1
                            </p>
                            <p className="truncate text-sm font-bold leading-tight text-gray-900">
                              {currentMatch.team1User1.name}
                              <br />
                              {currentMatch.team1User2.name}
                            </p>
                          </div>
                          {canEdit ? (
                            <input
                              type="number"
                              inputMode="numeric"
                              value={scores.team1}
                              onChange={(e) =>
                                onHandleScoreChange(
                                  currentMatch.id,
                                  "team1",
                                  e.target.value
                                )
                              }
                              className="h-12 w-14 rounded-xl border-2 border-blue-200 bg-white text-center text-xl font-black focus:border-blue-500 focus:outline-none"
                              placeholder="0"
                            />
                          ) : currentMatch.status === MatchStatus.PENDING_APPROVAL ? (
                            <div className="pr-2 text-2xl font-black text-gray-900">
                              {currentMatch.team1Score}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative flex items-center justify-center py-1">
                        <div className="h-px flex-1 bg-gray-100" />
                        <span className="mx-3 text-[10px] font-black uppercase italic text-gray-300">
                          VS
                        </span>
                        <div className="h-px flex-1 bg-gray-100" />
                      </div>

                      <div
                        className={`rounded-xl border-2 p-3 transition-all ${
                          currentMatch.status === MatchStatus.PENDING_APPROVAL
                            ? "border-gray-100 bg-gray-50"
                            : "border-blue-200 bg-blue-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-blue-700">
                              Team 2
                            </p>
                            <p className="truncate text-sm font-bold leading-tight text-gray-900">
                              {currentMatch.team2User1.name}
                              <br />
                              {currentMatch.team2User2.name}
                            </p>
                          </div>
                          {canEdit ? (
                            <input
                              type="number"
                              inputMode="numeric"
                              value={scores.team2}
                              onChange={(e) =>
                                onHandleScoreChange(
                                  currentMatch.id,
                                  "team2",
                                  e.target.value
                                )
                              }
                              className="h-12 w-14 rounded-xl border-2 border-blue-200 bg-white text-center text-xl font-black focus:border-blue-500 focus:outline-none"
                              placeholder="0"
                            />
                          ) : currentMatch.status === MatchStatus.PENDING_APPROVAL ? (
                            <div className="pr-2 text-2xl font-black text-gray-900">
                              {currentMatch.team2Score}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {canEdit ? (
                        <div className="pt-2">
                          <button
                            onClick={() => onOpenScoreSubmissionDraft(currentMatch)}
                            disabled={
                              submittingMatchId === currentMatch.id ||
                              !scores.team1 ||
                              !scores.team2
                            }
                            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-black uppercase text-white shadow-md transition-all active:scale-95 active:bg-gray-800 disabled:opacity-50"
                          >
                            {submittingMatchId === currentMatch.id
                              ? "Saving..."
                              : "Submit Score"}
                          </button>
                        </div>
                      ) : null}

                      {currentMatch.status === MatchStatus.PENDING_APPROVAL ? (
                        <div className="space-y-2 pt-2">
                          {canConfirmPending || isAdmin ? (
                            <div
                              className={`grid gap-2 ${
                                isAdmin ? "grid-cols-2" : "grid-cols-1"
                              }`}
                            >
                              {canConfirmPending ? (
                                <button
                                  onClick={() => onApproveScore(currentMatch.id)}
                                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black uppercase text-white shadow-md transition-all active:scale-95 active:bg-blue-700"
                                >
                                  Confirm Results
                                </button>
                              ) : null}
                              {isAdmin ? (
                                <button
                                  onClick={() =>
                                    onReopenScoreForEdit(currentMatch.id)
                                  }
                                  disabled={reopeningMatchId === currentMatch.id}
                                  className="w-full rounded-xl border border-gray-200 bg-gray-100 py-3 text-sm font-black uppercase text-gray-700 transition-all active:scale-95 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {reopeningMatchId === currentMatch.id
                                    ? "Opening..."
                                    : "Back To Edit"}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="rounded-lg border border-orange-100 bg-orange-50 py-2 text-center text-[10px] font-black uppercase tracking-widest text-orange-700">
                            Awaiting Confirmation
                          </div>
                        </div>
                      ) : null}

                      {currentMatch.status === MatchStatus.IN_PROGRESS && !canEdit ? (
                        <div className="py-2 text-center">
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-800">
                            Match Active
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="px-4 py-10 text-center">
                      <div className="mb-2 text-xs font-black tracking-[0.35em] opacity-40">
                        COURT
                      </div>
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                        {sessionStatus === SessionStatus.ACTIVE
                          ? "Next match soon"
                          : "Court Inactive"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </SectionCard>
  );
}
