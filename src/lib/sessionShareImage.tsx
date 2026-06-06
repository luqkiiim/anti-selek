import type { CSSProperties, ReactElement } from "react";
import {
  getCompetitiveEntryAt,
  deriveLadderRecordsByEntryTime,
  deriveRaceRecordsByEntryTime,
} from "@/lib/matchmaking/ladder";
import {
  compareCompetitiveStandings,
  compareSessionStandings,
} from "@/lib/sessionStandings";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import {
  AVATAR_MAX_FILE_BYTES,
  isSupportedAvatarMimeType,
} from "@/lib/avatar";
import { MatchStatus, SessionType } from "@/types/enums";

export const SESSION_SHARE_IMAGE_WIDTH = 1080;
export const SESSION_SHARE_IMAGE_HEIGHT = 1920;
export const SESSION_SHARE_IMAGE_PLAYER_LIMIT = 13;

const SHARE_AVATAR_FETCH_TIMEOUT_MS = 4_000;

export interface SessionShareImagePlayer {
  userId: string;
  sessionPoints: number;
  joinedAt?: Date | string | null;
  ladderEntryAt?: Date | string | null;
  user: {
    name: string;
    avatarUrl?: string | null;
  };
  isGuest?: boolean;
}

export interface SessionShareImageMatch {
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1Score?: number | null;
  team2Score?: number | null;
  winnerTeam?: number | null;
  status?: string | null;
  completedAt?: Date | string | null;
}

export interface SessionShareImageInput {
  sessionName: string;
  communityName: string;
  sessionType: string;
  players: SessionShareImagePlayer[];
  matches: SessionShareImageMatch[];
}

export interface SessionShareImageStanding {
  rank: number;
  userId: string;
  name: string;
  initials: string;
  avatarUrl?: string | null;
  isGuest: boolean;
  score: number | string;
  scoreLabel: "Points" | "Record";
  wins: number;
  losses: number;
  pointDiff: number;
}

export interface SessionShareImageViewModel {
  sessionName: string;
  communityName: string;
  sessionType: string;
  sessionTypeLabel: string;
  standings: SessionShareImageStanding[];
}

interface PlayerPerformance {
  wins: number;
  losses: number;
  pointDiff: number;
}

function createEmptyPerformance(): PlayerPerformance {
  return {
    wins: 0,
    losses: 0,
    pointDiff: 0,
  };
}

export function getShareImageInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "P";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatPointDiff(pointDiff: number) {
  return pointDiff > 0 ? `+${pointDiff}` : `${pointDiff}`;
}

function formatScoreLabel(sessionType: string) {
  return sessionType === SessionType.LADDER ? "Record" : "Points";
}

function toHistoryDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildPlayerPerformanceMaps({
  sessionType,
  players,
  matches,
}: {
  sessionType: string;
  players: SessionShareImagePlayer[];
  matches: SessionShareImageMatch[];
}) {
  const performanceByUserId = new Map<string, PlayerPerformance>();

  for (const player of players) {
    performanceByUserId.set(player.userId, createEmptyPerformance());
  }

  if (sessionType === SessionType.LADDER || sessionType === SessionType.RACE) {
    const entryMap = new Map(
      players.map((player) => [player.userId, getCompetitiveEntryAt(player)])
    );
    const historyMatches = matches.map((match) => ({
      team1: [match.team1User1Id, match.team1User2Id] as [string, string],
      team2: [match.team2User1Id, match.team2User2Id] as [string, string],
      team1Score: match.team1Score ?? undefined,
      team2Score: match.team2Score ?? undefined,
      status: match.status ?? undefined,
      completedAt: toHistoryDate(match.completedAt),
    }));
    const records =
      sessionType === SessionType.RACE
        ? deriveRaceRecordsByEntryTime(entryMap, historyMatches)
        : deriveLadderRecordsByEntryTime(entryMap, historyMatches);

    for (const player of players) {
      const record = records.get(player.userId);
      if (!record) {
        continue;
      }

      performanceByUserId.set(player.userId, {
        wins: record.wins,
        losses: record.losses,
        pointDiff: record.pointDiff,
      });
    }

    return performanceByUserId;
  }

  for (const match of matches) {
    const team1Ids = [match.team1User1Id, match.team1User2Id];
    const team2Ids = [match.team2User1Id, match.team2User2Id];
    const winnerTeam = match.winnerTeam;
    const team1Score = match.team1Score;
    const team2Score = match.team2Score;

    for (const userId of team1Ids) {
      const current = performanceByUserId.get(userId) ?? createEmptyPerformance();
      performanceByUserId.set(userId, {
        ...current,
        wins: current.wins + (winnerTeam === 1 ? 1 : 0),
        losses: current.losses + (winnerTeam === 2 ? 1 : 0),
      });
    }

    for (const userId of team2Ids) {
      const current = performanceByUserId.get(userId) ?? createEmptyPerformance();
      performanceByUserId.set(userId, {
        ...current,
        wins: current.wins + (winnerTeam === 2 ? 1 : 0),
        losses: current.losses + (winnerTeam === 1 ? 1 : 0),
      });
    }

    if (
      match.status !== MatchStatus.COMPLETED ||
      typeof team1Score !== "number" ||
      typeof team2Score !== "number"
    ) {
      continue;
    }

    const team1Diff = team1Score - team2Score;
    const team2Diff = team2Score - team1Score;

    for (const userId of team1Ids) {
      const current = performanceByUserId.get(userId) ?? createEmptyPerformance();
      performanceByUserId.set(userId, {
        ...current,
        pointDiff: current.pointDiff + team1Diff,
      });
    }

    for (const userId of team2Ids) {
      const current = performanceByUserId.get(userId) ?? createEmptyPerformance();
      performanceByUserId.set(userId, {
        ...current,
        pointDiff: current.pointDiff + team2Diff,
      });
    }
  }

  return performanceByUserId;
}

