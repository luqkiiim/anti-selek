"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Crown, Medal, RotateCw, Share2 } from "lucide-react";

import type { Player } from "@/components/session/sessionTypes";
import { Avatar } from "@/components/ui/Avatar";
import { SessionType } from "@/types/enums";
import { LiveSessionStandings } from "./LiveSessionStandings";
import type { LiveSessionStandingRow } from "./LiveSessionStandings";
import { formatProfileDate } from "./profileDate";
import styles from "./SessionFinishView.module.css";

interface PlayerStats {
  played: number;
  wins: number;
  losses: number;
}

export interface SessionFinishHighlight {
  id: string;
  label: string;
  name: string;
  value: string;
  avatarUrl?: string | null;
}

export interface SessionFinishViewProps {
  sessionName: string;
  sessionType: string;
  /** Pass the already-ranked roster from the session view model. */
  players: Player[];
  pointDiffByUserId: Map<string, number>;
  playerStatsByUserId: Map<string, PlayerStats>;
  /** Pass the authorized session share handler; the image API checks access again. */
  onShareResults?: () => void;
  sharingResults?: boolean;
  /** Optional content such as the interclub scoreboard. */
  children?: ReactNode;
  /** Animate once when the just-completed session first opens. */
  celebrate?: boolean;
  sessionDate?: string | null;
  highlights?: SessionFinishHighlight[];
  onOpenMember?: (id: string) => void;
  profileMemberIds?: readonly string[];
}

const EMPTY_PLAYER_STATS: PlayerStats = { played: 0, wins: 0, losses: 0 };
const CELEBRATION_DURATION_MS = 2200;

