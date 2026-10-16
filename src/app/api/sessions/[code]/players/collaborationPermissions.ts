import type { Prisma, PrismaClient } from "@prisma/client";
import { assertCollaborationPermission, isUpgradedCollaboration } from "@/lib/sessionCollaboration";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { assertSessionMutationActor, getSessionParticipantOwners } from "@/lib/sessionProfileIdentity";

type Db = Prisma.TransactionClient | PrismaClient;
type Actor = Parameters<typeof assertSessionMutationActor>[1] & {
  availability?: boolean;
  clubId?: string | null;
};

/** Check fresh session, participant side and current role after reserving the writer. */
export async function assertScopedSessionMutation(db: Db, args: Actor) {
  const session = await db.session.findUnique({
    where: { id: args.session.id },
    select: { id: true, clubId: true, collaborationVersion: true, status: true },
  });
  if (!session) throw new IdentityConflictError("Tournament no longer exists.");
  if (!isUpgradedCollaboration(session)) {
    // Existing routes let owners change only their own availability.
    return assertSessionMutationActor(db, { session: args.session, userId: args.userId, isGlobalAdmin: args.isGlobalAdmin, adminOnly: args.adminOnly, allowContextlessParticipant: args.allowContextlessParticipant, playerId: args.availability ? args.playerId : undefined });
  }
  if (session.status === "COMPLETED") throw new IdentityConflictError("Tournament already ended.");
  if (args.hostOnly) {
    await assertCollaborationPermission(db, { sessionId: session.id, userId: args.userId, isGlobalAdmin: !!args.isGlobalAdmin, kind: "host" });
    if (!args.playerId) return;
  }
  if (args.availability && args.playerId) {
    const owners = await getSessionParticipantOwners(db, session, [args.playerId]);
    if (owners.get(args.playerId) === args.userId) return;
  }
  const seat = args.playerId ? await db.sessionPlayer.findUnique({
    where: { sessionId_playerId: { sessionId: session.id, playerId: args.playerId } },
    select: { representingClubId: true, profileClubId: true },
  }) : null;
  const clubId = seat ? seat.representingClubId ?? seat.profileClubId : args.clubId;
  if (!clubId) throw new IdentityConflictError("Choose which club roster to manage.");
  await assertCollaborationPermission(db, { sessionId: session.id, userId: args.userId, isGlobalAdmin: !!args.isGlobalAdmin, kind: "roster", clubId });
}

export async function assertPlayerNotInLineup(db: Db, sessionId: string, playerId: string) {
  const session = await db.session.findUnique({ where: { id: sessionId }, select: { collaborationVersion: true } });
  if (!session || !isUpgradedCollaboration(session)) return;
  const row = await db.sessionLineupRow.findFirst({ where: { sessionId, cancelled: false, OR: [
    { team1Player1Id: playerId }, { team1Player2Id: playerId },
    { team2Player1Id: playerId }, { team2Player2Id: playerId },
  ] }, select: { id: true } });
  if (row) throw new IdentityConflictError("Remove this player from the lineup first.");
}
