import { describe, expect, it, vi } from "vitest";
import {
  SessionMatchmakingStyle,
  SessionPool,
  SessionStatus,
} from "@/types/enums";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction: vi.fn().mockResolvedValue({
    appliedCount: 0,
    appliedUserIds: [],
    automaticQueueInvalidated: false,
  }),
}));
vi.mock("@/lib/sessionLifecycle", () => ({
  reverseSessionEloChanges: vi.fn(),
}));
vi.mock("@/lib/sessionCollab", () => ({
  getSessionOperatorMembership: vi.fn(),
}));
vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: vi.fn(),
  withClubElo: vi.fn((players) => players),
}));
vi.mock("@/lib/sessionCollaboration", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/sessionCollaboration")>(),
  assertCollaborationPermission: vi.fn().mockResolvedValue({ session: {
    id: "session-1", status: "ACTIVE", resultsRevision: 5,
    sessionClubs: [
      { status: "ACCEPTED", resetConfirmedRevision: 5 },
      { status: "ACCEPTED", resetConfirmedRevision: 5 },
    ],
  } }),
  collaborationEvent: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionOperatorMembership } from "@/lib/sessionCollab";
import { POST } from "./route";

describe("reset session route", () => {
  it.each([1, 2])("clears gameplay state, advances the revision once, and preserves settings and groups for session version %s", async (collaborationVersion) => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "staff-account-1", isAdmin: false },
    } as never);
    vi.mocked(getSessionOperatorMembership).mockResolvedValue({ role: "STAFF" } as never);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1",
      clubId: "club-1",
      isTest: true,
      collaborationVersion,
      status: SessionStatus.ACTIVE,
    } as never);

    const sessionPlayerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const sessionUpdate = vi.fn().mockResolvedValue({
      id: "session-1",
      clubId: null,
      status: SessionStatus.WAITING,
      resultsRevision: 6,
      matchmakingStyle: SessionMatchmakingStyle.SOCIAL,
      poolsEnabled: true,
      courts: [],
      players: [
        {
          playerId: "player-1",
          pool: SessionPool.B,
          player: {
            id: "player-1",
            name: "Player One",
            avatarKey: null,
            elo: 1000,
          },
        },
      ],
      matches: [],
      queuedMatch: null,
    });
    const tx = {
      queuedMatch: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      court: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      match: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      sessionPlayer: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: sessionPlayerUpdateMany,
      },
      session: { update: sessionUpdate },
      sessionLineupRow: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      sessionClub: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never)
    );

    const response = await POST(
      new Request("http://localhost/api/sessions/session-1/reset", {
        method: "POST",
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: SessionStatus.WAITING,
      resultsRevision: 6,
      matchmakingStyle: SessionMatchmakingStyle.SOCIAL,
      poolsEnabled: true,
      players: [{ userId: "player-1", pool: SessionPool.B }],
      matches: [],
      queuedMatch: null,
    });
    expect(sessionUpdate.mock.calls[0][0].data).not.toHaveProperty(
      "matchmakingStyle"
    );
    expect(sessionUpdate.mock.calls[0][0].data).not.toHaveProperty(
      "poolsEnabled"
    );
    expect(sessionPlayerUpdateMany.mock.calls[0][0].data).not.toHaveProperty(
      "pool"
    );
    // The final update returns the reset snapshot with its new revision.
    expect(sessionUpdate.mock.calls.at(-1)![0].data.resultsRevision).toEqual({ increment: 1 });
    expect(sessionUpdate.mock.calls.reduce((total, [args]) => total + (args.data.resultsRevision?.increment ?? 0), 0)).toBe(1);
    expect(getSessionOperatorMembership).toHaveBeenCalledWith(prisma, {
      session: expect.objectContaining({ id: "session-1", clubId: "club-1" }),
      userId: "staff-account-1",
      acceptedOnly: true,
    });
  });
});

vi.mock("@/lib/clubAdmissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clubAdmissions")>();
  return { ...actual, admissionTransaction: async (db: { $transaction?: (op: unknown) => unknown }, op: (tx: unknown) => unknown) => db.$transaction ? db.$transaction(op) : op(db) };
});

vi.mock("@/lib/sessionProfileIdentity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sessionProfileIdentity")>();
  return { ...actual, assertSessionMutationActor: vi.fn(async () => {}), assertSessionProfileContextsUnambiguous: vi.fn(async () => {}), withSessionProfileRatings: async (_db: unknown, _session: unknown, players: unknown) => players };
});