function getStandingScore({
  sessionType,
  player,
  performance,
}: {
  sessionType: string;
  player: SessionShareImagePlayer;
  performance: PlayerPerformance;
}) {
  if (sessionType === SessionType.LADDER) {
    return `${performance.wins}-${performance.losses}`;
  }

  if (sessionType === SessionType.RACE) {
    return performance.wins * 3;
  }

  return player.sessionPoints;
}

export function buildSessionShareImageViewModel({
  sessionName,
  communityName,
  sessionType,
  players,
  matches,
}: SessionShareImageInput): SessionShareImageViewModel {
  const performanceByUserId = buildPlayerPerformanceMaps({
    sessionType,
    players,
    matches,
  });
  const sortedPlayers = players.slice().sort((left, right) => {
    const leftPerformance =
      performanceByUserId.get(left.userId) ?? createEmptyPerformance();
    const rightPerformance =
      performanceByUserId.get(right.userId) ?? createEmptyPerformance();

    if (sessionType === SessionType.LADDER || sessionType === SessionType.RACE) {
      const leftScore =
        sessionType === SessionType.RACE
          ? leftPerformance.wins * 3
          : leftPerformance.wins - leftPerformance.losses;
      const rightScore =
        sessionType === SessionType.RACE
          ? rightPerformance.wins * 3
          : rightPerformance.wins - rightPerformance.losses;

      return compareCompetitiveStandings(
        {
          name: left.user.name,
          score: leftScore,
          pointDiff: leftPerformance.pointDiff,
        },
        {
          name: right.user.name,
          score: rightScore,
          pointDiff: rightPerformance.pointDiff,
        }
      );
    }

    return compareSessionStandings(
      {
        name: left.user.name,
        pointDiff: leftPerformance.pointDiff,
        sessionPoints: left.sessionPoints,
      },
      {
        name: right.user.name,
        pointDiff: rightPerformance.pointDiff,
        sessionPoints: right.sessionPoints,
      }
    );
  });

  return {
    sessionName,
    communityName,
    sessionType,
    sessionTypeLabel: getSessionTypeLabel(sessionType),
    standings: sortedPlayers
      .slice(0, SESSION_SHARE_IMAGE_PLAYER_LIMIT)
      .map((player, index) => {
        const performance =
          performanceByUserId.get(player.userId) ?? createEmptyPerformance();

        return {
          rank: index + 1,
          userId: player.userId,
          name: player.user.name,
          initials: getShareImageInitials(player.user.name),
          avatarUrl: player.user.avatarUrl,
          isGuest: player.isGuest === true,
          score: getStandingScore({ sessionType, player, performance }),
          scoreLabel: formatScoreLabel(sessionType),
          wins: performance.wins,
          losses: performance.losses,
          pointDiff: performance.pointDiff,
        };
      }),
  };
}

