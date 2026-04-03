import { describe, expect, it } from "vitest";
import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "@/types/enums";
import type { SessionData } from "@/components/session/sessionTypes";
import {
  applyQueuedMatch,
  applyGeneratedMatches,
  applyGuestAdded,
  applyCourtLabelUpdates,
  applyPlayerNameUpdate,
  applyPlayerPaused,
  applyPlayerRemoval,
  applyUndoneCourtMatch,
  applyScoreApproval,
  applyScoreReopen,
  applyScoreSubmission,
  mergeSessionSnapshot,
} from "./sessionDataMutations";

function createSessionData(): SessionData {
  return {
    id: "session-1",
    code: "session-1",
    communityId: "community-1",
    name: "Test Session",
    type: SessionType.POINTS,
    mode: SessionMode.MEXICANO,
    status: "ACTIVE",
    isTest: false,
    viewerCanManage: true,
    viewerCommunityRole: "ADMIN",
    courts: [
      {
        id: "court-1",
        courtNumber: 1,
        currentMatch: null,
      },
    ],
    players: [
      {
        userId: "p1",
        sessionPoints: 0,
        isPaused: false,
        isGuest: false,
        gender: PlayerGender.MALE,
        partnerPreference: PartnerPreference.OPEN,
        user: { id: "p1", name: "Player 1", elo: 1000 },
      },
      {
        userId: "p2",
        sessionPoints: 0,
        isPaused: false,
        isGuest: false,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
        user: { id: "p2", name: "Player 2", elo: 1000 },
      },
      {
        userId: "p3",
        sessionPoints: 0,
        isPaused: false,
        isGuest: false,
        gender: PlayerGender.MALE,
        partnerPreference: PartnerPreference.OPEN,
        user: { id: "p3", name: "Player 3", elo: 1000 },
      },
      {
        userId: "p4",
        sessionPoints: 0,
        isPaused: false,
        isGuest: false,
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
        user: { id: "p4", name: "Player 4", elo: 1000 },
      },
    ],
    matches: [],
  };
}

