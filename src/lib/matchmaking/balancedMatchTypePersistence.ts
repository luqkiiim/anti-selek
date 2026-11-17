import type { Prisma } from "@prisma/client";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import {
  getEffectiveSessionMode,
  getEffectiveSessionType,
} from "@/lib/sessionSettings";
import { buildSocialSessionHistory } from "./socialSessionHistory";
import {
  buildPlayerGroupCourtPlans,
  getPlayerGroupSelectionConstraints,
} from "./playerGroupPlanner";
import {
  buildBalancedMatchTypeContext,
  getBalancedMatchTypeBasis,
  getBalancedMatchTypePolicyKey,
  parseBalancedMatchTypeSnapshot,
} from "./v3/balancedMatchTypes";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3DoublesPartition,
  V3SelectionConstraints,
} from "./v3/types";

async function loadState(
  tx: Prisma.TransactionClient,
  sessionId: string,
  excludeQueue: boolean,
) {
  const [rows, matches, queued, session] = await Promise.all([
    tx.sessionPlayer.findMany({
      where: { sessionId },
      select: {
        playerId: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
        pool: true,
        isPaused: true,
        representingClubId: true,
      },
    }),
    tx.match.findMany({
      where: {
        sessionId,
        status: {
          in: ["COMPLETED", "PENDING", "IN_PROGRESS", "PENDING_APPROVAL"],
        },
      },
    }),
    excludeQueue
      ? Promise.resolve(null)
      : tx.queuedMatch.findUnique({ where: { sessionId } }),
    tx.session.findUnique({
      where: { id: sessionId },
      select: {
        type: true,
        mode: true,
        scoringType: true,
        matchmakingStyle: true,
        balanceMetric: true,
        pairingMode: true,
        respectPlayerRest: true,
        poolsEnabled: true,
        collabFormat: true,
        crossoverFrequency: true,
      },
    }),
  ]);
  const players = withLegacySportingAliases(rows).map((row) => ({
    ...row,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    strength: 0,
    availableSince: new Date(0),
  }));
  const history = buildSocialSessionHistory(
    withLegacySportingAliases({ matches, queuedMatch: queued }),
  );
  const policy = session
    ? getBalancedMatchTypePolicyKey({
        sessionType: getEffectiveSessionType(session),
        sessionMode: getEffectiveSessionMode(session),
        respectPlayerRest: session.respectPlayerRest,
        groups: session.poolsEnabled,
        clubs: session.collabFormat === "INTERCLUB",
        crossoverFrequency: session.crossoverFrequency,
      })
    : undefined;
  return { players, history, policy };
}

/** Check the source once at the start of a serialized writer, before writing any court in its batch. */
export async function isBalancedMatchTypeSourceCurrent(
  tx: Prisma.TransactionClient,
  sessionId: string,
  assignments: readonly {
    partition: V3DoublesPartition;
    matchmakingReasonJson?: string | null;
  }[],
  excludeQueue = false,
) {
  const snapshots = assignments.flatMap(
    (assignment) =>
      parseBalancedMatchTypeSnapshot(
        assignment.matchmakingReasonJson,
        assignment.partition,
      ) ?? [],
  );
  if (!snapshots.length) return true;
  const { players, history, policy } = await loadState(
    tx,
    sessionId,
    excludeQueue,
  );
  return snapshots.every((snapshot) => {
    if (!snapshot.basis) return false;
    const basis = getBalancedMatchTypeBasis(
      players,
      history,
      snapshot.group !== "session",
    );
    return (
      basis.roster === snapshot.basis.roster &&
      basis.commitments === snapshot.basis.commitments &&
      typeof snapshot.basis.policy === "string" &&
      policy === snapshot.basis.policy
    );
  });
}

/** Manual/fallback commitments contribute their own target without claiming automatic selection certification. */
export async function appendBalancedMatchTypeSnapshot(
  tx: Prisma.TransactionClient,
  sessionId: string,
  partition: V3DoublesPartition,
  reasonJson: string,
  settings: {
    poolsEnabled: boolean;
    collabFormat?: string | null;
    crossoverFrequency?: string | null;
  },
) {
  const { players, history, policy } = await loadState(tx, sessionId, false);
  const groups = settings.poolsEnabled && settings.collabFormat !== "INTERCLUB";
  const counts = {
    A: players.filter((player) => !player.isPaused && player.pool !== "B")
      .length,
    B: players.filter((player) => !player.isPaused && player.pool === "B")
      .length,
  };
  let constraints: V3SelectionConstraints<
    ActiveMatchmakerV3Player<MatchmakerV3Player>
  >[] = groups
    ? buildPlayerGroupCourtPlans({
        requestedCourtCount: 1,
        activePoolAPlayerCount: counts.A,
        activePoolBPlayerCount: counts.B,
        waitingPoolAPlayerCount: counts.A,
        waitingPoolBPlayerCount: counts.B,
        crossoverFrequency: settings.crossoverFrequency,
      }).flatMap((plan) =>
        plan.compositions.map((composition) =>
          getPlayerGroupSelectionConstraints(composition),
        ),
      )
    : [];
  if (settings.collabFormat === "INTERCLUB") {
    const clubById = new Map(
      players.map((player) => [player.userId, player.representingClubId]),
    );
    constraints = (constraints.length ? constraints : [{}]).map(
      (constraint) => ({
        ...constraint,
        normalizePartition(input) {
          const normalized = constraint.normalizePartition
            ? constraint.normalizePartition(input)
            : input.partition;
          if (!normalized) return null;
          const club1 = clubById.get(normalized.team1[0]),
            club2 = clubById.get(normalized.team2[0]);
          return club1 &&
            club2 &&
            club1 !== club2 &&
            club1 === clubById.get(normalized.team1[1]) &&
            club2 === clubById.get(normalized.team2[1])
            ? normalized
            : null;
        },
      }),
    );
  }
  const snapshot = buildBalancedMatchTypeContext(players, history, {
    groups,
    clubs: settings.collabFormat === "INTERCLUB",
    constraints,
    policy,
  }).snapshot(partition);
  if (!snapshot) return reasonJson;
  return JSON.stringify({
    ...JSON.parse(reasonJson),
    balancedMatchType: snapshot,
  });
}
