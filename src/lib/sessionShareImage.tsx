import type { CSSProperties, ReactElement } from "react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getCompetitiveEntryAt,
  deriveLadderRecordsByEntryTime,
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
export const SESSION_SHARE_IMAGE_PLAYER_LIMIT = 14;

const SHARE_AVATAR_FETCH_TIMEOUT_MS = 4_000;
const SHARE_PODIUM_AVATAR_SIZE = 230;
const SHARE_ROW_AVATAR_SIZE = 78;

export async function getSessionShareImageFonts() {
  const directory = join(process.cwd(), "node_modules", "@fontsource", "nunito-sans", "files");
  const [regular, extraBold] = await Promise.all([
    readFile(join(directory, "nunito-sans-latin-400-normal.woff")),
    readFile(join(directory, "nunito-sans-latin-800-normal.woff")),
  ]);
  return [
    { name: "Nunito Sans", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Nunito Sans", data: extraBold, weight: 800 as const, style: "normal" as const },
  ];
}

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
  clubName: string;
  sessionType: string;
  sessionDate?: Date | string | null;
  participantCount?: number;
  completedMatchCount?: number;
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
  matchesPlayed: number;
}

export interface SessionShareImageViewModel {
  sessionName: string;
  clubName: string;
  sessionType: string;
  sessionTypeLabel: string;
  sessionDate: string | null;
  participantCount: number;
  completedMatchCount: number;
  omittedPlayerCount: number;
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

function truncateLabel(value: string, maxLength: number) {
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
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

  if (sessionType === SessionType.LADDER) {
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
    const records = deriveLadderRecordsByEntryTime(entryMap, historyMatches);

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

  return player.sessionPoints;
}

export function buildSessionShareImageViewModel({
  sessionName,
  clubName,
  sessionType,
  sessionDate,
  participantCount,
  completedMatchCount,
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

    if (sessionType === SessionType.LADDER) {
      const leftScore = leftPerformance.wins - leftPerformance.losses;
      const rightScore = rightPerformance.wins - rightPerformance.losses;

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
    clubName,
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
          matchesPlayed: performance.wins + performance.losses,
        };
      }),
    sessionDate: toHistoryDate(sessionDate)?.toISOString() ?? null,
    participantCount: participantCount ?? players.length,
    completedMatchCount:
      completedMatchCount ??
      matches.filter((match) => match.status === MatchStatus.COMPLETED).length,
    omittedPlayerCount: Math.max(0, sortedPlayers.length - SESSION_SHARE_IMAGE_PLAYER_LIMIT),
  };
}

