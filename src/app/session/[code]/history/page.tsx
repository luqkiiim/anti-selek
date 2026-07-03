"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Pencil, Undo2 } from "lucide-react";

import { SessionActionConfirmModal } from "@/components/session/SessionActionConfirmModal";
import { EmptyState, FlashMessage, HeroCard, SectionCard } from "@/components/ui/chrome";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { getErrorMessage } from "@/lib/http";
import { getSessionModeLabel, getSessionTypeLabel } from "@/lib/sessionModeLabels";
import { MatchStatus } from "@/types/enums";

interface HistoryMatch {
  id: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  winnerTeam?: number | null;
  team1Score?: number | null;
  team2Score?: number | null;
  team1EloChange?: number | null;
  team2EloChange?: number | null;
  team1ClubId?: string | null;
  team2ClubId?: string | null;
  court: {
    courtNumber: number;
    label?: string | null;
  };
  team1User1: { id: string; name: string };
  team1User2: { id: string; name: string };
  team2User1: { id: string; name: string };
  team2User2: { id: string; name: string };
}

interface SessionHistoryData {
  session: {
    id: string;
    code: string;
    clubId?: string | null;
    name: string;
    status: string;
    isTest?: boolean;
    type: string;
    mode: string;
    createdAt: string;
    endedAt?: string | null;
  };
  viewerCanManage?: boolean;
  canCorrectCompletedScores?: boolean;
  correctionBlockedReason?: string | null;
  undoableMatchId?: string | null;
  matches: HistoryMatch[];
}

