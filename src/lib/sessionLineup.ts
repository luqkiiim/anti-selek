import type { Prisma, SessionLineupRow } from "@prisma/client";
import { IdentityConflictError } from "./playerIdentity";
import { assertSessionProfileContextsUnambiguous } from "./sessionProfileIdentity";
import { getEffectiveMixedSide } from "./mixedSide";
import {
  assertCollaborationPermission,
  assertRevision,
  assertRulesAgreed,
  collaborationContext,
  collaborationEvent,
  isUpgradedCollaboration,
  type CollaborationActor,
} from "./sessionCollaboration";

type Db = Prisma.TransactionClient;
const slots = (row: SessionLineupRow) => [
  row.team1Player1Id,
  row.team1Player2Id,
  row.team2Player1Id,
  row.team2Player2Id,
];
export function isLineupRowReady(
  row: Pick<
    SessionLineupRow,
    | "revision"
    | "hostConfirmedRevision"
    | "partnerConfirmedRevision"
    | "cancelled"
    | "matchId"
    | "team1Player1Id"
    | "team1Player2Id"
    | "team2Player1Id"
    | "team2Player2Id"
  >,
) {
  return (
    !row.cancelled &&
    !row.matchId &&
    row.hostConfirmedRevision === row.revision &&
    row.partnerConfirmedRevision === row.revision &&
    [
      row.team1Player1Id,
      row.team1Player2Id,
      row.team2Player1Id,
      row.team2Player2Id,
    ].every(Boolean)
  );
}
async function lineupContext(
  db: Db,
  sessionId: string,
  actor: CollaborationActor,
) {
  const context = await collaborationContext(db, sessionId, actor);
  if (
    !isUpgradedCollaboration(context.session) ||
    context.session.schedulingMode !== "LINEUP" ||
    context.session.collabFormat !== "INTERCLUB"
  )
    throw new IdentityConflictError("This session does not use a lineup.");
  if (!["WAITING", "ACTIVE"].includes(context.session.status))
    throw new IdentityConflictError("This session has ended.");
  return context;
}
export async function validateLineupPlayers(
  db: Db,
  sessionId: string,
  row: SessionLineupRow,
  requireAvailable = false,
) {
  const session = await db.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { sessionClubs: true },
  });
  const partner = session.sessionClubs.find(
    (c) => c.role === "PARTNER" && c.status === "ACCEPTED",
  );
  const ids = slots(row);
  if (
    ids.some((id) => !id) ||
    new Set(ids).size !== 4 ||
    !partner ||
    !session.clubId
  )
    throw new IdentityConflictError(
      "Choose four different players from the two accepted clubs.",
    );
  const players = await db.sessionPlayer.findMany({
    where: { sessionId, playerId: { in: ids as string[] } },
    include: { player: { select: { isActive: true } } },
  });
  for (let i = 0; i < ids.length; i++) {
    const p = players.find((p) => p.playerId === ids[i]);
    if (
      !p ||
      p.representingClubId !== (i < 2 ? session.clubId : partner.clubId) ||
      !p.player.isActive ||
      (requireAvailable && p.isPaused)
    )
      throw new IdentityConflictError(
        "A selected player is unavailable or no longer represents this club. Review the lineup.",
      );
  }
  if (session.pairingMode === "MIXED") {
    for (const pair of [ids.slice(0, 2), ids.slice(2, 4)]) {
      const sides = pair.map((id) =>
        getEffectiveMixedSide(players.find((p) => p.playerId === id)!),
      );
      if (sides.some((side) => !side) || sides[0] === sides[1])
        throw new IdentityConflictError(
          "Each mixed pair needs one player from each mixed side.",
        );
    }
  }
  if (requireAvailable) {
    const busy = await db.match.count({
      where: {
        sessionId,
        status: { in: ["PENDING", "IN_PROGRESS", "PENDING_APPROVAL"] },
        OR: [
          { team1Player1Id: { in: ids as string[] } },
          { team1Player2Id: { in: ids as string[] } },
          { team2Player1Id: { in: ids as string[] } },
          { team2Player2Id: { in: ids as string[] } },
        ],
      },
    });
    if (busy)
      throw new IdentityConflictError(
        "One of these players is already playing on another court.",
      );
  }
  return { session, partner, ids: ids as [string, string, string, string] };
}
export async function createLineupRow(
  db: Db,
  sessionId: string,
  actor: CollaborationActor,
) {
  const { capabilities } = await lineupContext(db, sessionId, actor);
  if (!capabilities.host)
    throw new IdentityConflictError("Only the host can add lineup matches.");
  const last = await db.sessionLineupRow.aggregate({
    where: { sessionId },
    _max: { position: true },
  });
  const row = await db.sessionLineupRow.create({
    data: { sessionId, position: (last._max.position ?? 0) + 1 },
  });
  await collaborationEvent(db, sessionId, actor.userId, "LINEUP_ADD", {
    rowId: row.id,
  });
  return row;
}
export async function editLineupRow(
  db: Db,
  sessionId: string,
  rowId: string,
  actor: CollaborationActor,
  body: Record<string, unknown>,
) {
  const { session, capabilities } = await lineupContext(db, sessionId, actor);
  const row = await db.sessionLineupRow.findFirst({
    where: { id: rowId, sessionId },
  });
  if (!row || row.cancelled)
    throw new IdentityConflictError("Lineup match not found.");
  assertRevision(body.revision, row.revision);
  if (row.matchId)
    throw new IdentityConflictError(
      "Undo the started match before changing this lineup entry.",
    );
  let data: Prisma.SessionLineupRowUncheckedUpdateInput;
  const clubId = typeof body.clubId === "string" ? body.clubId : "";
  if (body.action === "pair") {
    if (!capabilities.manageClubIds.includes(clubId))
      throw new IdentityConflictError("You can edit only your club's pair.");
    if (
      !Array.isArray(body.playerIds) ||
      body.playerIds.length !== 2 ||
      body.playerIds.some(
        (id) => id !== null && (typeof id !== "string" || !id),
      )
    )
      throw new IdentityConflictError("Choose two player slots.");
    const ids = body.playerIds as [string | null, string | null];
    if (ids[0] && ids[0] === ids[1])
      throw new IdentityConflictError("Choose two different players.");
    const selected = await db.sessionPlayer.findMany({
      where: {
        sessionId,
        playerId: { in: ids.filter((id): id is string => !!id) },
      },
    });
    if (
      ids.filter(Boolean).length !== selected.length ||
      selected.some((p) => p.representingClubId !== clubId)
    )
      throw new IdentityConflictError(
        "Choose players representing your club in this session.",
      );
    data = {
      ...(clubId === session.clubId
        ? { team1Player1Id: ids[0], team1Player2Id: ids[1] }
        : { team2Player1Id: ids[0], team2Player2Id: ids[1] }),
      revision: { increment: 1 },
      hostConfirmedRevision: null,
      partnerConfirmedRevision: null,
    };
  } else if (body.action === "confirm") {
    if (!capabilities.manageClubIds.includes(clubId))
      throw new IdentityConflictError("You can confirm only your club's pair.");
    await validateLineupPlayers(db, sessionId, row);
    data =
      clubId === session.clubId
        ? { hostConfirmedRevision: row.revision }
        : { partnerConfirmedRevision: row.revision };
  } else if (body.action === "cancel") {
    if (!capabilities.host)
      throw new IdentityConflictError(
        "Only the host can cancel a lineup match.",
      );
    data = {
      cancelled: true,
      revision: { increment: 1 },
      hostConfirmedRevision: null,
      partnerConfirmedRevision: null,
    };
  } else if (body.action === "schedule") {
    if (!capabilities.host)
      throw new IdentityConflictError(
        "Only the host can schedule lineup matches.",
      );
    if (
      body.position !== undefined &&
      (!Number.isInteger(body.position) || Number(body.position) < 1)
    )
      throw new IdentityConflictError("Choose a valid match position.");
    if (
      body.courtPreferenceId !== undefined &&
      body.courtPreferenceId !== null &&
      (typeof body.courtPreferenceId !== "string" ||
        !(await db.court.findFirst({
          where: { id: body.courtPreferenceId, sessionId, isActive: true },
        })))
    )
      throw new IdentityConflictError("Choose a court in this session.");
    if (typeof body.position === "number" && body.position !== row.position) {
      const direction = body.position < row.position ? 1 : -1;
      const shiftedRows = await db.sessionLineupRow.findMany({
        where: {
          sessionId,
          id: { not: rowId },
          position:
            direction === 1
              ? { gte: body.position, lt: row.position }
              : { gt: row.position, lte: body.position },
        },
      });
      for (const shifted of shiftedRows) {
        await db.sessionLineupRow.update({
          where: { id: shifted.id },
          data: {
            position: { increment: direction },
            revision: { increment: 1 },
            hostConfirmedRevision:
              shifted.hostConfirmedRevision === shifted.revision
                ? shifted.revision + 1
                : null,
            partnerConfirmedRevision:
              shifted.partnerConfirmedRevision === shifted.revision
                ? shifted.revision + 1
                : null,
          },
        });
      }
    }
    // Order/court changes do not alter the agreed pairs; carry confirmations forward.
    data = {
      revision: { increment: 1 },
      hostConfirmedRevision:
        row.hostConfirmedRevision === row.revision ? row.revision + 1 : null,
      partnerConfirmedRevision:
        row.partnerConfirmedRevision === row.revision ? row.revision + 1 : null,
      ...(typeof body.position === "number" ? { position: body.position } : {}),
      ...(body.courtPreferenceId !== undefined
        ? { courtPreferenceId: body.courtPreferenceId as string | null }
        : {}),
    };
  } else throw new IdentityConflictError("Unknown lineup action.");
  const updated = await db.sessionLineupRow.update({
    where: { id: rowId },
    data,
  });
  await collaborationEvent(
    db,
    sessionId,
    actor.userId,
    `LINEUP_${String(body.action).toUpperCase()}`,
    {
      rowId,
      revision: row.revision,
      clubId,
      playerIds: body.playerIds,
      position: body.position,
      courtPreferenceId: body.courtPreferenceId,
    },
  );
  return updated;
}
export async function startLineupRow(
  db: Db,
  sessionId: string,
  rowId: string,
  actor: CollaborationActor,
  body: Record<string, unknown>,
) {
  const { session } = await assertCollaborationPermission(db, {
    ...actor,
    sessionId,
    kind: "host",
  });
  await lineupContext(db, sessionId, actor);
  if (session.status !== "ACTIVE")
    throw new IdentityConflictError(
      "Start the session before assigning a match.",
    );
  const row = await db.sessionLineupRow.findFirst({
    where: { id: rowId, sessionId },
  });
  if (!row) throw new IdentityConflictError("Lineup match not found.");
  if (row.matchId)
    return db.match.findUniqueOrThrow({ where: { id: row.matchId } });
  assertRevision(body.revision, row.revision);
  assertRulesAgreed(session);
  if (!isLineupRowReady(row))
    throw new IdentityConflictError(
      "Both clubs must confirm this lineup match.",
    );
  const courtId =
    typeof body.courtId === "string" ? body.courtId : row.courtPreferenceId;
  const court = courtId
    ? await db.court.findFirst({ where: { id: courtId, sessionId, isActive: true } })
    : null;
  if (!court || court.currentMatchId)
    throw new IdentityConflictError("Choose an available court.");
  const { partner, ids } = await validateLineupPlayers(
    db,
    sessionId,
    row,
    true,
  );
  await assertSessionProfileContextsUnambiguous(db, session);
  const match = await db.match.create({
    data: {
      sessionId,
      courtId: court.id,
      status: "IN_PROGRESS",
      scoringFormat: session.scoringFormat,
      team1Player1Id: ids[0],
      team1Player2Id: ids[1],
      team2Player1Id: ids[2],
      team2Player2Id: ids[3],
      team1ClubId: session.clubId,
      team2ClubId: partner.clubId,
    },
  });
  const assigned = await db.court.updateMany({
    where: { id: court.id, sessionId, isActive: true, currentMatchId: null },
    data: { currentMatchId: match.id },
  });
  if (assigned.count !== 1)
    throw new IdentityConflictError(
      "This court was just assigned. Refresh and try again.",
    );
  await db.sessionLineupRow.update({
    where: { id: row.id },
    data: { matchId: match.id, revision: { increment: 1 } },
  });
  await db.sessionPlayer.updateMany({
    where: { sessionId, playerId: { in: ids } },
    data: {
      hasStartedMatch: true,
      arrivalPriorityAt: null,
      skipNextMatchAt: null,
      skipNextMatchRequestedById: null,
    },
  });
  await db.session.update({
    where: { id: sessionId },
    data: { resultsRevision: { increment: 1 } },
  });
  await collaborationEvent(db, sessionId, actor.userId, "LINEUP_START", {
    rowId,
    matchId: match.id,
    courtId: court.id,
  });
  return match;
}
