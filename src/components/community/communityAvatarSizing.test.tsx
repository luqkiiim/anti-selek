// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommunityPlayersModal } from "@/components/community/CommunityPlayersModal";
import { CommunityLeaderboardPanel } from "@/components/community/CommunityLeaderboardPanel";
import { CommunityOverviewPulsePanel } from "@/components/community/CommunityOverviewPulsePanel";
import type {
  CommunityPageMember,
  CommunityPagePulse,
} from "@/components/community/communityTypes";
import {
  CommunityPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

function countMdAvatars(markup: string) {
  return markup.match(/h-14 w-14 text-base xl:h-12 xl:w-12 xl:text-sm/g)?.length ?? 0;
}

function countXsAvatars(markup: string) {
  return markup.match(/h-10 w-10 text-\[13px\] xl:h-8 xl:w-8 xl:text-\[11px\]/g)?.length ?? 0;
}

const member: CommunityPageMember = {
  id: "player-1",
  name: "Alex Lee",
  avatarUrl: "https://cdn.test/alex.jpg",
  status: CommunityPlayerStatus.CORE,
  gender: PlayerGender.UNSPECIFIED,
  partnerPreference: PartnerPreference.OPEN,
  elo: 1640,
  wins: 12,
  losses: 4,
  isClaimed: true,
  role: "MEMBER",
};

const pulse: CommunityPagePulse = {
  metrics: {
    members: 12,
    activeTournaments: 0,
    completedTournaments: 3,
    recentMatches: 18,
    activePlayers: 8,
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
  rivalries: [
    {
      players: [
        { id: "rival-1", name: "Ari Stone", avatarUrl: null },
        { id: "rival-2", name: "Sam Wong", avatarUrl: null },
      ],
      matches: 4,
      playerOneWins: 2,
      playerTwoWins: 2,
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

describe("community avatar sizing", () => {
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

  it("uses md avatars in the community leaderboard rows", async () => {
    await act(async () => {
      root.render(
        <CommunityLeaderboardPanel
          title="Leaderboard"
          subtitle="Top players"
          players={[member]}
          communityId="community-1"
          onOpenPlayerProfile={() => undefined}
        />
      );
    });

    expect(countMdAvatars(container.innerHTML)).toBe(1);
  });

  it("uses md avatars across compact community overview player rows", async () => {
    await act(async () => {
      root.render(
        <CommunityOverviewPulsePanel
          communityPulse={pulse}
          activeTournaments={[]}
          leaderboardPreview={[member]}
          onJoinTournament={() => undefined}
          onOpenTournament={() => undefined}
          onOpenLeaderboard={() => undefined}
          onOpenTournaments={() => undefined}
          onOpenPlayerProfile={() => undefined}
        />
      );
    });

    expect(container.textContent).toContain("Top rivalry");
    expect(container.textContent).toContain("Partner chemistry");
    expect(countMdAvatars(container.innerHTML)).toBe(6);
    expect(countXsAvatars(container.innerHTML)).toBe(2);
  });

  it("uses md avatars in the community player picker rows", async () => {
    await act(async () => {
      root.render(
        <CommunityPlayersModal
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
          onClose={() => undefined}
        />
      );
    });

    expect(countMdAvatars(document.body.innerHTML)).toBe(1);
  });
});