function formatPointDiff(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function getScore(sessionType: string, player: Player, stats: PlayerStats) {
  return sessionType === SessionType.LADDER
    ? `${stats.wins}-${stats.losses}`
    : `${player.sessionPoints}`;
}

function getStandingsScore(sessionType: string, player: Player, stats: PlayerStats) {
  if (sessionType !== SessionType.LADDER) return player.sessionPoints;

  const netWins = stats.wins - stats.losses;
  return netWins > 0 ? `+${netWins}` : netWins;
}

function getOrdinal(rank: number) {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  return "3rd";
}

function getRevealDelayMs(rank: number) {
  if (rank === 3) return 0;
  if (rank === 2) return 430;
  return 860;
}

function getEnamelStyle(rank: number): CSSProperties {
  if (rank === 1) return { "--medal-color": "#c89536", "--medal-light": "#fff0b7" } as CSSProperties;
  if (rank === 2) return { "--medal-color": "#8790a0", "--medal-light": "#f1f4fa" } as CSSProperties;
  return { "--medal-color": "#b97848", "--medal-light": "#ffe0c2" } as CSSProperties;
}

function buildStandingsRows({
  players,
  sessionType,
  pointDiffByUserId,
  playerStatsByUserId,
  profileMemberIds,
}: Pick<
  SessionFinishViewProps,
  "players" | "sessionType" | "pointDiffByUserId" | "playerStatsByUserId" | "profileMemberIds"
>): LiveSessionStandingRow[] {
  const allowedProfileIds = profileMemberIds ? new Set(profileMemberIds) : null;

  return players.map((player) => {
    const stats = playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
    const isProfileMember = !player.isGuest && (!allowedProfileIds || allowedProfileIds.has(player.userId));

    return {
      userId: player.userId,
      name: player.user.name,
      avatarUrl: player.user.avatarUrl,
      group: "A",
      score: getStandingsScore(sessionType, player, stats),
      matchesPlayed: stats.played,
      wins: stats.wins,
      losses: stats.losses,
      pointDiff: pointDiffByUserId.get(player.userId) ?? 0,
      canOpenMember: isProfileMember,
    };
  });
}

function ConfettiBits() {
  return (
    <span className={styles.confetti} aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

export function SessionFinishView({
  sessionName,
  sessionType,
  players,
  pointDiffByUserId,
  playerStatsByUserId,
  onShareResults,
  sharingResults = false,
  children,
  celebrate = false,
  sessionDate,
  highlights,
  onOpenMember,
  profileMemberIds,
}: SessionFinishViewProps) {
  const [celebrationRunId, setCelebrationRunId] = useState(0);
  const [isCelebrating, setIsCelebrating] = useState(celebrate);
  const previousCelebrate = useRef(celebrate);
  const hasRecordedGames = players.some(
    (player) => (playerStatsByUserId.get(player.userId)?.played ?? 0) > 0,
  );
  const topThree = hasRecordedGames ? players.slice(0, 3) : [];
  const isLadderSession = sessionType === SessionType.LADDER;
  const visibleHighlights = hasRecordedGames ? highlights?.slice(0, 2) ?? [] : [];
  const standingsRows = buildStandingsRows({
    players,
    sessionType,
    pointDiffByUserId,
    playerStatsByUserId,
    profileMemberIds,
  });

  useEffect(() => {
    if (celebrate && !previousCelebrate.current) {
      const timer = window.setTimeout(() => {
        setCelebrationRunId((current) => current + 1);
        setIsCelebrating(true);
      }, 0);
      previousCelebrate.current = celebrate;
      return () => window.clearTimeout(timer);
    }
    previousCelebrate.current = celebrate;
  }, [celebrate]);

  useEffect(() => {
    if (!isCelebrating) return;

    const timer = window.setTimeout(
      () => setIsCelebrating(false),
      CELEBRATION_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [celebrationRunId, isCelebrating]);

  const replayCelebration = () => {
    setCelebrationRunId((current) => current + 1);
    setIsCelebrating(true);
  };

  return (
    <section
      className={styles.finish}
      aria-labelledby="session-finish-title"
      data-celebrating={isCelebrating}
    >
      <header className={styles.header}>
        <h1 id="session-finish-title">That&apos;s a wrap!</h1>
        <p className={styles.sessionMeta}>
          <strong>{sessionName}</strong>
          {sessionDate ? (
            <time dateTime={sessionDate}>{formatProfileDate(sessionDate)}</time>
          ) : null}
        </p>
      </header>

      {topThree.length > 0 ? (
        <div
          key={celebrationRunId}
          className={`${styles.podium} ${styles[`podiumCount${topThree.length}`]} ${isCelebrating ? styles.celebrating : ""}`}
          role="group"
          aria-label="Top finishers"
        >
          {topThree.map((player, index) => {
            const rank = index + 1;
            const stats = playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
            const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;
            const canOpenProfile =
              !!onOpenMember &&
              !player.isGuest &&
              (!profileMemberIds || profileMemberIds.includes(player.userId));
            const MemberTag = canOpenProfile ? "button" : "div";
            const medalStyle = getEnamelStyle(rank);

            return (
              <article
                key={`${player.userId}-${celebrationRunId}`}
                className={`${styles.podiumPlace} ${styles[`place${rank}`] ?? ""}`}
                style={{
                  "--reveal-delay": `${getRevealDelayMs(rank)}ms`,
                  ...medalStyle,
                } as CSSProperties}
                aria-label={`${getOrdinal(rank)} place: ${player.user.name}`}
              >
                <MemberTag
                  className={`${styles.podiumContent} ${canOpenProfile ? styles.podiumContentLink : ""}`}
                  {...(canOpenProfile
                    ? {
                        type: "button" as const,
                        "aria-label": `View ${player.user.name}'s profile`,
                        onClick: () => onOpenMember?.(player.userId),
                      }
                    : {})}
                >
                  <span className={styles.avatarWrap}>
                    <Avatar
                      name={player.user.name}
                      avatarUrl={player.user.avatarUrl}
                      size="xl"
                      className={styles.podiumAvatar}
                      imageLoading="eager"
                      imageFetchPriority="high"
                    />
                    <span className={styles.enamelMedal} style={medalStyle} aria-hidden="true">
                      {rank === 1 ? (
                        <Crown size={19} strokeWidth={2.2} />
                      ) : (
                        <Medal size={19} strokeWidth={2.1} />
                      )}
                    </span>
                  </span>
                  <span className={styles.rankLabel}>{getOrdinal(rank)} place</span>
                  <strong className={styles.podiumName} title={player.user.name}>
                    {player.user.name}
                  </strong>
                  {player.isGuest ? <span className={styles.guestTag}>Guest</span> : null}
                  <span className={styles.podiumScore}>
                    {getScore(sessionType, player, stats)}
                    <span>{isLadderSession ? "W–L" : "pts"}</span>
                  </span>
                  <span className={styles.podiumDiff}>{formatPointDiff(pointDiff)} diff</span>
                </MemberTag>
              </article>
            );
          })}
          {isCelebrating ? <ConfettiBits /> : null}
        </div>
      ) : players.length > 0 ? (
        <p className={styles.noGames}>No completed games yet.</p>
      ) : null}

      {visibleHighlights.length > 0 ? (
        <section className={styles.highlights} aria-label="Session highlights">
          {visibleHighlights.map((highlight) => (
            <article className={styles.highlight} key={highlight.id}>
              <span className={styles.highlightLabel}>{highlight.label}</span>
              <div className={styles.highlightPerson}>
                <Avatar
                  name={highlight.name}
                  avatarUrl={highlight.avatarUrl}
                  size="sm"
                  className={styles.highlightAvatar}
                />
                <strong title={highlight.name}>{highlight.name}</strong>
                <span>{highlight.value}</span>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {children ? <div className={styles.slot}>{children}</div> : null}

      {players.length > 0 ? (
        <div className={styles.actions}>
          {onShareResults ? (
            <button
              type="button"
              className={styles.shareButton}
              onClick={onShareResults}
              disabled={sharingResults}
            >
              <Share2 size={17} strokeWidth={2.3} aria-hidden="true" />
              {sharingResults ? "Preparing recap…" : "Share recap"}
            </button>
          ) : null}
          {topThree.length > 0 ? (
            <button
              type="button"
              className={styles.replayButton}
              onClick={replayCelebration}
              aria-label="Replay winner celebration"
              title="Replay winner celebration"
            >
              <RotateCw size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {players.length > 0 ? (
        <LiveSessionStandings
          rows={standingsRows}
          groupsEnabled={false}
          scoreLabel={isLadderSession ? "net wins" : "points"}
          onOpenMember={onOpenMember}
        />
      ) : (
        <p className={styles.empty}>No final results have been recorded.</p>
      )}
    </section>
  );
}