export default function SessionHistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const code = params?.code as string;
  const openedFromSession = searchParams.get("from") === "session";

  const [data, setData] = useState<SessionHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [undoDraft, setUndoDraft] = useState<HistoryMatch | null>(null);
  const [undoingMatchId, setUndoingMatchId] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState<HistoryMatch | null>(
    null
  );
  const [correctionScores, setCorrectionScores] = useState({
    team1: "",
    team2: "",
  });
  const [correctingMatchId, setCorrectingMatchId] = useState<string | null>(
    null
  );
  const [openActionMatchId, setOpenActionMatchId] = useState<string | null>(
    null
  );

  const fetchHistory = useCallback(
    async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
      if (!code) return;

      if (showLoading) {
        setLoading(true);
      }
      setError("");
      setSuccess("");

      try {
        const res = await fetch(`/api/sessions/${code}/history`);
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error || "Failed to load match history");
        }

        const json = (await res.json()) as SessionHistoryData;
        setData(json);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Failed to load match history"
        );
      } finally {
        setLoading(false);
      }
    },
    [code]
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  const handleBack = () => {
    if (openedFromSession && typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.replace(`/session/${code}`);
  };

  useEffect(() => {
    if (session?.user) {
      void fetchHistory({ showLoading: true });
    }
  }, [fetchHistory, session]);

  useEffect(() => {
    setOpenActionMatchId(null);
  }, [data]);

  useEffect(() => {
    if (!openActionMatchId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;

      const actionRoot = event.target.closest("[data-match-action-root]");
      if (
        actionRoot?.getAttribute("data-match-action-root") ===
        openActionMatchId
      ) {
        return;
      }

      setOpenActionMatchId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenActionMatchId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionMatchId]);

  useEffect(() => {
    if (undoDraft || correctionDraft) {
      setOpenActionMatchId(null);
    }
  }, [undoDraft, correctionDraft]);

  const closeUndoDraft = () => {
    if (undoDraft && undoingMatchId === undoDraft.id) {
      return;
    }

    setUndoDraft(null);
  };

  const openCorrectionDraft = (match: HistoryMatch) => {
    setOpenActionMatchId(null);
    setCorrectionDraft(match);
    setCorrectionScores({
      team1:
        typeof match.team1Score === "number" ? String(match.team1Score) : "",
      team2:
        typeof match.team2Score === "number" ? String(match.team2Score) : "",
    });
    setError("");
    setSuccess("");
  };

  const closeCorrectionDraft = () => {
    if (correctionDraft && correctingMatchId === correctionDraft.id) {
      return;
    }

    setCorrectionDraft(null);
  };

  const confirmUndoResult = async () => {
    if (!undoDraft) return;

    setUndoingMatchId(undoDraft.id);
    setError("");

    try {
      const res = await fetch(`/api/matches/${undoDraft.id}/undo`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setError(getErrorMessage(payload, "Failed to undo result"));
        return;
      }

      setUndoDraft(null);
      await fetchHistory();
      setSuccess("Result undone.");
    } catch (err) {
      console.error(err);
      setError("Network error undoing result");
    } finally {
      setUndoingMatchId(null);
    }
  };

  const confirmScoreCorrection = async () => {
    if (!correctionDraft) return;

    const team1Score = Number(correctionScores.team1);
    const team2Score = Number(correctionScores.team2);
    if (
      !Number.isInteger(team1Score) ||
      !Number.isInteger(team2Score)
    ) {
      setError("Enter whole-number scores.");
      return;
    }

    setCorrectingMatchId(correctionDraft.id);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/matches/${correctionDraft.id}/correction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1Score, team2Score }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setError(getErrorMessage(payload, "Failed to correct score"));
        return;
      }

      setCorrectionDraft(null);
      await fetchHistory();
      setSuccess("Score corrected.");
    } catch (err) {
      console.error(err);
      setError("Network error correcting score");
    } finally {
      setCorrectingMatchId(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel px-8 py-8">
          <p className="app-eyebrow">Loading history</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <main className="app-page">
        <div className="app-shell-narrow">
          <FlashMessage tone="error">{error || "Match history not found"}</FlashMessage>
          <div className="mt-6">
            <button type="button" onClick={handleBack} className="app-button-secondary">
              Go back
            </button>
          </div>
        </div>
      </main>
    );
  }

  const sessionTypeLabel = getSessionTypeLabel(data.session.type);
  const sessionModeLabel = getSessionModeLabel(data.session.mode);
  const getProfileHref = (userId: string, clubId?: string | null) => {
    const profileClubId = clubId ?? data.session.clubId ?? null;
    return profileClubId
      ? `/profile/${userId}?clubId=${encodeURIComponent(profileClubId)}`
      : `/profile/${userId}`;
  };

  return (
    <main className="app-page">
      <div className="app-shell space-y-6">
        <HeroCard
          eyebrow="Match history"
          title={data.session.name}
          onBack={handleBack}
          backLabel="Back"
          meta={
            <>
              <span className="app-chip app-chip-neutral">{data.session.status}</span>
              <span className="app-chip app-chip-neutral">{sessionTypeLabel}</span>
              <span className="app-chip app-chip-neutral">{sessionModeLabel}</span>
            </>
          }
        />

        {success ? <FlashMessage tone="success">{success}</FlashMessage> : null}
        {data.correctionBlockedReason ? (
          <FlashMessage tone="warning">
            {data.correctionBlockedReason}
          </FlashMessage>
        ) : null}

        <SectionCard
          title="Session matches"
          action={<span className="app-chip app-chip-neutral">{data.matches.length} matches</span>}
        >
          {data.matches.length === 0 ? (
            <EmptyState
              title="No matches yet"
            />
          ) : (
            <div className="space-y-3">
              {data.matches.map((match) => {
                const isPendingApproval = match.status === MatchStatus.PENDING_APPROVAL;
                const matchTimestamp = match.completedAt ?? match.createdAt;
                const canUndoResult =
                  data.viewerCanManage === true &&
                  data.undoableMatchId === match.id &&
                  match.status === MatchStatus.COMPLETED;
                const canCorrectScore =
                  data.canCorrectCompletedScores === true &&
                  match.status === MatchStatus.COMPLETED;
                const hasMatchActions = canCorrectScore || canUndoResult;
                const matchActionMenuOpen = openActionMatchId === match.id;
                const courtLabel = getCourtDisplayLabel(match.court);
                const matchTime = new Date(matchTimestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <article key={match.id} className="app-subcard p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-gray-900">
                          {courtLabel}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <div className="inline-flex items-center gap-1.5">
                          <p className="text-sm text-gray-600">{matchTime}</p>
                          {hasMatchActions ? (
                            <div
                              className="relative"
                              data-match-action-root={match.id}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenActionMatchId((current) =>
                                    current === match.id ? null : match.id
                                  )
                                }
                                aria-label={`Open actions for ${courtLabel}`}
                                aria-haspopup="menu"
                                aria-expanded={matchActionMenuOpen}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 active:scale-95"
                              >
                                <MoreHorizontal aria-hidden="true" size={17} />
                              </button>

                              {matchActionMenuOpen ? (
                                <div className="absolute right-0 top-full z-20 mt-2 w-44 max-w-[calc(100vw-3rem)]">
                                  <div
                                    role="menu"
                                    aria-label={`${courtLabel} actions`}
                                    className="overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm font-semibold text-gray-800 shadow-[0_18px_44px_rgba(23,32,31,0.16)]"
                                  >
                                    {canCorrectScore ? (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => openCorrectionDraft(match)}
                                        className="inline-flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-[var(--accent-faint)] hover:text-[var(--accent-strong)]"
                                      >
                                        <Pencil aria-hidden="true" size={16} />
                                        Correct score
                                      </button>
                                    ) : null}
                                    {canUndoResult ? (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          setOpenActionMatchId(null);
                                          setUndoDraft(match);
                                        }}
                                        className="inline-flex w-full items-center gap-2 px-3 py-2.5 text-left text-rose-700 transition hover:bg-rose-50"
                                      >
                                        <Undo2 aria-hidden="true" size={16} />
                                        Undo result
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        {isPendingApproval ? (
                          <span className="app-chip app-chip-warning">Awaiting approval</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                      <div
                        className={`app-panel-muted p-3 ${
                          match.winnerTeam === 1 ? "ring-1 ring-green-200" : ""
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900">
                          <Link href={getProfileHref(match.team1User1.id, match.team1ClubId)} className="hover:text-blue-600 hover:underline">
                            {match.team1User1.name}
                          </Link>
                          {" & "}
                          <Link href={getProfileHref(match.team1User2.id, match.team1ClubId)} className="hover:text-blue-600 hover:underline">
                            {match.team1User2.name}
                          </Link>
                        </p>
                      </div>

                      <div className="mx-auto rounded-full bg-gray-100 px-3 py-2 text-center text-xs font-semibold text-gray-900 sm:px-4 sm:text-sm">
                        {typeof match.team1Score === "number" && typeof match.team2Score === "number"
                          ? `${match.team1Score} - ${match.team2Score}`
                          : "Pending"}
                      </div>

                      <div
                        className={`app-panel-muted p-3 ${
                          match.winnerTeam === 2 ? "ring-1 ring-green-200" : ""
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900">
                          <Link href={getProfileHref(match.team2User1.id, match.team2ClubId)} className="hover:text-blue-600 hover:underline">
                            {match.team2User1.name}
                          </Link>
                          {" & "}
                          <Link href={getProfileHref(match.team2User2.id, match.team2ClubId)} className="hover:text-blue-600 hover:underline">
                            {match.team2User2.name}
                          </Link>
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {undoDraft ? (
        <SessionActionConfirmModal
          title="Undo result?"
          subtitle="Removes the result and reverses standings."
          details={
            <div className="space-y-4">
              <div className="app-panel-muted space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {getCourtDisplayLabel(undoDraft.court)}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-gray-700">
                    {typeof undoDraft.team1Score === "number" &&
                    typeof undoDraft.team2Score === "number"
                      ? `${undoDraft.team1Score} - ${undoDraft.team2Score}`
                      : "Recorded result"}
                  </p>
                </div>
                <div className="space-y-1 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">
                    {undoDraft.team1User1.name} &amp;{" "}
                    {undoDraft.team1User2.name}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    vs
                  </p>
                  <p className="font-semibold text-gray-900">
                    {undoDraft.team2User1.name} &amp;{" "}
                    {undoDraft.team2User2.name}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Current live matches and queued matches will stay as they are.
              </p>
            </div>
          }
          confirmLabel="Undo Result"
          cancelLabel="Keep Result"
          isSubmitting={undoingMatchId === undoDraft.id}
          onClose={closeUndoDraft}
          onConfirm={() => void confirmUndoResult()}
        />
      ) : null}

      {correctionDraft ? (
        <SessionActionConfirmModal
          title="Correct score?"
          subtitle="Replays ratings from this match onward."
          details={
            <div className="space-y-4">
              <div className="app-panel-muted space-y-3 p-4">
                <div className="space-y-1 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">
                    {correctionDraft.team1User1.name} &amp;{" "}
                    {correctionDraft.team1User2.name}
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={correctionScores.team1}
                    onChange={(event) =>
                      setCorrectionScores((current) => ({
                        ...current,
                        team1: event.target.value,
                      }))
                    }
                    className="field w-full px-3 py-2.5 text-sm"
                    aria-label="Team 1 corrected score"
                  />
                </div>
                <div className="space-y-1 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">
                    {correctionDraft.team2User1.name} &amp;{" "}
                    {correctionDraft.team2User2.name}
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={correctionScores.team2}
                    onChange={(event) =>
                      setCorrectionScores((current) => ({
                        ...current,
                        team2: event.target.value,
                      }))
                    }
                    className="field w-full px-3 py-2.5 text-sm"
                    aria-label="Team 2 corrected score"
                  />
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Rankings, podium, profiles, and share images will use the
                corrected result.
              </p>
            </div>
          }
          confirmLabel="Save Correction"
          cancelLabel="Keep Result"
          isSubmitting={correctingMatchId === correctionDraft.id}
          onClose={closeCorrectionDraft}
          onConfirm={() => void confirmScoreCorrection()}
        />
      ) : null}
    </main>
  );
}
