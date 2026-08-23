import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import type { ClubAdminPlayer } from "./clubAdminTypes";
import { ClubPlayersPanel } from "./ClubPlayersPanel";

function buildPlayer(
  overrides: Partial<ClubAdminPlayer> = {}
): ClubAdminPlayer {
  return {
    id: "player-1",
    name: "Jane Doe",
    email: "jane@example.com",
    avatarUrl: null,
    status: ClubPlayerStatus.CORE,
    needsMoreRest: false,
    preferredPool: SessionPool.B,
    gender: PlayerGender.FEMALE,
    partnerPreference: PartnerPreference.OPEN,
    mixedSideOverride: null,
    elo: 1280,
    isActive: true,
    isClaimed: true,
    role: "ADMIN",
    isOwner: true,
    createdAt: "2026-07-27T00:00:00.000Z",
    offlineIdentityId: null,
    linkedClubBadges: [],
    ...overrides,
  };
}

function renderPanel(players: ClubAdminPlayer[]) {
  return renderToStaticMarkup(
    <ClubPlayersPanel
      players={players}
      filteredPlayers={players}
      claimedPlayersCount={players.filter((player) => player.isClaimed).length}
      occasionalPlayersCount={
        players.filter(
          (player) => player.status === ClubPlayerStatus.OCCASIONAL
        ).length
      }
      clubId="club-1"
      playerSearch=""
      onPlayerSearchChange={vi.fn()}
      onOpenCreatePlayer={vi.fn()}
      onOpenPlayerEditor={vi.fn()}
    />
  );
}

describe("ClubPlayersPanel", () => {
  it("renders the compact owner roster with direct profile and edit actions", () => {
    const markup = renderPanel([buildPlayer()]);

    expect(markup).toContain('data-owner-admin-panel="players"');
    expect(markup).toContain("Players and roles");
    expect(markup).toContain('placeholder="Search players by name or email"');
    expect(markup).toContain('href="/profile/player-1?clubId=club-1"');
    expect(markup).toContain("Owner · 1280 rating");
    expect(markup).toContain('aria-label="Edit Jane Doe"');
  });

  it("keeps important placeholder and roster states in the compact metadata", () => {
    const markup = renderPanel([
      buildPlayer({
        isOwner: false,
        role: "MEMBER",
        status: ClubPlayerStatus.OCCASIONAL,
        isClaimed: false,
        isActive: false,
        offlineIdentityId: "identity-1",
      }),
    ]);

    expect(markup).toContain(
      "Member · Occasional · Placeholder · Inactive · Linked · 1280 rating"
    );
  });
});