async function readBlobAsShareImageDataUrl(blob: Blob, contentType: string) {
  const bytes = Buffer.from(await blob.arrayBuffer());

  if (contentType === "image/webp") {
    const { default: sharp } = await import("sharp");
    const pngBytes = await sharp(bytes)
      .rotate()
      .resize(SHARE_PODIUM_AVATAR_SIZE, SHARE_PODIUM_AVATAR_SIZE, {
        fit: "cover",
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${pngBytes.toString("base64")}`;
  }

  return `data:${contentType};base64,${bytes.toString("base64")}`;
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
          await readBlobAsShareImageDataUrl(blob, contentType)
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
    display: "flex", flexDirection: "column", width: "100%", height: "100%",
    background: "#fffdf9", color: "#351859", overflow: "hidden", fontFamily: "Nunito Sans",
  },
  hero: {
    display: "flex", flexDirection: "column", alignItems: "center",
    position: "relative", width: "100%", height: 700, padding: "34px 44px 0",
    background: "linear-gradient(180deg, #3b175b 0%, #4a1b70 100%)",
    color: "#fffaff", borderBottomLeftRadius: 52, borderBottomRightRadius: 52,
  },
  header: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
  title: {
    display: "flex", maxWidth: "100%", justifyContent: "center", textAlign: "center",
    fontSize: 40, fontWeight: 800, lineHeight: 1.04, whiteSpace: "nowrap",
    overflow: "hidden", textOverflow: "ellipsis",
  },
  sessionTitle: { display: "flex", marginTop: 3, maxWidth: "100%", justifyContent: "center", fontSize: 40, fontWeight: 700, lineHeight: 1.05, color: "#e4d5f5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  club: {
    display: "flex", marginTop: 6, maxWidth: "100%", justifyContent: "center",
    fontSize: 65, fontWeight: 800, lineHeight: 1.02, color: "#fffaff",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  meta: {
    display: "flex", flexDirection: "row", justifyContent: "center", gap: 15,
    marginTop: 8, fontSize: 25, fontWeight: 400, color: "#e9ddf2",
  },
  metaDot: { color: "#c8a5e6" },
  podiumRow: {
    display: "flex", flexDirection: "row", alignItems: "flex-end", gap: 12,
    width: "100%", flex: 1, marginTop: 20,
  },
  podiumColumn: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
    flex: 1, minWidth: 0, height: "100%",
  },
  podiumAvatar: {
    width: SHARE_PODIUM_AVATAR_SIZE, height: SHARE_PODIUM_AVATAR_SIZE,
    borderRadius: 999, border: "7px solid #e8cf67", background: "#e7dfec", objectFit: "cover",
  },
  podiumAvatarFallback: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: SHARE_PODIUM_AVATAR_SIZE, height: SHARE_PODIUM_AVATAR_SIZE,
    borderRadius: 999, border: "7px solid #e8cf67", background: "#eee8f1",
    color: "#4a1b70", fontSize: 56, fontWeight: 900,
  },
  podiumBlock: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
    width: "100%", marginTop: 14, padding: "10px 8px 6px",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  podiumRank: { display: "flex", fontSize: 44, fontWeight: 900, lineHeight: 1 },
  podiumName: {
    display: "flex", justifyContent: "center", width: "100%", marginTop: 4,
    fontSize: 36, fontWeight: 800, lineHeight: 1.05, textAlign: "center",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  podiumScore: { display: "flex", marginTop: 5, fontSize: 36, fontWeight: 800, lineHeight: 1 },
  podiumScoreLabel: { display: "flex", marginLeft: 6, fontSize: 25, fontWeight: 800 },
  podiumScoreLine: { display: "flex", flexDirection: "row", alignItems: "baseline", marginTop: 5 },
  podiumDetails: { display: "flex", marginTop: 6, fontSize: 24, fontWeight: 800, lineHeight: 1.1 },
  standingsPanel: {
    display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
    width: "100%", padding: "22px 46px 0", background: "#fffdf9",
  },
  tableHeader: {
    display: "flex", flexDirection: "row", alignItems: "center", height: 64,
    borderBottom: "2px solid #e6e1e8", color: "#70568f", fontSize: 22, fontWeight: 800,
  },
  tableRow: {
    display: "flex", flexDirection: "row", alignItems: "center", height: 94,
    borderBottom: "2px solid #e9e4eb", color: "#3c1a62",
  },
  rankCell: { display: "flex", justifyContent: "center", width: 56, fontSize: 25, fontWeight: 700 },
  avatarCell: { display: "flex", justifyContent: "center", width: 92 },
  rowAvatar: {
    width: SHARE_ROW_AVATAR_SIZE, height: SHARE_ROW_AVATAR_SIZE, borderRadius: 999,
    border: "2px solid #d8cce2", background: "#eee8f1", objectFit: "cover",
  },
  rowAvatarFallback: {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: SHARE_ROW_AVATAR_SIZE, height: SHARE_ROW_AVATAR_SIZE, borderRadius: 999,
    border: "2px solid #d8cce2", background: "#eee8f1", color: "#4a1b70",
    fontSize: 22, fontWeight: 800,
  },
  nameCell: {
    display: "flex", flex: 1, minWidth: 0, paddingLeft: 14, fontSize: 34,
    fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  numberCell: { display: "flex", justifyContent: "center", width: 98, fontSize: 30, fontWeight: 400 },
  pointsCell: { display: "flex", justifyContent: "center", width: 104, fontSize: 34, fontWeight: 800 },
  footer: {
    display: "flex", justifyContent: "center", alignItems: "center", height: 70, marginTop: "auto",
    color: "#9a82ad", fontSize: 23, fontWeight: 700, letterSpacing: 0.5,
  },
  empty: { display: "flex", flex: 1, justifyContent: "center", alignItems: "center", color: "#856c98", fontSize: 26 },
  overflow: { display: "flex", justifyContent: "center", paddingTop: 8, color: "#856c98", fontSize: 19, fontWeight: 700 },
};

const confettiBits: CSSProperties[] = [
  { left: 54, top: 208, background: "#b658e8", transform: "rotate(24deg)" },
  { left: 111, top: 424, background: "#a44fd4", transform: "rotate(-26deg)" },
  { right: 62, top: 246, background: "#c26deb", transform: "rotate(-18deg)" },
  { right: 102, top: 465, background: "#a84dd7", transform: "rotate(25deg)" },
  { left: 258, top: 266, background: "#c26deb", transform: "rotate(42deg)" },
].map((position) => ({
  position: "absolute",
  width: 14,
  height: 20,
  borderRadius: 2,
  ...position,
}));

function getPodiumStyle(rank: number) {
  switch (rank) {
    case 1:
      return {
        height: 270, border: "#e5c94f", background: "#4e2074", color: "#f4da65",
      };
    case 2:
      return {
        height: 250, border: "#c4c8d1", background: "#48206a", color: "#d9dbe4",
      };
    default:
      return {
        height: 230, border: "#c78e59", background: "#432063", color: "#e0ad78",
      };
  }
}

function AvatarImage({
  standing,
  avatarDataUrlsByUserId,
  variant,
  rank,
}: {
  standing: SessionShareImageStanding;
  avatarDataUrlsByUserId: Map<string, string>;
  variant: "podium" | "row";
  rank?: number;
}) {
  const avatarDataUrl = avatarDataUrlsByUserId.get(standing.userId);
  const imageStyle =
    variant === "podium" ? styles.podiumAvatar : styles.rowAvatar;
  const fallbackStyle =
    variant === "podium"
      ? styles.podiumAvatarFallback
      : styles.rowAvatarFallback;
  const medalBorder = rank === 1 ? "7px solid #e8cf67" : rank === 2 ? "7px solid #cbd0dc" : "7px solid #c78e59";

  if (avatarDataUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        alt={`${standing.name} avatar`}
        src={avatarDataUrl}
        width={
          variant === "podium"
            ? SHARE_PODIUM_AVATAR_SIZE
            : SHARE_ROW_AVATAR_SIZE
        }
        height={
          variant === "podium"
            ? SHARE_PODIUM_AVATAR_SIZE
            : SHARE_ROW_AVATAR_SIZE
        }
        style={variant === "podium" ? { ...imageStyle, border: medalBorder } : imageStyle}
      />
    );
  }

  return <div style={variant === "podium" ? { ...fallbackStyle, border: medalBorder } : fallbackStyle}>{standing.initials}</div>;
}

function PodiumCard({
  standing,
  avatarDataUrlsByUserId,
  centered = false,
}: {
  standing: SessionShareImageStanding;
  avatarDataUrlsByUserId: Map<string, string>;
  centered?: boolean;
}) {
  const rankStyle = getPodiumStyle(standing.rank);

  return (
    <div style={centered ? { ...styles.podiumColumn, flex: "0 0 52%" } : styles.podiumColumn}>
      <AvatarImage
        standing={standing}
        avatarDataUrlsByUserId={avatarDataUrlsByUserId}
        variant="podium"
        rank={standing.rank}
      />
      <div
        style={{
          ...styles.podiumBlock,
          height: rankStyle.height,
          borderTop: `4px solid ${rankStyle.border}`,
          background: rankStyle.background,
          color: rankStyle.color,
        }}
      >
        <div style={{ ...styles.podiumRank, color: rankStyle.color }}>{standing.rank}</div>
        <div style={{ ...styles.podiumName, color: "#fffaff" }}>{truncateLabel(standing.name, 15)}</div>
        <div style={styles.podiumScoreLine}><div style={{ ...styles.podiumScore, color: "#fffaff" }}>{standing.score}</div><div style={styles.podiumScoreLabel}>{standing.scoreLabel === "Points" ? "pts" : "W–L"}</div></div>
        <div
          style={{
            ...styles.podiumDetails,
            color: "#efe5f5",
          }}
        >
          {`${standing.wins}W  •  ${standing.losses}L`}
        </div>
        <div style={{ ...styles.podiumDetails, color: "#ddc8ee" }}>
          {`${formatPointDiff(standing.pointDiff)} Diff`}
        </div>
      </div>
    </div>
  );
}

function StandingRow({
  standing,
  avatarDataUrlsByUserId,
}: {
  standing: SessionShareImageStanding;
  avatarDataUrlsByUserId: Map<string, string>;
}) {
  return (
    <div style={styles.tableRow}>
      <div style={styles.rankCell}>{standing.rank}</div>
      <div style={styles.avatarCell}><AvatarImage standing={standing} avatarDataUrlsByUserId={avatarDataUrlsByUserId} variant="row" /></div>
      <div style={styles.nameCell}>{truncateLabel(standing.name, 19)}{standing.isGuest ? " · Guest" : ""}</div>
      <div style={styles.pointsCell}>{standing.score}</div>
      <div style={styles.numberCell}>{formatPointDiff(standing.pointDiff)}</div>
      <div style={styles.numberCell}>{standing.matchesPlayed}</div>
      <div style={styles.numberCell}>{`${standing.wins}/${standing.losses}`}</div>
    </div>
  );
}

function getFormattedSessionDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
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
  const rowStandings = viewModel.standings.slice(3, SESSION_SHARE_IMAGE_PLAYER_LIMIT);

  return (
    <div style={styles.frame}>
      <div style={styles.hero}>
        {confettiBits.map((style, index) => <div key={index} style={style} />)}
        <div style={styles.header}>
          <div style={styles.club}>{truncateLabel(viewModel.clubName, 21)}</div>
          <div style={styles.sessionTitle}>{truncateLabel(viewModel.sessionName, 32)}</div>
          <div style={styles.meta}>
            <span>{getFormattedSessionDate(viewModel.sessionDate)}</span><span style={styles.metaDot}>•</span>
            <span>{viewModel.participantCount} players</span><span style={styles.metaDot}>•</span>
            <span>{`${viewModel.completedMatchCount} ${viewModel.completedMatchCount === 1 ? "match" : "matches"}`}</span>
          </div>
        </div>
        <div style={styles.podiumRow}>
          {orderedPodium.map((standing) => (
            <PodiumCard key={standing.userId} standing={standing} avatarDataUrlsByUserId={avatarDataUrlsByUserId} centered={topThree.length === 1} />
          ))}
        </div>
      </div>
      <div style={styles.standingsPanel}>
        {rowStandings.length > 0 && <div style={styles.tableHeader}>
          <div style={styles.rankCell} /><div style={styles.avatarCell} />
          <div style={styles.nameCell}>Player</div><div style={styles.pointsCell}>{viewModel.sessionType === SessionType.LADDER ? "Record" : "Pts"}</div>
          <div style={styles.numberCell}>Diff</div><div style={styles.numberCell}>MP</div><div style={styles.numberCell}>W/L</div>
        </div>}
        {rowStandings.map((standing) => <StandingRow key={standing.userId} standing={standing} avatarDataUrlsByUserId={avatarDataUrlsByUserId} />)}
        {viewModel.omittedPlayerCount > 0 && <div style={styles.overflow}>{`${viewModel.omittedPlayerCount} more ${viewModel.omittedPlayerCount === 1 ? "player" : "players"} not shown`}</div>}
        {viewModel.standings.length === 0 && <div style={styles.empty}>No standings available</div>}
        <div style={styles.footer}>antiselek.com</div>
      </div>
    </div>
  );
}
