"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Crown, RotateCw, Share2 } from "lucide-react";

import type { Player, SessionData } from "@/components/session/sessionTypes";
import { Avatar } from "@/components/ui/Avatar";
import { SessionCrossoverFrequency, SessionType } from "@/types/enums";
import {
  getBalanceMetricLabel,
  getMatchmakingStyleLabel,
  getPairingModeLabel,
  getSessionSettings,
} from "@/lib/sessionSettings";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
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
  sessionSettings: Pick<
    SessionData,
    | "type"
    | "mode"
    | "matchmakingStyle"
    | "balanceMetric"
    | "pairingMode"
    | "scoringType"
    | "poolsEnabled"
    | "poolAName"
    | "poolBName"
    | "crossoverFrequency"
    | "courts"
    | "autoQueueEnabled"
  >;
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
      {Array.from({ length: 20 }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

export function SessionFinishView({
  sessionName,
  sessionType,
  sessionSettings,
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
  const champion = topThree[0];
  const runnerUps = topThree.slice(1);
  const isLadderSession = sessionType === SessionType.LADDER;
  const visibleHighlights = hasRecordedGames ? highlights?.slice(0, 2) ?? [] : [];
  const standingsRows = buildStandingsRows({
    players,
    sessionType,
    pointDiffByUserId,
    playerStatsByUserId,
    profileMemberIds,
  });
  const resolvedSettings = getSessionSettings(sessionSettings);
  const sortedCourts = [...sessionSettings.courts].sort(
    (left, right) => left.courtNumber - right.courtNumber,
  );
  const crossoverFrequency = {
    [SessionCrossoverFrequency.OCCASIONAL]: "Occasionally",
    [SessionCrossoverFrequency.BALANCED]: "Sometimes",
    [SessionCrossoverFrequency.FREQUENT]: "Often",
  }[sessionSettings.crossoverFrequency];

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
        <p className={styles.sessionMeta}>
          <strong>{sessionName}</strong>
          {sessionDate ? (
            <time dateTime={sessionDate}>{formatProfileDate(sessionDate)}</time>
          ) : null}
        </p>
        <h1 id="session-finish-title">Session complete</h1>
      </header>

      {champion ? (
        <div
          key={celebrationRunId}
          className={`${styles.celebration} ${isCelebrating ? styles.celebrating : ""}`}
          role="group"
          aria-label="Top finishers"
        >
          {(() => {
            const stats = playerStatsByUserId.get(champion.userId) ?? EMPTY_PLAYER_STATS;
            const pointDiff = pointDiffByUserId.get(champion.userId) ?? 0;
            const canOpenProfile =
              !!onOpenMember &&
              !champion.isGuest &&
              (!profileMemberIds || profileMemberIds.includes(champion.userId));
            const MemberTag = canOpenProfile ? "button" : "div";

            return (
              <article className={styles.championCard} aria-label={`Session champion: ${champion.user.name}`}>
                {isCelebrating ? <ConfettiBits /> : null}
                <MemberTag
                  className={`${styles.championContent} ${canOpenProfile ? styles.memberLink : ""}`}
                  {...(canOpenProfile
                    ? {
                        type: "button" as const,
                        "aria-label": `View ${champion.user.name}'s profile`,
                        onClick: () => onOpenMember?.(champion.userId),
                      }
                    : {})}
                >
                  <span className={styles.championPortrait}>
                    <Avatar
                      name={champion.user.name}
                      avatarUrl={champion.user.avatarUrl}
                      size="xl"
                      className={styles.championAvatar}
                      imageLoading="eager"
                      imageFetchPriority="high"
                    />
                    <span className={styles.crownBadge} aria-hidden="true">
                      <Crown size={23} strokeWidth={2.2} />
                    </span>
                  </span>
                  <span className={styles.championLabel}>Session champion</span>
                  <strong className={styles.championName} title={champion.user.name}>
                    {champion.user.name}
                  </strong>
                  {champion.isGuest ? <span className={styles.guestTag}>Guest</span> : null}
                  <span className={styles.championResult}>
                    {getScore(sessionType, champion, stats)}
                    <span>{isLadderSession ? "W–L" : "pts"}</span>
                  </span>
                  <span className={styles.championDiff}>{formatPointDiff(pointDiff)} point diff</span>
                </MemberTag>
              </article>
            );
          })()}

          {runnerUps.length > 0 ? (
            <div className={styles.runnerUpGrid}>
              {runnerUps.map((player, index) => {
                const stats = playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
                const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;
                const canOpenProfile =
                  !!onOpenMember &&
                  !player.isGuest &&
                  (!profileMemberIds || profileMemberIds.includes(player.userId));
                const MemberTag = canOpenProfile ? "button" : "div";

                return (
                  <article
                    key={`${player.userId}-${celebrationRunId}`}
                    className={`${styles.runnerUpCard} ${index === 0 ? styles.silverCard : styles.bronzeCard}`}
                    aria-label={`${index === 0 ? "2nd" : "3rd"} place: ${player.user.name}`}
                  >
                    <MemberTag
                      className={`${styles.runnerUpContent} ${canOpenProfile ? styles.memberLink : ""}`}
                      {...(canOpenProfile
                        ? {
                            type: "button" as const,
                            "aria-label": `View ${player.user.name}'s profile`,
                            onClick: () => onOpenMember?.(player.userId),
                          }
                        : {})}
                    >
                      <Avatar
                        name={player.user.name}
                        avatarUrl={player.user.avatarUrl}
                        size="lg"
                        className={styles.runnerUpAvatar}
                      />
                      <span className={styles.runnerUpCopy}>
                        <span className={styles.runnerUpLabel}>{index === 0 ? "2nd place" : "3rd place"}</span>
                        <strong className={styles.runnerUpName} title={player.user.name}>
                          {player.user.name}
                        </strong>
                        {player.isGuest ? <span className={styles.guestTag}>Guest</span> : null}
                        <span className={styles.runnerUpScore}>
                          {getScore(sessionType, player, stats)}
                          <span>{isLadderSession ? "W–L" : "pts"}</span>
                        </span>
                        <span className={styles.runnerUpDiff}>{formatPointDiff(pointDiff)} diff</span>
                      </span>
                    </MemberTag>
                  </article>
                );
              })}
            </div>
          ) : null}
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
        <div className={styles.standings}>
          <div className={styles.standingsContent}>
        <LiveSessionStandings
          rows={standingsRows}
          groupsEnabled={false}
          scoreLabel={isLadderSession ? "net wins" : "points"}
          onOpenMember={onOpenMember}
        />
          </div>
        </div>
      ) : (
        <p className={styles.empty}>No final results have been recorded.</p>
      )}

      <section className={styles.settings} aria-label="Session settings used">
        <h2>Settings used</h2>
        <dl>
          <div>
            <dt>Matchmaking</dt>
            <dd>{getMatchmakingStyleLabel(resolvedSettings.matchmakingStyle)} · {getBalanceMetricLabel(resolvedSettings.balanceMetric)}</dd>
          </div>
          <div>
            <dt>Pairing</dt>
            <dd>{getPairingModeLabel(resolvedSettings.pairingMode)}</dd>
          </div>
          <div>
            <dt>Courts</dt>
            <dd>{sortedCourts.length > 0 ? sortedCourts.map(getCourtDisplayLabel).join(", ") : "None"}</dd>
          </div>
          <div>
            <dt>Player groups</dt>
            <dd>{sessionSettings.poolsEnabled
              ? `${sessionSettings.poolAName || "Group A"} / ${sessionSettings.poolBName || "Group B"} · ${crossoverFrequency} mix`
              : "Off"}</dd>
          </div>
          <div>
            <dt>Prepare next game</dt>
            <dd>{sessionSettings.autoQueueEnabled ? "On" : "Off"}</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
