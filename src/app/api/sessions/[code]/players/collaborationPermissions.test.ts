import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const mocks = vi.hoisted(() => ({ owners: vi.fn(), legacy: vi.fn() }));
vi.mock("@/lib/sessionProfileIdentity", async (original) => ({
  ...await original<typeof import("@/lib/sessionProfileIdentity")>(),
  getSessionParticipantOwners: mocks.owners,
  assertSessionMutationActor: mocks.legacy,
}));
vi.mock("@/lib/clubAdmissions", async (original) => ({
  ...await original<typeof import("@/lib/clubAdmissions")>(),
  admissionTransaction: async (db: { $transaction: (op: unknown) => unknown }, op: unknown) => db.$transaction(op),
}));
import { assertPlayerNotInLineup, assertScopedSessionMutation } from "./collaborationPermissions";
import { sessionMatchMutationTransaction } from "@/lib/sessionProfileIdentity";
import { assertFreePlayScheduling } from "../generate-match/shared";

function fixture({ actorClub = "host", seatClub = "host", version = 2, mode = "FREE_PLAY", accepted = true } = {}) {
  const source = { id: "s", clubId: "host", status: "ACTIVE", collaborationVersion: version, schedulingMode: mode, sessionClubs: [
    { clubId: "host", status: "ACCEPTED", club: { name: "Host" } },
    { clubId: "partner", status: accepted ? "ACCEPTED" : "WITHDRAWN", club: { name: "Partner" } },
  ] };
  const tx = {
    session: { findUnique: vi.fn().mockResolvedValue(source) },
    sessionPlayer: {
      findUnique: vi.fn().mockResolvedValue({ representingClubId: seatClub, profileClubId: seatClub }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sessionClub: { findMany: vi.fn().mockResolvedValue(source.sessionClubs.filter(c => c.status === "ACCEPTED")) },
    sessionLineupRow: { findFirst: vi.fn().mockResolvedValue(null) },
    clubAccess: { findMany: vi.fn().mockResolvedValue([{ clubId: actorClub, role: "ADMIN" }]) },
  };
  const db = { ...tx, $transaction: async (op: (client: typeof tx) => unknown) => op(tx) } as unknown as PrismaClient;
  const actor = { session: { id: "s", clubId: "host" }, userId: "actor", playerId: "p" };
  return { tx, db, actor, source };
}

beforeEach(() => { vi.clearAllMocks(); mocks.owners.mockResolvedValue(new Map()); });

describe("upgraded roster scope", () => {
  it.each([["host", "partner"], ["partner", "host"]])("rejects %s operators editing %s players", async (actorClub, seatClub) => {
    const { db, actor } = fixture({ actorClub, seatClub });
    await expect(assertScopedSessionMutation(db, actor)).rejects.toThrow("only your own club");
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("allows an operator to manage their current side", async () => {
    const { db, actor } = fixture({ actorClub: "partner", seatClub: "partner" });
    await expect(assertScopedSessionMutation(db, actor)).resolves.toBeUndefined();
  });
  it("uses fresh target side rather than stale request scope", async () => {
    const { db, actor, tx } = fixture();
    tx.sessionPlayer.findUnique.mockResolvedValue({ representingClubId: "partner", profileClubId: "host" });
    await expect(assertScopedSessionMutation(db, { ...actor, clubId: "host" })).rejects.toThrow("only your own club");
  });
  it("allows current owners only their own availability", async () => {
    const { db, actor } = fixture({ actorClub: "unrelated", seatClub: "partner" });
    mocks.owners.mockResolvedValue(new Map([["p", "actor"]]));
    await expect(assertScopedSessionMutation(db, { ...actor, availability: true })).resolves.toBeUndefined();
    await expect(assertScopedSessionMutation(db, actor)).rejects.toThrow("only your own club");
  });
  it("requires both host court authority and own-roster authority to remove a player from court", async () => {
    const { db, actor } = fixture({ actorClub: "host", seatClub: "partner" });
    await expect(assertScopedSessionMutation(db, { ...actor, hostOnly: true })).rejects.toThrow("only your own club");
  });
  it("requires current accepted access when an operator loses the role", async () => {
    const { db, actor, tx } = fixture();
    tx.clubAccess.findMany.mockResolvedValue([]);
    await expect(assertScopedSessionMutation(db, actor)).rejects.toThrow("only your own club");
  });
  it("rejects a withdrawn visiting club", async () => {
    const { db, actor } = fixture({ actorClub: "partner", seatClub: "partner", accepted: false });
    await expect(assertScopedSessionMutation(db, actor)).rejects.toThrow("only your own club");
  });
  it("requires an explicit own club for newly added guests", async () => {
    const { db, actor } = fixture({ actorClub: "partner" });
    await expect(assertScopedSessionMutation(db, { ...actor, playerId: undefined, clubId: "host" })).rejects.toThrow("only your own club");
    await expect(assertScopedSessionMutation(db, { ...actor, playerId: undefined })).rejects.toThrow("Choose which club");
    await expect(assertScopedSessionMutation(db, { ...actor, playerId: undefined, clubId: "partner" })).resolves.toBeUndefined();
  });
  it("preserves legacy roster authorization", async () => {
    const { db, actor } = fixture({ version: 1, actorClub: "partner", seatClub: "host" });
    await assertScopedSessionMutation(db, actor);
    expect(mocks.legacy).toHaveBeenCalledWith(db, expect.objectContaining({ session: actor.session, userId: "actor", playerId: undefined }));
  });
  it("rejects removal while lineup foreign keys still reference the player", async () => {
    const { db, tx } = fixture();
    tx.sessionLineupRow.findFirst.mockResolvedValue({ id: "lineup" } as never);
    await expect(assertPlayerNotInLineup(db, "s", "p")).rejects.toThrow("Remove this player from the lineup first");
  });
});

describe("upgraded court writers", () => {
  it("rejects non-host generation under the writer even after valid preflight", async () => {
    const { db } = fixture({ actorClub: "partner" });
    const mutate = vi.fn();
    await expect(sessionMatchMutationTransaction(db, "s", { userId: "actor" }, mutate)).rejects.toThrow("Only the host club");
    expect(mutate).not.toHaveBeenCalled();
  });
  it.each([undefined, { userId: "actor" }])("blocks automatic and manual LINEUP generation under the writer", async (actor) => {
    const { db } = fixture({ mode: "LINEUP" });
    const mutate = vi.fn();
    await expect(sessionMatchMutationTransaction(db, "s", actor, mutate)).rejects.toThrow("agreed lineup");
    expect(mutate).not.toHaveBeenCalled();
  });
  it("allows only the explicit host undo operation through LINEUP", async () => {
    const { db } = fixture({ mode: "LINEUP" });
    const mutate = vi.fn().mockResolvedValue("undone");
    await expect(sessionMatchMutationTransaction(db, "s", { userId: "actor" }, mutate, { operation: "undo" })).resolves.toBe("undone");
    expect(mutate).toHaveBeenCalledOnce();
  });
  it("rejects LINEUP generation at endpoint preflight while preserving legacy modes", () => {
    expect(() => assertFreePlayScheduling({ collaborationVersion: 2, schedulingMode: "LINEUP" })).toThrow("agreed lineup");
    expect(() => assertFreePlayScheduling({ collaborationVersion: 1, schedulingMode: "LINEUP" })).not.toThrow();
  });
});