async function readBlobAsDataUrl(blob: Blob, contentType: string) {
  const bytes = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return `data:${contentType};base64,${bytes}`;
}

export async function fetchShareImageAvatarDataUrls(
  standings: SessionShareImageStanding[],
  {
    fetchImpl = fetch,
    timeoutMs = SHARE_AVATAR_FETCH_TIMEOUT_MS,
  }: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {}
) {
  const avatarDataUrlsByUserId = new Map<string, string>();

  await Promise.all(
    standings.map(async (standing) => {
      if (!standing.avatarUrl) {
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(standing.avatarUrl, {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }

        const contentType = response.headers
          .get("content-type")
          ?.split(";")[0]
          .trim();
        if (!contentType || !isSupportedAvatarMimeType(contentType)) {
          return;
        }

        const contentLength = Number(response.headers.get("content-length"));
        if (
          Number.isFinite(contentLength) &&
          contentLength > AVATAR_MAX_FILE_BYTES
        ) {
          return;
        }

        const blob = await response.blob();
        if (blob.size > AVATAR_MAX_FILE_BYTES) {
          return;
        }

        avatarDataUrlsByUserId.set(
          standing.userId,
          await readBlobAsDataUrl(blob, contentType)
        );
      } catch {
        // Avatar rendering is best-effort; initials keep the share image useful.
      } finally {
        clearTimeout(timeoutId);
      }
    })
  );

  return avatarDataUrlsByUserId;
}

const styles: Record<string, CSSProperties> = {
  frame: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 58,
    background:
      "linear-gradient(180deg, #f8fbff 0%, #edf4ff 44%, #ffffff 100%)",
    color: "#020617",
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    padding: "42px 50px",
    border: "2px solid #e2e8f0",
    borderRadius: 54,
    background: "#ffffff",
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    maxWidth: 700,
  },
  eyebrow: {
    display: "flex",
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: 6,
    textTransform: "uppercase",
    color: "#0369a1",
  },
  title: {
    display: "flex",
    marginTop: 26,
    fontSize: 66,
    fontWeight: 900,
    lineHeight: 0.95,
    color: "#111827",
  },
  community: {
    display: "flex",
    marginTop: 24,
    fontSize: 38,
    fontWeight: 700,
    color: "#64748b",
  },
  typeBadge: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px 34px",
    border: "2px solid #bae6fd",
    borderRadius: 999,
    background: "#f0f9ff",
    fontSize: 26,
    fontWeight: 900,
    color: "#0369a1",
  },
  podiumRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 30,
    width: "100%",
    marginTop: 58,
  },
  podiumColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  podiumName: {
    display: "flex",
    justifyContent: "center",
    width: "100%",
    marginBottom: 20,
    fontSize: 44,
    fontWeight: 900,
    lineHeight: 1,
    textAlign: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  podiumAvatar: {
    width: 112,
    height: 112,
    borderRadius: 999,
    border: "5px solid #ffffff",
    background: "#ecfdf5",
    objectFit: "cover",
  },
  podiumAvatarFallback: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 112,
    height: 112,
    borderRadius: 999,
    border: "5px solid #ffffff",
    background: "#ecfdf5",
    color: "#0f766e",
    fontSize: 38,
    fontWeight: 900,
  },
  podiumBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    marginTop: 24,
    padding: "26px 22px 30px",
    borderWidth: 2,
    borderStyle: "solid",
    borderBottomWidth: 0,
    borderTopLeftRadius: 56,
    borderTopRightRadius: 56,
  },
  rankBubble: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 78,
    height: 78,
    borderRadius: 999,
    borderWidth: 3,
    borderStyle: "solid",
    fontSize: 35,
    fontWeight: 900,
  },
  podiumScore: {
    display: "flex",
    marginTop: 28,
    fontSize: 70,
    fontWeight: 900,
    lineHeight: 1,
  },
  podiumLabel: {
    display: "flex",
    marginTop: 12,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 5,
    textTransform: "uppercase",
    color: "#64748b",
  },
  podiumRecord: {
    display: "flex",
    marginTop: 22,
    fontSize: 25,
    fontWeight: 800,
    letterSpacing: 4,
    color: "#475569",
  },
  podiumDiff: {
    display: "flex",
    marginTop: 20,
    fontSize: 35,
    fontWeight: 900,
  },
  podiumBase: {
    width: "100%",
    height: 24,
    borderBottomLeftRadius: 42,
    borderBottomRightRadius: 42,
    background: "#e2e8f0",
  },
  standingsPanel: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    width: "100%",
    marginTop: 52,
    padding: 42,
    border: "2px solid #dbe4ef",
    borderRadius: 54,
    background: "#ffffff",
  },
  standingsColumns: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 24,
    width: "100%",
  },
  standingsColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    width: 420,
  },
  standingsColumnWide: {
    width: 864,
  },
  rowCard: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    width: 420,
    minHeight: 108,
    padding: "20px 24px",
    border: "2px solid #e2e8f0",
    borderRadius: 36,
    background: "#f8fafc",
  },
  rowCardWide: {
    width: 864,
  },
  rowRank: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: 999,
    border: "3px solid #dbe4ef",
    background: "#ffffff",
    color: "#64748b",
    fontSize: 28,
    fontWeight: 900,
  },
  rowAvatar: {
    width: 72,
    height: 72,
    marginLeft: 22,
    borderRadius: 999,
    border: "3px solid #c7f0e7",
    background: "#ecfdf5",
    objectFit: "cover",
  },
  rowAvatarFallback: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 72,
    height: 72,
    marginLeft: 22,
    borderRadius: 999,
    border: "3px solid #c7f0e7",
    background: "#ecfdf5",
    color: "#0f766e",
    fontSize: 25,
    fontWeight: 900,
  },
  rowIdentity: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flex: 1,
    marginLeft: 18,
  },
  rowName: {
    display: "flex",
    fontSize: 29,
    fontWeight: 900,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowRecord: {
    display: "flex",
    marginTop: 6,
    fontSize: 20,
    fontWeight: 800,
    color: "#64748b",
  },
  rowScore: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    marginLeft: 16,
  },
  rowScoreValue: {
    display: "flex",
    fontSize: 39,
    fontWeight: 900,
    lineHeight: 1,
  },
  rowDiff: {
    display: "flex",
    marginTop: 8,
    fontSize: 25,
    fontWeight: 900,
  },
};

