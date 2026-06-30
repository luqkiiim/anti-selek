// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClubPlayersModal } from "@/components/club/ClubPlayersModal";
import { ClubLeaderboardPanel } from "@/components/club/ClubLeaderboardPanel";
import { ClubOverviewPulsePanel } from "@/components/club/ClubOverviewPulsePanel";
import type {
  ClubPageMember,
  ClubPagePulse,
} from "@/components/club/clubTypes";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
  SessionCollabFormat,
} from "@/types/enums";

function countMdAvatars(markup: string) {
  return markup.match(/h-14 w-14 text-base xl:h-12 xl:w-12 xl:text-sm/g)?.length ?? 0;
}

function countSmAvatars(markup: string) {
  return markup.match(/h-12 w-12 text-sm xl:h-10 xl:w-10 xl:text-\[13px\]/g)?.length ?? 0;
}

const member: ClubPageMember = {
  id: "player-1",
  name: "Alex Lee",
  avatarUrl: "https://cdn.test/alex.jpg",
  status: ClubPlayerStatus.CORE,
  needsMoreRest: false,
  gender: PlayerGender.UNSPECIFIED,
  partnerPreference: PartnerPreference.OPEN,
  elo: 1640,
  wins: 12,
  losses: 4,
  isClaimed: true,
  role: "MEMBER",
};

const pulse: ClubPagePulse = {
  metrics: {
    members: 12,
    activeTournaments: 0,
    completedTournaments: 3,
    recentMatches: 18,
    activePlayers: 8,
    totalMatches: 42,
    totalSessions: 12,
    lastPlayedAt: "2026-05-18T00:00:00.000Z",
  },
  hotPlayers: [
    {
      user: { id: "hot-1", name: "Mia Chen", avatarUrl: null },
      matches: 5,
      wins: 4,
      losses: 1,
      winRate: 80,
      ratingChange: 16,
      pointDifferential: 22,
      currentStreak: { result: "WIN", count: 3 },
      heatScore: 99,
    },
  ],
  ratingMovers: [
    {
      user: { id: "mover-1", name: "Amir Hakim", avatarUrl: null },
      matches: 3,
      wins: 2,
      losses: 1,
      winRate: 67,
      ratingChange: 42,
      pointDifferential: 14,
      currentStreak: { result: null, count: 0 },
      heatScore: 42,
    },
  ],
  rivalries: [
    {
      players: [
        { id: "rival-1", name: "Ari Stone", avatarUrl: null },
        { id: "rival-2", name: "Sam Wong", avatarUrl: null },
      ],
      matches: 46,
      playerOneWins: 22,
      playerTwoWins: 24,
      lastPlayedAt: "2026-05-18",
      lastSession: {
        code: "RIV1",
        name: "Rival Night",
      },
    },
  ],
  partnerships: [
    {
      players: [
        { id: "partner-1", name: "June Park", avatarUrl: null },
        { id: "partner-2", name: "Leo Ong", avatarUrl: null },
      ],
      matches: 11,
      wins: 10,
      losses: 1,
      winRate: 91,
      lastPlayedAt: "2026-05-20",
      lastSession: {
        code: "PAIR1",
        name: "Chemistry Cup",
      },
    },
  ],
  recentMatches: [
    {
      id: "match-1",
      completedAt: "2026-05-18T00:00:00.000Z",
      session: {
        id: "session-1",
        code: "ABCD",
        name: "Weekend Mix",
      },
      team1: [
        { id: "hot-1", name: "Mia Chen", avatarUrl: null },
        { id: "partner-1", name: "June Park", avatarUrl: null },
      ],
      team2: [
        { id: "rival-1", name: "Ari Stone", avatarUrl: null },
        { id: "rival-2", name: "Sam Wong", avatarUrl: null },
      ],
      team1Score: 21,
      team2Score: 16,
      winnerTeam: 1,
    },
  ],
  sessionNews: [
    {
      id: "session-1:rating_jump:story-1",
      type: "RATING_JUMP",
      session: {
        id: "session-1",
        code: "ABCD",
        name: "Weekend Mix",
        date: "2026-05-19",
      },
      title: "Nora Tan",
      detail: "Biggest rating jump",
      value: "+11 rating",
      players: [{ id: "story-1", name: "Nora Tan", avatarUrl: null }],
      featuredPlayers: [{ id: "story-1", name: "Nora Tan", avatarUrl: null }],
      likeCount: 2,
      likedByMe: true,
    },
  ],
  latestStory: {
    session: {
      id: "session-1",
      code: "ABCD",
      name: "Weekend Mix",
      type: "POINTS",
      date: "2026-05-19",
      playerCount: 8,
    },
    matches: 6,
    topPerformer: {
      user: { id: "story-1", name: "Nora Tan", avatarUrl: null },
      matches: 4,
      wins: 3,
      winRate: 75,
      ratingChange: 11,
      pointDifferential: 17,
    },
  },
};

describe("club avatar sizing", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    document.body.removeAttribute("data-player-picker-open");
    document.body.style.cssText = "";
    document.documentElement.style.cssText = "";
  });

  it("uses md avatars in the club leaderboard rows", async () => {
    await act(async () => {
      root.render(
        <ClubLeaderboardPanel
          title="Leaderboard"
          subtitle="Top players"
          players={[member]}
          clubId="community-1"
          onOpenPlayerProfile={() => undefined}
        />
      );
    });

    expect(countMdAvatars(container.innerHTML)).toBe(1);
  });

  it("uses md avatars across compact club overview player rows", async () => {
    await act(async () => {
      root.render(
        <ClubOverviewPulsePanel
          clubId="community-1"
          clubPulse={pulse}
          activeTournaments={[]}
          onJoinTournament={() => undefined}
          onOpenTournament={() => undefined}
          onOpenTournaments={() => undefined}
          onOpenPlayerProfile={() => undefined}
        />
      );
    });

    const text = container.textContent ?? "";
    expect(text).toContain("Top rivalry");
    expect(text).toContain("Partner chemistry");
    expect(text).toContain("Session news");
    expect(text).toContain("Recent matches");
    expect(text).toContain("+11 rating");
    expect(text).toContain("24 - 22");
    expect(text).not.toContain("Power rankings");
    expect(text).not.toContain("Leaderboard");
    expect(text).not.toContain("46 games");
    expect(text).not.toContain("Ari Stone leads");
    expect(text).not.toContain("Sam Wong leads");
    expect(text).not.toContain("vs");
    expect(text).not.toContain("W 12 / L 4");
    expect(container.innerHTML).toContain("text-red-600");
    expect(countSmAvatars(container.innerHTML)).toBeGreaterThanOrEqual(6);
  });

  it("uses md avatars in the club player picker rows", async () => {
    await act(async () => {
      root.render(
        <ClubPlayersModal
          open
          selectedPlayerIds={[]}
          selectedPlayerPools={{}}
          playerSearch=""
          poolsEnabled={false}
          poolAName="Pool A"
          poolBName="Pool B"
          selectablePlayers={[member]}
          filteredSelectablePlayers={[member]}
          onPlayerSearchChange={() => undefined}
          onToggleAllPlayers={() => undefined}
          onTogglePlayerSelection={() => undefined}
          onChangePlayerPool={() => undefined}
          collabFormat={SessionCollabFormat.FREE_PLAY}
          hostClubId="club-1"
          hostClubName="Host Club"
          selectedPartnerClub={null}
          selectedPlayerRepresentingClubs={{}}
          onChangePlayerRepresentingClub={() => undefined}
          onClose={() => undefined}
        />
      );
    });

    expect(countMdAvatars(document.body.innerHTML)).toBe(1);
  });
});
