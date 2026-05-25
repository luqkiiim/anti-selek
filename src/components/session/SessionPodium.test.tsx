import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
  SessionType,
} from "@/types/enums";
import type { Player } from "./sessionTypes";
import { SessionPodium } from "./SessionPodium";

function createPlayer({
  userId,
  name,
  avatarUrl = null,
  sessionPoints = 0,
  isGuest = false,
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  sessionPoints?: number;
  isGuest?: boolean;
}): Player {
  return {
    userId,
    sessionPoints,
    isPaused: false,
    isGuest,
    gender: PlayerGender.UNSPECIFIED,
    partnerPreference: PartnerPreference.OPEN,
    pool: SessionPool.A,
    user: {
      id: userId,
      name,
      avatarUrl,
      elo: 1000,
    },
  };
}

function renderPodium({
  sessionType = SessionType.POINTS,
  players,
  pointDiffByUserId = new Map<string, number>(),
  playerStatsByUserId = new Map<
    string,
    {
      played: number;
      wins: number;
      losses: number;
    }
  >(),
  celebrationRunId,
  onReplayCelebration,
}: {
  sessionType?: SessionType;
  players: Player[];
  pointDiffByUserId?: Map<string, number>;
  playerStatsByUserId?: Map<
    string,
    {
      played: number;
      wins: number;
      losses: number;
    }
  >;
  celebrationRunId?: number;
  onReplayCelebration?: () => void;
}) {
  return renderToStaticMarkup(
    <SessionPodium
      sessionType={sessionType}
      players={players}
      pointDiffByUserId={pointDiffByUserId}
      playerStatsByUserId={playerStatsByUserId}
      celebrationRunId={celebrationRunId}
      onReplayCelebration={onReplayCelebration}
    />
  );
}

describe("SessionPodium", () => {
  it("renders avatar images for podium players with profile photos", () => {
    const markup = renderPodium({
      players: [
        createPlayer({
          userId: "u1",
          name: "Alex Lee",
          avatarUrl: "https://cdn.test/avatars/alex.jpg",
          sessionPoints: 18,
        }),
        createPlayer({
          userId: "u2",
          name: "Bianca Tan",
          avatarUrl: "https://cdn.test/avatars/bianca.jpg",
          sessionPoints: 15,
        }),
        createPlayer({
          userId: "u3",
          name: "Chris Ong",
          avatarUrl: "https://cdn.test/avatars/chris.jpg",
          sessionPoints: 12,
        }),
      ],
    });

    expect(markup).toContain('<img');
    expect(markup).toContain('src="https://cdn.test/avatars/alex.jpg"');
    expect(markup.match(/loading="eager"/g) ?? []).toHaveLength(3);
    expect(markup.match(/<img[^>]*fetchPriority="high"/g) ?? []).toHaveLength(3);
    expect(markup.match(/data-avatar-size="xl"/g) ?? []).toHaveLength(3);
  });

  it("falls back to initials when a podium player has no profile photo", () => {
    const markup = renderPodium({
      players: [
        createPlayer({ userId: "u1", name: "Alex Lee", sessionPoints: 18 }),
        createPlayer({ userId: "u2", name: "Bianca Tan", sessionPoints: 15 }),
        createPlayer({ userId: "u3", name: "Chris Ong", sessionPoints: 12 }),
      ],
    });

    expect(markup).toContain('data-avatar-state="fallback"');
    expect(markup).toContain(">AL<");
  });

  it("keeps guest labels and podium stats visible with avatar badges", () => {
    const markup = renderPodium({
      sessionType: SessionType.LADDER,
      players: [
        createPlayer({
          userId: "u1",
          name: "Alex Lee",
          avatarUrl: "https://cdn.test/avatars/alex.jpg",
          isGuest: true,
        }),
        createPlayer({
          userId: "u2",
          name: "Bianca Tan",
          avatarUrl: "https://cdn.test/avatars/bianca.jpg",
        }),
        createPlayer({
          userId: "u3",
          name: "Chris Ong",
          avatarUrl: "https://cdn.test/avatars/chris.jpg",
        }),
      ],
      pointDiffByUserId: new Map([
        ["u1", 9],
        ["u2", 4],
        ["u3", -3],
      ]),
      playerStatsByUserId: new Map([
        ["u1", { played: 4, wins: 3, losses: 1 }],
        ["u2", { played: 4, wins: 2, losses: 2 }],
        ["u3", { played: 4, wins: 1, losses: 3 }],
      ]),
    });

    expect(markup).toContain("Guest");
    expect(markup).toContain(">3-1<");
    expect(markup).toContain(">Record<");
    expect(markup).toContain("+9 diff");
    expect(markup).toContain('data-avatar-size="xl"');
  });

  it("renders a replay celebration action when provided", () => {
    const markup = renderPodium({
      players: [
        createPlayer({ userId: "u1", name: "Alex Lee", sessionPoints: 18 }),
        createPlayer({ userId: "u2", name: "Bianca Tan", sessionPoints: 15 }),
      ],
      onReplayCelebration: () => undefined,
    });

    expect(markup).toContain('aria-label="Replay winner celebration"');
    expect(markup).toContain('title="Replay winner celebration"');
    expect(markup).toContain("<svg");
    expect(markup).not.toContain(">Replay celebration<");
    expect(markup).not.toContain('data-testid="podium-burst-particles"');
  });

  it("renders celebration burst markup when a celebration run is active", () => {
    const markup = renderPodium({
      celebrationRunId: 2,
      onReplayCelebration: () => undefined,
      players: [
        createPlayer({ userId: "u1", name: "Alex Lee", sessionPoints: 18 }),
        createPlayer({ userId: "u2", name: "Bianca Tan", sessionPoints: 15 }),
        createPlayer({ userId: "u3", name: "Chris Ong", sessionPoints: 12 }),
      ],
    });

    expect(markup).toContain('data-testid="podium-burst-particles"');
    expect(markup).toContain("--podium-finale-delay:1760ms");
    expect(markup).toContain("app-podium-burst-entrant");
    expect(markup).toContain("app-podium-burst-champion");
    expect(markup).toContain("app-podium-burst-crown");
    expect(markup).toContain("app-podium-burst-ribbon-four");
    expect(markup).toContain("app-podium-burst-spark-four");
  });

  it("reveals podium players in rank order from third to champion", () => {
    const markup = renderPodium({
      celebrationRunId: 1,
      players: [
        createPlayer({ userId: "u1", name: "Alex Lee", sessionPoints: 18 }),
        createPlayer({ userId: "u2", name: "Bianca Tan", sessionPoints: 15 }),
        createPlayer({ userId: "u3", name: "Chris Ong", sessionPoints: 12 }),
      ],
    });

    expect(markup).toContain("--podium-reveal-delay:500ms");
    expect(markup).toContain("--podium-reveal-delay:1000ms");
    expect(markup).toContain("--podium-reveal-delay:1500ms");
  });
});
