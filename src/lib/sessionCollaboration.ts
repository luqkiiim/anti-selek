import type { Prisma, PrismaClient } from "@prisma/client";
import { IdentityConflictError } from "./playerIdentity";
import { isClubAdminRole, isClubOperatorRole } from "./clubRoles";

type Db = Prisma.TransactionClient | PrismaClient;
export interface CollaborationActor {
  userId: string;
  isGlobalAdmin?: boolean;
}
export function isUpgradedCollaboration(source: {
  collaborationVersion?: number | null;
}) {
  return (source.collaborationVersion ?? 1) >= 2;
}
export async function collaborationContext(
  db: Db,
  sessionId: string,
  actor: CollaborationActor,
) {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      sessionClubs: { include: { club: { select: { name: true } } } },
    },
  });
  if (!session) throw new IdentityConflictError("Session not found.");
  const memberships = await db.clubAccess.findMany({
    where: {
      userId: actor.userId,
      status: "ACTIVE",
      clubId: { in: session.sessionClubs.map((c) => c.clubId) },
    },
    select: { clubId: true, role: true },
  });
  const accepted = session.sessionClubs
    .filter((c) => c.status === "ACCEPTED")
    .map((c) => c.clubId);
  const manageClubIds = accepted.filter(
    (id) =>
      actor.isGlobalAdmin ||
      memberships.some((m) => m.clubId === id && isClubOperatorRole(m.role)),
  );
  const adminClubIds = accepted.filter(
    (id) =>
      actor.isGlobalAdmin ||
      memberships.some((m) => m.clubId === id && isClubAdminRole(m.role)),
  );
  const reviewClubIds = session.sessionClubs
    .filter(
      (c) =>
        c.status === "PENDING" &&
        (actor.isGlobalAdmin ||
          memberships.some(
            (m) => m.clubId === c.clubId && isClubAdminRole(m.role),
          )),
    )
    .map((c) => c.clubId);
  return {
    session,
    memberships,
    capabilities: {
      host: !!session.clubId && manageClubIds.includes(session.clubId),
      manageClubIds,
      adminClubIds,
      reviewClubIds,
    },
  };
}
export async function assertCollaborationPermission(
  db: Db,
  args: CollaborationActor & {
    sessionId: string;
    kind: "host" | "roster" | "admin";
    clubId?: string | null;
  },
) {
  const context = await collaborationContext(db, args.sessionId, args);
  if (!isUpgradedCollaboration(context.session)) return context;
  const allowed =
    args.kind === "host"
      ? context.capabilities.host
      : !!args.clubId &&
        (args.kind === "admin"
          ? context.capabilities.adminClubIds
          : context.capabilities.manageClubIds
        ).includes(args.clubId);
  if (!allowed)
    throw new IdentityConflictError(
      args.kind === "host"
        ? "Only the host club can manage this session."
        : "You can manage only your own club's side.",
    );
  return context;
}
export function assertRulesAgreed(session: {
  rulesRevision: number;
  sessionClubs: Array<{
    status: string;
    rulesConfirmedRevision: number | null;
  }>;
}) {
  if (
    session.sessionClubs.length !== 2 ||
    session.sessionClubs.some(
      (c) =>
        c.status !== "ACCEPTED" ||
        c.rulesConfirmedRevision !== session.rulesRevision,
    )
  )
    throw new IdentityConflictError(
      "Both clubs must accept the invitation and confirm the current rules.",
    );
}
export function assertRevision(expected: unknown, current: number) {
  if (!Number.isInteger(expected) || expected !== current)
    throw new IdentityConflictError(
      "This has changed. Refresh and review the latest version before saving.",
    );
}
export async function collaborationEvent(
  db: Db,
  sessionId: string,
  actorUserId: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  await db.sessionCollaborationEvent.create({
    data: {
      sessionId,
      actorUserId,
      action,
      detailsJson: JSON.stringify(details),
    },
  });
}
export async function getCollaborationState(
  db: Db,
  sessionId: string,
  actor: CollaborationActor,
) {
  const { session, capabilities, memberships } = await collaborationContext(
    db,
    sessionId,
    actor,
  );
  if (!isUpgradedCollaboration(session))
    throw new IdentityConflictError("This session uses legacy collaboration.");
  const canRead =
    actor.isGlobalAdmin ||
    memberships.some((m) =>
      session.sessionClubs.some(
        (c) =>
          c.clubId === m.clubId &&
          (c.status === "ACCEPTED" || isClubOperatorRole(m.role)),
      ),
    );
  if (!canRead)
    throw new IdentityConflictError(
      "You do not have access to this collaboration.",
    );
  return {
    collaborationVersion: session.collaborationVersion,
    schedulingMode: session.schedulingMode,
    scoringFormat: session.scoringFormat,
    ratingMode: session.ratingMode,
    rulesRevision: session.rulesRevision,
    resultsRevision: session.resultsRevision,
    status: session.status,
    hostClubId: session.clubId,
    clubs: session.sessionClubs.map((c) => ({
      id: c.clubId,
      name: c.club.name,
      role: c.role,
      status: c.status,
      rulesConfirmedRevision: c.rulesConfirmedRevision,
      resetConfirmedRevision: c.resetConfirmedRevision,
    })),
    capabilities,
    lineup: await db.sessionLineupRow.findMany({
      where: { sessionId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
  };
}
export async function mutateCollaboration(
  db: Prisma.TransactionClient,
  sessionId: string,
  actor: CollaborationActor,
  body: Record<string, unknown>,
) {
  const { session, capabilities } = await collaborationContext(
    db,
    sessionId,
    actor,
  );
  if (!isUpgradedCollaboration(session))
    throw new IdentityConflictError("This session uses legacy collaboration.");
  const clubId = typeof body.clubId === "string" ? body.clubId : "";
  switch (body.action) {
    case "updateRules": {
      if (!capabilities.host)
        throw new IdentityConflictError(
          "Only the host club can change the rules.",
        );
      if (session.status !== "WAITING")
        throw new IdentityConflictError("Rules are locked once play starts.");
      assertRevision(body.revision, session.rulesRevision);
      if (
        !["SINGLE_GAME", "BEST_OF_THREE"].includes(
          String(body.scoringFormat),
        ) ||
        !["RATED", "UNRATED"].includes(String(body.ratingMode))
      )
        throw new IdentityConflictError(
          "Choose a match format and rating setting.",
        );
      if (
        session.collabFormat !== "INTERCLUB" &&
        (body.scoringFormat !== "SINGLE_GAME" || body.ratingMode !== "RATED")
      )
        throw new IdentityConflictError(
          "These rules are available for Club vs club sessions.",
        );
      await db.session.update({
        where: { id: sessionId },
        data: {
          scoringFormat: String(body.scoringFormat),
          ratingMode: String(body.ratingMode),
          rulesRevision: { increment: 1 },
        },
      });
      await db.sessionClub.updateMany({
        where: { sessionId },
        data: { rulesConfirmedRevision: null, resetConfirmedRevision: null },
      });
      await db.sessionLineupRow.updateMany({
        where: { sessionId, matchId: null },
        data: {
          revision: { increment: 1 },
          hostConfirmedRevision: null,
          partnerConfirmedRevision: null,
        },
      });
      break;
    }
    case "confirmRules": {
      if (session.status !== "WAITING")
        throw new IdentityConflictError("Rules are already locked.");
      if (!capabilities.adminClubIds.includes(clubId))
        throw new IdentityConflictError(
          "Only your club's admins can confirm its rules.",
        );
      assertRevision(body.revision, session.rulesRevision);
      await db.sessionClub.update({
        where: { sessionId_clubId: { sessionId, clubId } },
        data: { rulesConfirmedRevision: session.rulesRevision },
      });
      break;
    }
    case "confirmReset": {
      if (session.status !== "ACTIVE")
        throw new IdentityConflictError("Only active sessions can be reset.");
      if (!capabilities.adminClubIds.includes(clubId))
        throw new IdentityConflictError(
          "Only your club's admins can approve a reset.",
        );
      assertRevision(body.revision, session.resultsRevision);
      await db.sessionClub.update({
        where: { sessionId_clubId: { sessionId, clubId } },
        data: { resetConfirmedRevision: session.resultsRevision },
      });
      break;
    }
    case "cancelInvitation": {
      if (!capabilities.host || session.status !== "WAITING")
        throw new IdentityConflictError(
          "Only the host can cancel an invitation before play.",
        );
      const partner = session.sessionClubs.find(
        (c) => c.role === "PARTNER" && c.status === "PENDING",
      );
      if (!partner)
        throw new IdentityConflictError(
          "This invitation has already been reviewed.",
        );
      await db.sessionClub.update({
        where: { id: partner.id },
        data: {
          status: "CANCELLED",
          rulesConfirmedRevision: null,
          reviewedById: actor.userId,
          reviewedAt: new Date(),
        },
      });
      break;
    }
    case "withdraw": {
      if (
        session.status !== "WAITING" ||
        !capabilities.adminClubIds.includes(clubId) ||
        clubId === session.clubId
      )
        throw new IdentityConflictError(
          "Only the visiting club's admins can withdraw before play.",
        );
      await db.sessionClub.update({
        where: { sessionId_clubId: { sessionId, clubId } },
        data: { status: "WITHDRAWN", rulesConfirmedRevision: null },
      });
      await db.sessionLineupRow.updateMany({
        where: { sessionId },
        data: {
          revision: { increment: 1 },
          hostConfirmedRevision: null,
          partnerConfirmedRevision: null,
        },
      });
      break;
    }
    default:
      throw new IdentityConflictError("Unknown collaboration action.");
  }
  await collaborationEvent(db, sessionId, actor.userId, String(body.action), {
    clubId,
    revision: body.revision,
    scoringFormat: body.scoringFormat,
    ratingMode: body.ratingMode,
  });
}
