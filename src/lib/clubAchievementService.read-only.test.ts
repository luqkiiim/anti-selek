import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ members: vi.fn(), sessions: vi.fn(), transaction: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { clubMember: { findMany: mocks.members }, session: { findMany: mocks.sessions }, $transaction: mocks.transaction } }));
vi.mock("./offlineIdentities", () => ({ getClubStatUserResolver: vi.fn(async () => (id: string) => id) }));
vi.mock("./clubAchievements", () => ({ buildClubAchievements: mocks.build }));
import { getClubAchievementCollection } from "./clubAchievementService";
describe("global achievement reads do not persist legacy eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.members.mockResolvedValue([{ playerId: "player-1", createdAt: new Date("2026-01-01"), achievementPreferencesJson: "{}" }, { playerId: "future-player", createdAt: new Date("2027-01-01"), achievementPreferencesJson: "{}" }]);
    mocks.sessions.mockResolvedValue([{ id: "session-1", code: "ABC", name: "Legacy session", clubId: "club-1", endedAt: new Date("2026-06-01"), achievementEligibilityJson: "{}", players: [], sessionClubs: [], matches: [] }]);
    mocks.build.mockReturnValue([]);
  });
  it("computes the known historical roster in memory without any transaction or writes", async () => {
    expect(await getClubAchievementCollection("club-1", "player-1", { readOnly: true })).toEqual({ achievements: [], showcase: [], unseen: [] });
    expect(mocks.build).toHaveBeenCalledWith("player-1", ["player-1", "future-player"], [expect.objectContaining({ eligibleIds: ["player-1"] })]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