function getPodiumStyle(rank: number) {
  switch (rank) {
    case 1:
      return {
        height: 362,
        borderColor: "#fde68a",
        background:
          "linear-gradient(180deg, rgba(254, 243, 199, 0.98), rgba(252, 211, 77, 0.55))",
        rankBorderColor: "#fcd34d",
        rankBackground: "#fef3c7",
        rankColor: "#b45309",
      };
    case 2:
      return {
        height: 336,
        borderColor: "#cbd5e1",
        background:
          "linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(203, 213, 225, 0.72))",
        rankBorderColor: "#cbd5e1",
        rankBackground: "#f1f5f9",
        rankColor: "#475569",
      };
    default:
      return {
        height: 318,
        borderColor: "#fdba74",
        background:
          "linear-gradient(180deg, rgba(255, 237, 213, 0.98), rgba(251, 146, 60, 0.42))",
        rankBorderColor: "#fb923c",
        rankBackground: "#ffedd5",
        rankColor: "#c2410c",
      };
  }
}

function AvatarImage({
  standing,
  avatarDataUrlsByUserId,
  variant,
}: {
  standing: SessionShareImageStanding;
  avatarDataUrlsByUserId: Map<string, string>;
  variant: "podium" | "row";
}) {
  const avatarDataUrl = avatarDataUrlsByUserId.get(standing.userId);
  const imageStyle =
    variant === "podium" ? styles.podiumAvatar : styles.rowAvatar;
  const fallbackStyle =
    variant === "podium"
      ? styles.podiumAvatarFallback
      : styles.rowAvatarFallback;

  if (avatarDataUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        alt={`${standing.name} avatar`}
        src={avatarDataUrl}
        width={variant === "podium" ? 112 : 72}
        height={variant === "podium" ? 112 : 72}
        style={imageStyle}
      />
    );
  }

  return <div style={fallbackStyle}>{standing.initials}</div>;
}

