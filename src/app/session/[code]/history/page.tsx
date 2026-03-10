"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";

import { EmptyState, FlashMessage, HeroCard, SectionCard } from "@/components/ui/chrome";
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
  matches: HistoryMatch[];
}

export default function SessionHistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  const [data, setData] = useState<SessionHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!code) return;

      try {
        const res = await fetch(`/api/sessions/${code}/history`);
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Failed to load match history");
        }

        const json = (await res.json()) as SessionHistoryData;
        setData(json);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load match history");
      } finally {
        setLoading(false);
      }
    };

    if (session?.user) {
      fetchHistory();
    }
  }, [code, session]);

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
            <button type="button" onClick={() => router.back()} className="app-button-secondary">
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
          backHref={`/session/${data.session.code}`}
          backLabel="Session"
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
                return (
                  <article key={match.id} className="app-subcard p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-gray-900">
                          Court {match.court.courtNumber}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(matchTimestamp).toLocaleDateString()} at{" "}
                          {new Date(matchTimestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`app-chip ${
                            isPendingApproval ? "app-chip-warning" : "app-chip-success"
                          }`}
                        >
                          {isPendingApproval ? "Awaiting approval" : "Completed"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                      <div
                        className={`app-panel-muted p-3 ${
                          match.winnerTeam === 1 ? "ring-1 ring-green-200" : ""
                        }`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Team 1
                        </p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
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
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Team 2
                        </p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
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
    </main>
  );
}
