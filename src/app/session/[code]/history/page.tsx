"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

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
    communityId?: string | null;
    name: string;
    status: string;
    type: string;
    mode: string;
    createdAt: string;
    endedAt?: string | null;
  };
  viewerCanManage?: boolean;
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
  const [undoDraft, setUndoDraft] = useState<HistoryMatch | null>(null);
  const [undoingMatchId, setUndoingMatchId] = useState<string | null>(null);

  const fetchHistory = useCallback(
    async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
      if (!code) return;

      if (showLoading) {
        setLoading(true);
      }
      setError("");

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

  const closeUndoDraft = () => {
    if (undoDraft && undoingMatchId === undoDraft.id) {
      return;
    }

    setUndoDraft(null);
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
    } catch (err) {
      console.error(err);
      setError("Network error undoing result");
    } finally {
      setUndoingMatchId(null);
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
  const getProfileHref = (userId: string) =>
    data.session.communityId
      ? `/profile/${userId}?communityId=${data.session.communityId}`
      : `/profile/${userId}`;

  return (
    <main className="app-page">
      <div className="app-shell space-y-6">
        <HeroCard
          eyebrow="Match history"
          title={data.session.name}
          description={`${data.matches.length} recorded matches`}
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

        <SectionCard
          title="Session matches"
          action={<span className="app-chip app-chip-neutral">{data.matches.length} matches</span>}
        >
          {data.matches.length === 0 ? (
            <EmptyState
              title="No matches recorded yet"
              detail="Completed or submitted matches will appear here as the session progresses."
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
                return (
                  <article key={match.id} className="app-subcard p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-lg font-semibold text-gray-900">
                          {getCourtDisplayLabel(match.court)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(matchTimestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      {isPendingApproval ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="app-chip app-chip-warning">Awaiting approval</span>
                        </div>
                      ) : null}
                      {canUndoResult ? (
                        <div className="flex justify-start lg:justify-end">
                          <button
                            type="button"
                            onClick={() => setUndoDraft(match)}
                            className="app-button-danger min-h-10 px-3 py-2 text-xs"
                          >
                            Undo result
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                      <div
                        className={`app-panel-muted p-3 ${
                          match.winnerTeam === 1 ? "ring-1 ring-green-200" : ""
                        }`}
                      >
                        <p className="text-sm font-semibold text-gray-900">
                          <Link href={getProfileHref(match.team1User1.id)} className="hover:text-blue-600 hover:underline">
                            {match.team1User1.name}
                          </Link>
                          {" & "}
                          <Link href={getProfileHref(match.team1User2.id)} className="hover:text-blue-600 hover:underline">
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
                          <Link href={getProfileHref(match.team2User1.id)} className="hover:text-blue-600 hover:underline">
                            {match.team2User1.name}
                          </Link>
                          {" & "}
                          <Link href={getProfileHref(match.team2User2.id)} className="hover:text-blue-600 hover:underline">
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
          subtitle="This removes the latest recorded result and reverses its standings and rating changes."
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
    </main>
  );
}