function PodiumCard({
  standing,
  avatarDataUrlsByUserId,
}: {
  standing: SessionShareImageStanding;
  avatarDataUrlsByUserId: Map<string, string>;
}) {
  const rankStyle = getPodiumStyle(standing.rank);

  return (
    <div style={styles.podiumColumn}>
      <div style={styles.podiumName}>{standing.name}</div>
      <AvatarImage
        standing={standing}
        avatarDataUrlsByUserId={avatarDataUrlsByUserId}
        variant="podium"
      />
      <div
        style={{
          ...styles.podiumBlock,
          height: rankStyle.height,
          borderColor: rankStyle.borderColor,
          background: rankStyle.background,
        }}
      >
        <div
          style={{
            ...styles.rankBubble,
            borderColor: rankStyle.rankBorderColor,
            background: rankStyle.rankBackground,
            color: rankStyle.rankColor,
          }}
        >
          {standing.rank}
        </div>
        <div style={styles.podiumScore}>{standing.score}</div>
        <div style={styles.podiumLabel}>{standing.scoreLabel}</div>
        <div style={styles.podiumRecord}>
          {`${standing.wins}W / ${standing.losses}L`}
        </div>
        <div
          style={{
            ...styles.podiumDiff,
            color: standing.pointDiff >= 0 ? "#047857" : "#e11d48",
          }}
        >
          {`${formatPointDiff(standing.pointDiff)} diff`}
        </div>
      </div>
      <div style={styles.podiumBase} />
    </div>
  );
}

function StandingRow({
  standing,
  avatarDataUrlsByUserId,
  wide = false,
}: {
  standing: SessionShareImageStanding;
  avatarDataUrlsByUserId: Map<string, string>;
  wide?: boolean;
}) {
  return (
    <div style={wide ? { ...styles.rowCard, ...styles.rowCardWide } : styles.rowCard}>
      <div style={styles.rowRank}>{standing.rank}</div>
      <AvatarImage
        standing={standing}
        avatarDataUrlsByUserId={avatarDataUrlsByUserId}
        variant="row"
      />
      <div style={styles.rowIdentity}>
        <div style={styles.rowName}>{standing.name}</div>
        <div style={styles.rowRecord}>
          {`${standing.wins}W / ${standing.losses}L${
            standing.isGuest ? " - Guest" : ""
          }`}
        </div>
      </div>
      <div style={styles.rowScore}>
        <div style={styles.rowScoreValue}>{standing.score}</div>
        <div
          style={{
            ...styles.rowDiff,
            color: standing.pointDiff >= 0 ? "#047857" : "#e11d48",
          }}
        >
          {formatPointDiff(standing.pointDiff)}
        </div>
      </div>
    </div>
  );
}

export function renderSessionShareImage(
  viewModel: SessionShareImageViewModel,
  avatarDataUrlsByUserId = new Map<string, string>()
): ReactElement {
  const topThree = viewModel.standings.slice(0, 3);
  const orderedPodium =
    topThree.length === 3
      ? [topThree[1], topThree[0], topThree[2]]
      : topThree.length === 2
        ? [topThree[1], topThree[0]]
        : topThree;
  const rowStandings = viewModel.standings.slice(3, 13);
  const useWideLowerRows = rowStandings.length <= 5;
  const standingsColumns = useWideLowerRows
    ? [rowStandings]
    : [
        rowStandings.slice(0, 5),
        rowStandings.slice(5, 10),
      ].filter((column) => column.length > 0);

  return (
    <div style={styles.frame}>
      <div style={styles.header}>
        <div style={styles.headerText}>
          <div style={styles.eyebrow}>Final standings</div>
          <div style={styles.title}>{viewModel.sessionName}</div>
          <div style={styles.community}>{viewModel.communityName}</div>
        </div>
        <div style={styles.typeBadge}>{viewModel.sessionTypeLabel}</div>
      </div>

      <div style={styles.podiumRow}>
        {orderedPodium.map((standing) => (
          <PodiumCard
            key={standing.userId}
            standing={standing}
            avatarDataUrlsByUserId={avatarDataUrlsByUserId}
          />
        ))}
      </div>

      <div style={styles.standingsPanel}>
        <div style={styles.standingsColumns}>
          {standingsColumns.map((column, columnIndex) => (
            <div
              key={columnIndex}
              style={
                useWideLowerRows
                  ? { ...styles.standingsColumn, ...styles.standingsColumnWide }
                  : styles.standingsColumn
              }
            >
              {column.map((standing) => (
                <StandingRow
                  key={standing.userId}
                  standing={standing}
                  avatarDataUrlsByUserId={avatarDataUrlsByUserId}
                  wide={useWideLowerRows}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
