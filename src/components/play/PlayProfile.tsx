"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Trophy,
  CalendarBlank,
  GearSix,
  ChartLineUp,
} from "@phosphor-icons/react";
import { useSession } from "next-auth/react";
import { PlayAvatar, PlayRow } from "./PlayShell";
import { usePlayerStats } from "./usePlayerStats";
import { AdjustClubRating } from "@/components/profile/AdjustClubRating";
import { AddGuestToClub } from "@/components/profile/AddGuestToClub";
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
export function PlayProfile({
  userId,
  clubId,
}: {
  userId: string;
  clubId?: string;
}) {
  const { data, error, refresh } = usePlayerStats(userId, clubId);
  const { data: session } = useSession();
  const [tab, setTab] = useState("overview");
  const [limit, setLimit] = useState(12);
  if (!data)
    return (
      <div className="surface" role={error ? "alert" : "status"}>
        {error || "Loading player profile…"}
        {error && (
          <button className="secondary" onClick={refresh}>
            Try again
          </button>
        )}
      </div>
    );
  const { user, stats, recentForm, context } = data;
  const rank = context?.rankContext.currentRank;
  const profileLink = (id: string) =>
    `/profile/${id}${clubId ? `?clubId=${clubId}` : ""}`;
  return (
    <>
      <div className="profile-heading">
        <PlayAvatar name={user.name} url={user.avatarUrl} />
        <div>
          <span className="eyebrow">
            {clubId ? "PLAYER IN THIS CLUB" : "PLAYER PROFILE"}
          </span>
          <h1>{user.name}</h1>
        </div>
        {session?.user?.id === userId && (
          <Link
            className="icon-button"
            href="/settings"
            aria-label="Edit your account"
          >
            <GearSix size={23} />
          </Link>
        )}
      </div>
      <div className="stats-card">
        <div>
          <small>{clubId ? "Club rating" : "Rating"}</small>
          <strong className="big-number">{user.elo}</strong>
          <span className={recentForm.ratingChange < 0 ? "loss" : "gain"}>
            {signed(recentForm.ratingChange)}{" "}
            <em>last {recentForm.matches} games</em>
          </span>
        </div>
        <div>
          <small>{clubId ? "Club rank" : "Matches"}</small>
          <strong className="big-number">
            {clubId ? (rank ? `#${rank}` : "—") : stats.totalMatches}
          </strong>
          <small>
            {clubId
              ? rank
                ? `of ${context?.rankContext.leaderboardSize} players`
                : "Not ranked yet"
              : "played"}
          </small>
        </div>
      </div>
      <nav className="local-tabs" aria-label="Profile sections">
        {["overview", "matches", "stats", "achievements"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <>
          <h3>Your game, growing.</h3>
          <div className="stat-grid">
            <div>
              <strong>{stats.wins}</strong>
              <small>Wins</small>
            </div>
            <div>
              <strong>{Math.round(stats.winRate)}%</strong>
              <small>Win rate</small>
            </div>
            <div>
              <strong>{stats.sessionsPlayed}</strong>
              <small>Sessions</small>
            </div>
          </div>
          {recentForm.currentStreak.count > 1 &&
            recentForm.currentStreak.result === "WIN" && (
              <div className="celebration">
                <Trophy size={28} />
                <div>
                  <strong>
                    {recentForm.currentStreak.count} wins in a row
                  </strong>
                  <p>Keep your momentum going.</p>
                </div>
              </div>
            )}
          <h3>Recent sessions</h3>
          <div className="link-group">
            {data.recentSessions.length ? (
              data.recentSessions.map((s) => (
                <PlayRow
                  key={s.id}
                  icon={<CalendarBlank size={24} />}
                  title={s.name}
                  sub={`${s.wins}W · ${s.losses}L · ${signed(s.ratingChange)} rating`}
                  href={`/session/${s.code}`}
                />
              ))
            ) : (
              <p className="quiet">
                Your first session is the start of your story.
              </p>
            )}
          </div>
          {data.sessions.best && (
            <div className="surface">
              <span className="eyebrow">PERSONAL HIGHLIGHT</span>
              <h3>{data.sessions.best.name}</h3>
              <p>
                {data.sessions.best.wins} wins ·{" "}
                {signed(data.sessions.best.ratingChange)} rating
              </p>
              <Link
                className="text-button"
                href={`/session/${data.sessions.best.code}`}
              >
                View session
              </Link>
            </div>
          )}
        </>
      )}
      {tab === "matches" && (
        <>
          <h3>
            Match history{" "}
            <small className="quiet">{data.matchHistory.length}</small>
          </h3>
          {data.matchHistory.length ? (
            data.matchHistory.slice(0, limit).map((m) => (
              <Link
                className="match-result"
                key={m.id}
                href={`/session/${m.sessionCode}/history`}
              >
                <span
                  className={`result-mark ${m.result === "LOSS" ? "lost" : ""}`}
                >
                  {m.result === "WIN" ? "W" : "L"}
                </span>
                <div>
                  <strong>{m.score}</strong>
                  <small>With {m.partner.name}</small>
                  <small>vs {m.opponents.map((o) => o.name).join(" & ")}</small>
                  <small>{m.sessionName}</small>
                </div>
                <b className={(m.eloChange ?? 0) < 0 ? "loss" : "gain"}>
                  {m.eloChange === null ? "—" : signed(m.eloChange)}
                </b>
              </Link>
            ))
          ) : (
            <p className="quiet">No completed games yet.</p>
          )}
          {limit < data.matchHistory.length && (
            <button
              className="secondary"
              onClick={() => setLimit((n) => n + 12)}
            >
              Show more games
            </button>
          )}
        </>
      )}
      {tab === "stats" && (
        <>
          <h3>By the numbers</h3>
          <div className="stat-grid">
            {[
              ["Games", stats.totalMatches],
              ["Wins", stats.wins],
              ["Losses", stats.losses],
              ["Points won", stats.pointsScored],
              ["Points conceded", stats.pointsConceded],
              ["Point difference", signed(stats.pointDifferential)],
              ["Sessions", stats.sessionsPlayed],
              ["Games / session", stats.averageMatchesPerSession.toFixed(1)],
              ["Win rate", `${Math.round(stats.winRate)}%`],
            ].map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <small>{label}</small>
              </div>
            ))}
          </div>
          {data.recentSessions.length > 0 && (
            <section className="surface">
              <h3>Rating earned by session</h3>
              <div className="rating-bars">
                {data.recentSessions
                  .slice()
                  .reverse()
                  .map((s) => (
                    <Link
                      href={`/session/${s.code}`}
                      key={s.id}
                      aria-label={`${s.name}: ${signed(s.ratingChange)} rating`}
                    >
                      <strong className={s.ratingChange < 0 ? "loss" : "gain"}>
                        {signed(s.ratingChange)}
                      </strong>
                      <span
                        style={{
                          height: `${Math.max(4, (Math.abs(s.ratingChange) / Math.max(1, ...data.recentSessions.map((x) => Math.abs(x.ratingChange)))) * 70)}px`,
                          background:
                            s.ratingChange < 0 ? "#e0a2ae" : "#a77cdf",
                        }}
                      />
                      <small>
                        {s.date
                          ? new Date(s.date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          : s.name}
                      </small>
                    </Link>
                  ))}
              </div>
            </section>
          )}
          <div className="surface">
            <ChartLineUp size={26} />
            <h3>Recent form</h3>
            <p>
              {recentForm.wins} wins in your last {recentForm.matches} games
            </p>
            <strong className={recentForm.ratingChange < 0 ? "loss" : "gain"}>
              {signed(recentForm.ratingChange)} rating
            </strong>
          </div>
          {[
            { title: "Best partnerships", items: data.partners.best },
            { title: "Toughest opponents", items: data.opponents.toughest },
          ].map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {group.items.length ? (
                <div className="link-group">
                  {group.items.map((p) => (
                    <PlayRow
                      key={p.user.id}
                      icon={
                        <PlayAvatar name={p.user.name} url={p.user.avatarUrl} />
                      }
                      title={p.user.name}
                      sub={`${p.matches} games · ${p.wins}W / ${p.losses}L`}
                      href={profileLink(p.user.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="quiet">
                  Play more games to discover your connections.
                </p>
              )}
            </section>
          ))}
        </>
      )}
      {tab === "achievements" && (
        <>
          <div className="achievement-heading">
            <div>
              <h3>Little wins. Big moments.</h3>
              <p className="quiet">
                {data.achievements.filter((a) => a.unlocked).length} of{" "}
                {data.achievements.length} unlocked
              </p>
            </div>
            <Image src="/play/medallion.png" alt="" width={88} height={88} />
          </div>
          {data.achievements.map((a) => (
            <div
              className={`achievement-row ${a.unlocked ? "unlocked" : ""}`}
              key={a.id}
            >
              <Trophy size={29} weight={a.unlocked ? "fill" : "regular"} />
              <div>
                <strong>{a.title}</strong>
                <p>{a.description}</p>
                <progress
                  max={a.target}
                  value={Math.min(a.progress, a.target)}
                  aria-label={a.title}
                />
                <small>{a.progressLabel}</small>
                {a.earnedFromSession && (
                  <Link
                    className="text-button"
                    href={`/session/${a.earnedFromSession.code}`}
                  >
                    View session
                  </Link>
                )}
              </div>
            </div>
          ))}
        </>
      )}
      {(context?.viewerCanManageClub || context?.canAddGuestToClub) &&
        clubId && (
          <details className="surface">
            <summary>Player controls</summary>
            <div className="button-pair">
              {context.canAddGuestToClub ? (
                <AddGuestToClub
                  clubId={clubId}
                  userId={userId}
                  name={user.name}
                />
              ) : (
                context.viewerCanManageClub && (
                  <AdjustClubRating
                    clubId={clubId}
                    userId={userId}
                    name={user.name}
                    onChanged={refresh}
                  />
                )
              )}
            </div>
          </details>
        )}
    </>
  );
}
