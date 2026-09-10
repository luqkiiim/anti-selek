"use client";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUp,
  CaretRight,
  GearSix,
  ChartBar,
  CalendarBlank,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import { PlayRow } from "./PlayShell";
import { usePlayerStats } from "./usePlayerStats";
import type { useClubPage } from "@/features/club-page/useClubPage";
export function ClubHome({ c }: { c: ReturnType<typeof useClubPage> }) {
  const { data, error } = usePlayerStats(c.user?.id, c.clubId);
  const latest = data?.sessions.latest;
  const live = c.activeTournaments[0];
  const rank = data?.context?.rankContext.currentRank;
  const delta = latest?.ratingChange;
  return (
    <>
      <section className="club-welcome">
        <div>
          <span className="eyebrow">YOUR CLUB, TOGETHER</span>
          <h1>Ready for a rally?</h1>
        </div>
        <Image src="/play/spark.png" alt="" width={123} height={123} priority />
      </section>
      {live ? (
        <section className="session-tile">
          <span className="eyebrow">
            {live.status === "ACTIVE" ? "LIVE NOW" : "COMING UP"}
          </span>
          <h2>{live.name}</h2>
          <p className="quiet">{live.players.length} players</p>
          <Link href={`/session/${live.code}`} className="primary">
            {c.canManageClub ? "Continue hosting" : "View session"}
            <CaretRight size={19} />
          </Link>
        </section>
      ) : (
        <section className="session-tile">
          <span className="eyebrow">NEXT UP</span>
          <h2>Make time to play.</h2>
          <p className="quiet">No active session in this club.</p>
          {c.canManageClub ? (
            <Link href={`/club/${c.clubId}?tab=host`} className="primary">
              Host a session
              <CaretRight size={19} />
            </Link>
          ) : (
            <Link
              className="secondary"
              href={`/club/${c.clubId}?tab=tournaments`}
            >
              Browse sessions
            </Link>
          )}
        </section>
      )}
      <div className="link-group">
        {c.canAdminClub && (
          <PlayRow
            title="Manage club"
            sub="Players, requests and settings"
            icon={<GearSix size={25} />}
            href={`/club/${c.clubId}/admin`}
          />
        )}
        <PlayRow
          title="Club standings"
          sub="Ratings in this club"
          icon={<ChartBar size={25} />}
          href={`/club/${c.clubId}?tab=leaderboard`}
        />
      </div>
      <div className="section-head">
        <h3>Your progress here</h3>
        <Link className="text-button" href={`/club/${c.clubId}?tab=profile`}>
          View profile
        </Link>
      </div>
      {data ? (
        <section className="stats-card">
          <div>
            <small>Club rating</small>
            <strong className="big-number">{data.user.elo}</strong>
            <span className={(delta ?? 0) < 0 ? "gain loss" : "gain"}>
              {delta !== undefined ? (
                <>
                  {delta > 0 && <ArrowUp size={14} />}
                  <b>
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </b>
                  <em>
                    {latest?.code === live?.code
                      ? "this session"
                      : "last session"}
                  </em>
                </>
              ) : (
                <em>Play to start your story</em>
              )}
            </span>
          </div>
          <div>
            <small>Club rank</small>
            <strong className="big-number">{rank ? `#${rank}` : "—"}</strong>
            <span className="gain">
              <em>
                {rank
                  ? `of ${data.context?.rankContext.leaderboardSize} players`
                  : "Not ranked yet"}
              </em>
            </span>
          </div>
        </section>
      ) : (
        <p className="quiet" role={error ? "alert" : undefined}>
          {error || "Loading your progress..."}
        </p>
      )}
      <h3>Recent activity</h3>
      {c.pastTournaments[0] ? (
        <Link
          className="recent-card"
          href={`/session/${c.pastTournaments[0].code}`}
        >
          <CalendarBlank size={24} />
          <span>
            <small>Latest club session</small>
            <strong>{c.pastTournaments[0].name}</strong>
            <small>
              {new Date(
                c.pastTournaments[0].endedAt ?? c.pastTournaments[0].createdAt,
              ).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </small>
            {latest?.code === c.pastTournaments[0].code && (
              <span className="result">
                <b>{latest.wins}</b> / {latest.matches} wins
              </span>
            )}
          </span>
          <CaretRight size={19} />
        </Link>
      ) : (
        <p className="quiet">Your first session recap will appear here.</p>
      )}
      <div className="link-group">
        <PlayRow
          title="Club overview"
          sub={`${c.club?.membersCount ?? 0} players · ${c.club?.sessionsCount ?? 0} sessions`}
          icon={<UsersThree size={25} />}
          href={`/club/${c.clubId}?tab=insights`}
        />
        <PlayRow
          title="Top rivalries & partnerships"
          sub="Explore your club’s playing history"
          icon={<Trophy size={25} />}
          href={`/club/${c.clubId}?tab=insights&view=connections`}
        />
      </div>
    </>
  );
}
