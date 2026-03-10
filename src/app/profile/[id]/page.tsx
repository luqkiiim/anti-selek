"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { EmptyState, FlashMessage, HeroCard, SectionCard, StatCard } from "@/components/ui/chrome";

interface UserStats {
  user: {
    id: string;
    name: string;
    elo: number;
    createdAt: string;
  };
  context?: {
    communityId: string;
  } | null;
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    winRate: number;
    pointsScored: number;
    pointsConceded: number;
  };
  matchHistory: {
    id: string;
    date: string;
    sessionName: string;
    partner: { id: string; name: string };
    opponents: { id: string; name: string }[];
    score: string;
    result: "WIN" | "LOSS";
    eloChange?: number;
  }[];
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const communityId = searchParams.get("communityId") || "";

  const [data, setData] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : "";
        const res = await fetch(`/api/users/${id}/stats${query}`);
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    if (session?.user) {
      fetchData();
    }
  }, [id, session, communityId]);

  const pointDifferential = useMemo(() => {
    if (!data) return 0;
    return data.stats.pointsScored - data.stats.pointsConceded;
  }, [data]);

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel px-8 py-8">
          <p className="app-eyebrow">Loading profile</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <main className="app-page">
        <div className="app-shell-narrow">
          <FlashMessage tone="error">
            {error || "Profile not found"}
          </FlashMessage>
          <div className="mt-6">
            <button type="button" onClick={() => router.back()} className="app-button-secondary">
              Go back
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-page">
      <div className="app-shell space-y-6">
        <HeroCard
          eyebrow="Player profile"
          title={data.user.name}
          description={`Joined ${new Date(data.user.createdAt).toLocaleDateString()}. Review lifetime performance, tournament history, and ${data.context?.communityId ? "community" : "overall"} rating at a glance.`}
          backHref={communityId ? `/community/${communityId}` : "/"}
          backLabel="Back"
          meta={
            <span className="app-chip app-chip-warning">
              {data.context?.communityId ? "Community Rating" : "Overall Rating"} {data.user.elo}
            </span>
          }
          actions={
            communityId ? (
              <Link href={`/community/${communityId}`} className="app-button-secondary">
                Open community
              </Link>
            ) : undefined
          }
        />

        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label="Matches" value={data.stats.totalMatches} detail="All recorded doubles results" accent />
          <StatCard label="Win rate" value={`${data.stats.winRate}%`} detail={`${data.stats.wins} wins and ${data.stats.losses} losses`} />
          <StatCard label="Points scored" value={data.stats.pointsScored} detail={`${data.stats.pointsConceded} conceded`} />
          <StatCard
            label="Point differential"
            value={pointDifferential > 0 ? `+${pointDifferential}` : pointDifferential}
            detail={pointDifferential >= 0 ? "Positive match margin" : "Room to recover"}
          />
        </section>

        <SectionCard
          eyebrow="History"
          title="Match timeline"
          description="Every recorded result for this player, including partner pairings and rating movement when applicable."
          action={<span className="app-chip app-chip-neutral">{data.matchHistory.length} matches</span>}
        >
          {data.matchHistory.length === 0 ? (
            <EmptyState title="No matches played yet" detail="Once a tournament result is approved, it will appear here." />
          ) : (
            <div className="space-y-3">
              {data.matchHistory.map((match) => (
                <article key={match.id} className="app-subcard p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-gray-900">{match.sessionName}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(match.date).toLocaleDateString()} at{" "}
                        {new Date(match.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`app-chip ${match.result === "WIN" ? "app-chip-success" : "app-chip-danger"}`}>
                        {match.result}
                      </span>
                      {typeof match.eloChange === "number" ? (
                        <span className={`app-chip ${match.eloChange >= 0 ? "app-chip-success" : "app-chip-danger"}`}>
                          {match.eloChange >= 0 ? "+" : ""}
                          {match.eloChange} Rating
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
                    <div className="app-panel-muted p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Team</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {data.user.name} &amp; {match.partner.name}
                      </p>
                    </div>

                    <div className="mx-auto rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-900">
                      {match.score}
                    </div>

                    <div className="app-panel-muted p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Opponents</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {match.opponents.map((opponent) => opponent.name).join(" & ")}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
