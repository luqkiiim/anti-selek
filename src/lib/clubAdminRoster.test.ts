import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ roster: vi.fn(), matches: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { match: { findMany: mocks.matches } } }));
vi.mock("./clubRoster", () => ({ getClubRoster: mocks.roster }));
vi.mock("./offlineIdentities", () => ({ getClubStatUserResolver: async () => (id: string) => id === "legacy-a" ? "a" : id }));
import { getClubAdminRoster } from "./clubAdminRoster";
beforeEach(() => vi.clearAllMocks());
it("preserves resolved match counts and results without loading session details", async () => {
  mocks.roster.mockResolvedValue([{ id: "a", name: "A", elo: 1200, ownerUserId: "account", wins: 0, losses: 0 }, { id: "b", name: "B", elo: 900, ownerUserId: null, wins: 0, losses: 0 }]);
  mocks.matches.mockResolvedValue([
    { team1Player1Id: "legacy-a", team1Player2Id: "c", team2Player1Id: "b", team2Player2Id: "d", winnerTeam: 1 },
    { team1Player1Id: "a", team1Player2Id: "b", team2Player1Id: "c", team2Player2Id: "d", winnerTeam: null },
  ]);
  expect(await getClubAdminRoster("club")).toEqual([
    { id: "a", name: "A", elo: 1200, ownerUserId: "account", wins: 1, losses: 0, matchesPlayed: 2 },
    { id: "b", name: "B", elo: 900, ownerUserId: null, wins: 0, losses: 1, matchesPlayed: 2 },
  ]);
  const query = mocks.matches.mock.calls[0][0];
  expect(query.where.session).toMatchObject({ isTest: false, OR: [{ clubId: "club" }, { sessionClubs: { some: { clubId: "club", status: "ACCEPTED" } } }] });
  expect(query).not.toHaveProperty("include");
});
