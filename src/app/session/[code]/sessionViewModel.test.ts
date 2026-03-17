import { describe, expect, it } from "vitest";
import { buildSessionViewModel } from "./sessionViewModel";
import type {
  CommunityUser,
  ManualMatchFormState,
  Player,
  SessionData,
} from "@/components/session/sessionTypes";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

function createPlayer(
  userId: string,
  name: string,
  overrides: Partial<Player> = {}
): Player {
  return {
    userId,
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    user: {
      id: userId,
      name,
      elo: 1000,
    },
    ...overrides,
  };
}

function createSessionData(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: "session-1",
    code: "CODE123",
    communityId: "community-1",
    name: "Tuesday Night",
    type: SessionType.ELO,
    mode: SessionMode.MIXICANO,
    status: SessionStatus.ACTIVE,
    viewerCanManage: true,
    viewerCommunityRole: "ADMIN",
    courts: [],
    players: [],
    matches: [],
    ...overrides,
  };
}

const emptyManualMatchForm: ManualMatchFormState = {
  team1User1Id: "",
  team1User2Id: "",
  team2User1Id: "",
  team2User2Id: "",
};

describe("buildSessionViewModel", () => {
  it("derives live session counts, sorting, and roster options", () => {
    const players = [
      createPlayer("u1", "Alice", { sessionPoints: 3 }),
      createPlayer("u2", "Ben", { sessionPoints: 3 }),
      createPlayer("u3", "Cara"),
      createPlayer("u4", "Dan"),
      createPlayer("u5", "Erin"),
      createPlayer("u6", "Finn"),
      createPlayer("u7", "Gray", { sessionPoints: 3 }),
      createPlayer("u8", "Hale", { sessionPoints: 3 }),
      createPlayer("u9", "Ivy", {
        isPaused: true,
        isGuest: true,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
    ];

    const communityPlayers: CommunityUser[] = [
      ...players
        .filter((player) => !player.isGuest)
        .map((player) => ({
          id: player.userId,
          name: player.user.name,
          elo: player.user.elo,
          gender: player.gender,
          partnerPreference: player.partnerPreference,
        })),
      {
        id: "u10",
        name: "Julia",
        elo: 1020,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      },
    ];

    const sessionData = createSessionData({
      courts: [
        {
          id: "court-1",
          courtNumber: 1,
          currentMatch: {
            id: "match-live-1",
            status: MatchStatus.IN_PROGRESS,
            team1User1: { id: "u1", name: "Alice" },
            team1User2: { id: "u2", name: "Ben" },
            team2User1: { id: "u3", name: "Cara" },
            team2User2: { id: "u4", name: "Dan" },
          },
        },
        {
          id: "court-2",
          courtNumber: 2,
          currentMatch: null,
        },
        {
          id: "court-3",
          courtNumber: 3,
          currentMatch: null,
        },
      ],
      players,
      matches: [
        {
          id: "match-1",
          team1User1Id: "u1",
          team1User2Id: "u2",
          team2User1Id: "u3",
          team2User2Id: "u4",
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
          status: MatchStatus.COMPLETED,
          completedAt: "2026-03-16T00:00:00.000Z",
        },
        {
          id: "match-2",
          team1User1Id: "u5",
          team1User2Id: "u6",
          team2User1Id: "u7",
          team2User2Id: "u8",
          team1Score: 17,
          team2Score: 21,
          winnerTeam: 2,
          status: MatchStatus.COMPLETED,
          completedAt: "2026-03-16T01:00:00.000Z",
        },
      ],
    });

    const viewModel = buildSessionViewModel({
      sessionData,
      communityPlayers,
      rosterSearch: "ju",
      manualMatchForm: {
        ...emptyManualMatchForm,
        team1User1Id: "u5",
        team2User1Id: "u6",
      },
      manualCourtId: "court-2",
      openPreferenceEditor: {
        userId: "u2",
        top: 16,
        left: 24,
      },
    });

    expect(viewModel.isMixicano).toBe(true);
    expect(viewModel.isCompletedSession).toBe(false);
    expect(viewModel.activeMatchesCount).toBe(1);
    expect(viewModel.readyCourtsCount).toBe(2);
    expect(viewModel.creatableOpenCourtCount).toBe(1);
    expect(viewModel.creatableOpenCourtIds).toEqual(["court-2"]);
    expect(viewModel.completedMatchesCount).toBe(2);
    expect(viewModel.pausedPlayersCount).toBe(1);
    expect(viewModel.guestPlayersCount).toBe(1);
    expect(viewModel.sessionModeLabel).toBe("Mixed");
    expect(viewModel.sessionTypeLabel).toBe("Ratings");
    expect(viewModel.activeManualCourt?.id).toBe("court-2");
    expect([...viewModel.selectedManualPlayerIds]).toEqual(["u5", "u6"]);
    expect(viewModel.manualMatchPlayerOptions.map((player) => player.user.name)).toEqual([
      "Erin",
      "Finn",
      "Gray",
      "Hale",
    ]);
    expect(viewModel.playersNotInSession.map((player) => player.name)).toEqual([
      "Julia",
    ]);
    expect(viewModel.pointDiffByUserId.get("u1")).toBe(3);
    expect(viewModel.pointDiffByUserId.get("u5")).toBe(-4);
    expect(viewModel.sortedPlayers.slice(0, 4).map((player) => player.user.name)).toEqual([
      "Gray",
      "Hale",
      "Alice",
      "Ben",
    ]);
    expect(viewModel.activePreferencePlayer?.user.name).toBe("Ben");
    expect(viewModel.getPlayerProfileHref(players[0])).toBe(
      "/profile/u1?communityId=community-1"
    );
    expect(viewModel.getPlayerProfileHref(players[8])).toBe("/profile/u9");
  });

  it("counts pending-approval matches in player records but not point diff", () => {
    const players = [
      createPlayer("u1", "Alice"),
      createPlayer("u2", "Ben"),
      createPlayer("u3", "Cara"),
      createPlayer("u4", "Dan"),
    ];

    const sessionData = createSessionData({
      communityId: null,
      mode: SessionMode.MEXICANO,
      status: SessionStatus.COMPLETED,
      players,
      matches: [
        {
          id: "match-1",
          team1User1Id: "u1",
          team1User2Id: "u2",
          team2User1Id: "u3",
          team2User2Id: "u4",
          team1Score: 21,
          team2Score: 19,
          winnerTeam: 1,
          status: MatchStatus.PENDING_APPROVAL,
        },
      ],
    });

    const viewModel = buildSessionViewModel({
      sessionData,
      communityPlayers: [],
      rosterSearch: "",
      manualMatchForm: emptyManualMatchForm,
      manualCourtId: null,
      openPreferenceEditor: null,
    });

    expect(viewModel.isMixicano).toBe(false);
    expect(viewModel.isCompletedSession).toBe(true);
    expect(viewModel.playerStatsByUserId.get("u1")).toEqual({
      played: 1,
      wins: 1,
      losses: 0,
    });
    expect(viewModel.playerStatsByUserId.get("u3")).toEqual({
      played: 1,
      wins: 0,
      losses: 1,
    });
    expect(viewModel.pointDiffByUserId.get("u1")).toBe(0);
    expect(viewModel.pointDiffByUserId.get("u3")).toBe(0);
    expect(viewModel.activePreferencePlayer).toBeNull();
    expect(viewModel.getPlayerProfileHref(players[0])).toBe("/profile/u1");
  });

  it("sorts ladder standings by record and ignores matches before ladder re-entry", () => {
    const players = [
      createPlayer("u1", "Alice"),
      createPlayer("u2", "Ben"),
      createPlayer("u3", "Cara", {
        ladderEntryAt: "2026-03-16T01:30:00.000Z",
      }),
      createPlayer("u4", "Dan"),
    ];

    const sessionData = createSessionData({
      type: SessionType.LADDER,
      mode: SessionMode.MEXICANO,
      players,
      matches: [
        {
          id: "match-1",
          team1User1Id: "u1",
          team1User2Id: "u2",
          team2User1Id: "u3",
          team2User2Id: "u4",
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
          status: MatchStatus.COMPLETED,
          completedAt: "2026-03-16T01:00:00.000Z",
        },
        {
          id: "match-2",
          team1User1Id: "u1",
          team1User2Id: "u4",
          team2User1Id: "u2",
          team2User2Id: "u3",
          team1Score: 19,
          team2Score: 21,
          winnerTeam: 2,
          status: MatchStatus.COMPLETED,
          completedAt: "2026-03-16T02:00:00.000Z",
        },
      ],
    });

    const viewModel = buildSessionViewModel({
      sessionData,
      communityPlayers: [],
      rosterSearch: "",
      manualMatchForm: emptyManualMatchForm,
      manualCourtId: null,
      openPreferenceEditor: null,
    });

    expect(viewModel.sessionTypeLabel).toBe("Ladder");
    expect(viewModel.playerStatsByUserId.get("u3")).toEqual({
      played: 1,
      wins: 1,
      losses: 0,
    });
    expect(viewModel.pointDiffByUserId.get("u3")).toBe(2);
    expect(viewModel.sortedPlayers.map((player) => player.user.name)).toEqual([
      "Ben",
      "Cara",
      "Alice",
      "Dan",
    ]);
  });
});