describe("sessionDataMutations", () => {
  it("merges partial session snapshots without dropping viewer metadata or history", () => {
    const current = {
      ...createSessionData(),
      matches: [
        {
          id: "completed-1",
          team1User1Id: "p1",
          team1User2Id: "p2",
          team2User1Id: "p3",
          team2User2Id: "p4",
          winnerTeam: 1,
          status: "COMPLETED",
        },
      ],
    };

    const merged = mergeSessionSnapshot(current, {
      status: "COMPLETED",
      courts: current.courts,
      players: current.players,
    });

    expect(merged.status).toBe("COMPLETED");
    expect(merged.viewerCanManage).toBe(true);
    expect(merged.viewerCommunityRole).toBe("ADMIN");
    expect(merged.matches).toHaveLength(1);
  });

  it("applies generated matches directly to the target court", () => {
    const updated = applyGeneratedMatches(createSessionData(), [
      {
        id: "match-1",
        courtId: "court-1",
        status: "IN_PROGRESS",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      },
    ]);

    expect(updated.courts[0].currentMatch?.id).toBe("match-1");
    expect(updated.courts[0].currentMatch?.team1User1.name).toBe("Player 1");
  });

  it("updates court labels without dropping the current match", () => {
    const withMatch = applyGeneratedMatches(createSessionData(), [
      {
        id: "match-1",
        courtId: "court-1",
        status: "IN_PROGRESS",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      },
    ]);

    const updated = applyCourtLabelUpdates(withMatch, [
      { id: "court-1", label: "Center Court" },
    ]);

    expect(updated.courts[0].label).toBe("Center Court");
    expect(updated.courts[0].currentMatch?.id).toBe("match-1");
  });

  it("reflects pending score submission on the live court and in match history", () => {
    const withMatch = applyGeneratedMatches(createSessionData(), [
      {
        id: "match-1",
        courtId: "court-1",
        status: "IN_PROGRESS",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      },
    ]);

    const updated = applyScoreSubmission(withMatch, {
      id: "match-1",
      status: "PENDING_APPROVAL",
      winnerTeam: 1,
      team1Score: 21,
      team2Score: 18,
      completedAt: "2026-03-16T10:00:00.000Z",
      scoreSubmittedByUserId: "p1",
      team1User1: { id: "p1", name: "Player 1" },
      team1User2: { id: "p2", name: "Player 2" },
      team2User1: { id: "p3", name: "Player 3" },
      team2User2: { id: "p4", name: "Player 4" },
    });

    expect(updated.courts[0].currentMatch?.status).toBe("PENDING_APPROVAL");
    expect(updated.courts[0].currentMatch?.team1Score).toBe(21);
    expect(updated.matches).toHaveLength(1);
    expect(updated.matches?.[0].status).toBe("PENDING_APPROVAL");
  });

  it("applies approved scores without waiting for a full session refetch", () => {
    const withPendingMatch = applyScoreSubmission(
      applyGeneratedMatches(createSessionData(), [
        {
          id: "match-1",
          courtId: "court-1",
          status: "IN_PROGRESS",
          team1User1: { id: "p1", name: "Player 1" },
          team1User2: { id: "p2", name: "Player 2" },
          team2User1: { id: "p3", name: "Player 3" },
          team2User2: { id: "p4", name: "Player 4" },
        },
      ]),
      {
        id: "match-1",
        status: "PENDING_APPROVAL",
        winnerTeam: 1,
        team1Score: 21,
        team2Score: 18,
        completedAt: "2026-03-16T10:00:00.000Z",
        scoreSubmittedByUserId: "p1",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      }
    );

    const updated = applyScoreApproval(withPendingMatch, {
      id: "match-1",
      status: "COMPLETED",
      winnerTeam: 1,
      team1Score: 21,
      team2Score: 18,
      team1EloChange: 10,
      team2EloChange: -10,
      completedAt: "2026-03-16T10:00:00.000Z",
      team1User1Id: "p1",
      team1User2Id: "p2",
      team2User1Id: "p3",
      team2User2Id: "p4",
    });

    expect(updated.courts[0].currentMatch).toBeNull();
    expect(updated.matches?.[0].status).toBe("COMPLETED");
    expect(updated.players.find((player) => player.userId === "p1")?.sessionPoints).toBe(3);
    expect(updated.players.find((player) => player.userId === "p3")?.sessionPoints).toBe(0);
    expect(updated.players.find((player) => player.userId === "p1")?.user.elo).toBe(1010);
    expect(updated.players.find((player) => player.userId === "p3")?.user.elo).toBe(990);
  });

  it("keeps persistent ratings unchanged in test sessions", () => {
    const testSession = {
      ...createSessionData(),
      isTest: true,
    };
    const withPendingMatch = applyScoreSubmission(
      applyGeneratedMatches(testSession, [
        {
          id: "match-1",
          courtId: "court-1",
          status: "IN_PROGRESS",
          team1User1: { id: "p1", name: "Player 1" },
          team1User2: { id: "p2", name: "Player 2" },
          team2User1: { id: "p3", name: "Player 3" },
          team2User2: { id: "p4", name: "Player 4" },
        },
      ]),
      {
        id: "match-1",
        status: "PENDING_APPROVAL",
        winnerTeam: 1,
        team1Score: 21,
        team2Score: 18,
        completedAt: "2026-03-16T10:00:00.000Z",
        scoreSubmittedByUserId: "p1",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      }
    );

    const updated = applyScoreApproval(withPendingMatch, {
      id: "match-1",
      status: "COMPLETED",
      winnerTeam: 1,
      team1Score: 21,
      team2Score: 18,
      team1EloChange: 10,
      team2EloChange: -10,
      completedAt: "2026-03-16T10:00:00.000Z",
      team1User1Id: "p1",
      team1User2Id: "p2",
      team2User1Id: "p3",
      team2User2Id: "p4",
    });

    expect(updated.players.find((player) => player.userId === "p1")?.user.elo).toBe(1000);
    expect(updated.players.find((player) => player.userId === "p3")?.user.elo).toBe(1000);
  });

  it("can reopen a pending match and remove it from history", () => {
    const approved = applyScoreSubmission(
      applyGeneratedMatches(createSessionData(), [
        {
          id: "match-1",
          courtId: "court-1",
          status: "IN_PROGRESS",
          team1User1: { id: "p1", name: "Player 1" },
          team1User2: { id: "p2", name: "Player 2" },
          team2User1: { id: "p3", name: "Player 3" },
          team2User2: { id: "p4", name: "Player 4" },
        },
      ]),
      {
        id: "match-1",
        status: "PENDING_APPROVAL",
        winnerTeam: 2,
        team1Score: 18,
        team2Score: 21,
        completedAt: "2026-03-16T10:00:00.000Z",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      }
    );

    const reopened = applyScoreReopen(approved, {
      id: "match-1",
      status: "IN_PROGRESS",
      team1User1: { id: "p1", name: "Player 1" },
      team1User2: { id: "p2", name: "Player 2" },
      team2User1: { id: "p3", name: "Player 3" },
      team2User2: { id: "p4", name: "Player 4" },
    });

    expect(reopened.courts[0].currentMatch?.status).toBe("IN_PROGRESS");
    expect(reopened.matches).toHaveLength(0);
  });

  it("handles guest add/remove locally", () => {
    const withGuest = applyGuestAdded(createSessionData(), {
      id: "guest-1",
      name: "Guest 1",
      elo: 950,
      isGuest: true,
      ladderEntryAt: "2026-03-18T00:00:00.000Z",
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
    });

    const withoutGuest = applyPlayerRemoval(withGuest, "guest-1");

    expect(withGuest.players.some((player) => player.userId === "guest-1")).toBe(true);
    expect(withoutGuest.players.some((player) => player.userId === "guest-1")).toBe(false);
  });

  it("applies a queued next match without disturbing live courts", () => {
    const updated = applyQueuedMatch(createSessionData(), {
      id: "queue-1",
      createdAt: "2026-03-30T10:00:00.000Z",
      team1User1: { id: "p1", name: "Player 1" },
      team1User2: { id: "p2", name: "Player 2" },
      team2User1: { id: "p3", name: "Player 3" },
      team2User2: { id: "p4", name: "Player 4" },
    });

    expect(updated.queuedMatch?.id).toBe("queue-1");
    expect(updated.courts[0].currentMatch).toBeNull();
  });

  it("keeps the queued next match when other matches are generated", () => {
    const withQueue = applyQueuedMatch(createSessionData(), {
      id: "queue-1",
      team1User1: { id: "p1", name: "Player 1" },
      team1User2: { id: "p2", name: "Player 2" },
      team2User1: { id: "p3", name: "Player 3" },
      team2User2: { id: "p4", name: "Player 4" },
    });

    const updated = applyGeneratedMatches(withQueue, [
      {
        id: "match-1",
        courtId: "court-1",
        status: "IN_PROGRESS",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      },
    ]);

    expect(updated.queuedMatch?.id).toBe("queue-1");
    expect(updated.courts[0].currentMatch?.id).toBe("match-1");
  });

  it("clears the queued next match when a reserved player is paused", () => {
    const withQueue = applyQueuedMatch(createSessionData(), {
      id: "queue-1",
      team1User1: { id: "p1", name: "Player 1" },
      team1User2: { id: "p2", name: "Player 2" },
      team2User1: { id: "p3", name: "Player 3" },
      team2User2: { id: "p4", name: "Player 4" },
    });

    const updated = applyPlayerPaused(withQueue, "p1", true);

    expect(updated.queuedMatch).toBeNull();
  });

  it("updates a renamed guest across players, live court, and queue", () => {
    const withLiveCourt = applyGeneratedMatches(createSessionData(), [
      {
        id: "match-1",
        courtId: "court-1",
        status: "IN_PROGRESS",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      },
    ]);
    const withQueue = applyQueuedMatch(withLiveCourt, {
      id: "queue-1",
      team1User1: { id: "p1", name: "Player 1" },
      team1User2: { id: "p2", name: "Player 2" },
      team2User1: { id: "p3", name: "Player 3" },
      team2User2: { id: "p4", name: "Player 4" },
    });

    const updated = applyPlayerNameUpdate(withQueue, "p1", "Alice");

    expect(updated.players.find((player) => player.userId === "p1")?.user.name).toBe(
      "Alice"
    );
    expect(updated.courts[0].currentMatch?.team1User1.name).toBe("Alice");
    expect(updated.queuedMatch?.team1User1.name).toBe("Alice");
  });

  it("can promote a queued match into a freed court after undo", () => {
    const withLiveCourt = applyGeneratedMatches(createSessionData(), [
      {
        id: "match-1",
        courtId: "court-1",
        status: "IN_PROGRESS",
        team1User1: { id: "p1", name: "Player 1" },
        team1User2: { id: "p2", name: "Player 2" },
        team2User1: { id: "p3", name: "Player 3" },
        team2User2: { id: "p4", name: "Player 4" },
      },
    ]);
    const withQueue = applyQueuedMatch(withLiveCourt, {
      id: "queue-1",
      createdAt: "2026-03-30T10:05:00.000Z",
      team1User1: { id: "p1", name: "Player 1" },
      team1User2: { id: "p2", name: "Player 2" },
      team2User1: { id: "p3", name: "Player 3" },
      team2User2: { id: "p4", name: "Player 4" },
    });

    const updated = applyQueuedMatch(
      applyGeneratedMatches(
        applyUndoneCourtMatch(withQueue, "court-1"),
        [
          {
            id: "match-2",
            courtId: "court-1",
            status: "IN_PROGRESS",
            team1User1: { id: "p1", name: "Player 1" },
            team1User2: { id: "p2", name: "Player 2" },
            team2User1: { id: "p3", name: "Player 3" },
            team2User2: { id: "p4", name: "Player 4" },
          },
        ]
      ),
      null
    );

    expect(updated.courts[0].currentMatch?.id).toBe("match-2");
    expect(updated.queuedMatch).toBeNull();
  });

  it("does not award session points when approving a ladder match", () => {
    const ladderSession = {
      ...createSessionData(),
      type: SessionType.LADDER,
    };
    const updated = applyScoreApproval(
      applyScoreSubmission(
        applyGeneratedMatches(ladderSession, [
          {
            id: "match-1",
            courtId: "court-1",
            status: "IN_PROGRESS",
            team1User1: { id: "p1", name: "Player 1" },
            team1User2: { id: "p2", name: "Player 2" },
            team2User1: { id: "p3", name: "Player 3" },
            team2User2: { id: "p4", name: "Player 4" },
          },
        ]),
        {
          id: "match-1",
          status: "PENDING_APPROVAL",
          winnerTeam: 1,
          team1Score: 21,
          team2Score: 18,
          completedAt: "2026-03-16T10:00:00.000Z",
          team1User1: { id: "p1", name: "Player 1" },
          team1User2: { id: "p2", name: "Player 2" },
          team2User1: { id: "p3", name: "Player 3" },
          team2User2: { id: "p4", name: "Player 4" },
        }
      ),
      {
        id: "match-1",
        status: "COMPLETED",
        winnerTeam: 1,
        team1Score: 21,
        team2Score: 18,
        team1EloChange: 10,
        team2EloChange: -10,
        completedAt: "2026-03-16T10:00:00.000Z",
        team1User1Id: "p1",
        team1User2Id: "p2",
        team2User1Id: "p3",
        team2User2Id: "p4",
      }
    );

    expect(updated.players.find((player) => player.userId === "p1")?.sessionPoints).toBe(0);
    expect(updated.players.find((player) => player.userId === "p3")?.sessionPoints).toBe(0);
    expect(updated.players.find((player) => player.userId === "p1")?.user.elo).toBe(1010);
  });

  it("does not award session points when approving a race match", () => {
    const raceSession = {
      ...createSessionData(),
      type: SessionType.RACE,
    };
    const updated = applyScoreApproval(
      applyScoreSubmission(
        applyGeneratedMatches(raceSession, [
          {
            id: "match-1",
            courtId: "court-1",
            status: "IN_PROGRESS",
            team1User1: { id: "p1", name: "Player 1" },
            team1User2: { id: "p2", name: "Player 2" },
            team2User1: { id: "p3", name: "Player 3" },
            team2User2: { id: "p4", name: "Player 4" },
          },
        ]),
        {
          id: "match-1",
          status: "PENDING_APPROVAL",
          winnerTeam: 1,
          team1Score: 21,
          team2Score: 18,
          completedAt: "2026-03-16T10:00:00.000Z",
          team1User1: { id: "p1", name: "Player 1" },
          team1User2: { id: "p2", name: "Player 2" },
          team2User1: { id: "p3", name: "Player 3" },
          team2User2: { id: "p4", name: "Player 4" },
        }
      ),
      {
        id: "match-1",
        status: "COMPLETED",
        winnerTeam: 1,
        team1Score: 21,
        team2Score: 18,
        team1EloChange: 10,
        team2EloChange: -10,
        completedAt: "2026-03-16T10:00:00.000Z",
        team1User1Id: "p1",
        team1User2Id: "p2",
        team2User1Id: "p3",
        team2User2Id: "p4",
      }
    );

    expect(updated.players.find((player) => player.userId === "p1")?.sessionPoints).toBe(0);
    expect(updated.players.find((player) => player.userId === "p3")?.sessionPoints).toBe(0);
    expect(updated.players.find((player) => player.userId === "p1")?.user.elo).toBe(1010);
  });
});
