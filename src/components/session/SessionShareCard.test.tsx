import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
  SessionType,
} from "@/types/enums";
import type { Player } from "./sessionTypes";
import { SessionShareCard } from "./SessionShareCard";

function createPlayer({
  userId,
  name,
  sessionPoints = 0,
  isGuest = false,
}: {
  userId: string;
  name: string;
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
      avatarUrl: null,
      elo: 1000,
    },
  };
}

function renderShareCard(players: Player[]) {
  const pointDiffByUserId = new Map(
    players.map((player, index) => [player.userId, 12 - index] as const)
  );
  const playerStatsByUserId = new Map(
    players.map((player, index) => [
      player.userId,
      {
        played: index + 1,
        wins: Math.max(0, 6 - index),
        losses: index,
      },
    ])
  );

  return renderToStaticMarkup(
    <SessionShareCard
      sessionName="Weekend Cup"
      communityName="Tutorial playground"
      sessionType={SessionType.POINTS}
      sessionTypeLabel="Points"
      players={players}
      pointDiffByUserId={pointDiffByUserId}
      playerStatsByUserId={playerStatsByUserId}
    />
  );
}

describe("SessionShareCard", () => {
  it("renders podium ranks 1-3 and standings rows 4-11 only", () => {
    const players = Array.from({ length: 11 }, (_, index) =>
      createPlayer({
        userId: `u${index + 1}`,
        name: `Player ${index + 1}`,
        sessionPoints: 40 - index,
      })
    );

    const markup = renderShareCard(players);

    expect(markup).toContain("Final standings");
    expect(markup).toContain("Positions 4-11");
    expect(markup).toContain(">1<");
    expect(markup).toContain(">2<");
    expect(markup).toContain(">3<");
    expect(markup).toContain(">4<");
    expect(markup).toContain(">11<");
    expect(markup).toContain("6W / 0L");
  });

  it("does not repeat the podium names in the positions 4-10 list", () => {
    const players = [
      createPlayer({ userId: "u1", name: "Amir", sessionPoints: 61 }),
      createPlayer({ userId: "u2", name: "Danish", sessionPoints: 42 }),
      createPlayer({ userId: "u3", name: "Farah", sessionPoints: 42 }),
      createPlayer({ userId: "u4", name: "Siti", sessionPoints: 42 }),
      createPlayer({ userId: "u5", name: "Aiman", sessionPoints: 42 }),
      createPlayer({ userId: "u6", name: "Mira", sessionPoints: 40 }),
      createPlayer({ userId: "u7", name: "Haziq", sessionPoints: 36 }),
      createPlayer({ userId: "u8", name: "Nadia", sessionPoints: 33 }),
      createPlayer({ userId: "u9", name: "Rafi", sessionPoints: 32 }),
      createPlayer({ userId: "u10", name: "Zul", sessionPoints: 29 }),
      createPlayer({ userId: "u11", name: "Yana", sessionPoints: 18 }),
    ];

    const markup = renderShareCard(players);

    expect(markup).toContain("Siti");
    expect(markup).toContain("Zul");
    expect(markup.match(/>Amir</g) ?? []).toHaveLength(1);
    expect(markup.match(/>Danish</g) ?? []).toHaveLength(1);
    expect(markup.match(/>Farah</g) ?? []).toHaveLength(1);
  });

  it("uses truncation-friendly compact row content for long names and guest labels", () => {
    const players = [
      createPlayer({ userId: "u1", name: "Amir", sessionPoints: 61 }),
      createPlayer({ userId: "u2", name: "Danish", sessionPoints: 42 }),
      createPlayer({ userId: "u3", name: "Farah", sessionPoints: 42 }),
      createPlayer({
        userId: "u4",
        name: "Nurul Aisyah Long",
        sessionPoints: 39,
        isGuest: true,
      }),
      createPlayer({ userId: "u5", name: "Aiman", sessionPoints: 38 }),
      createPlayer({ userId: "u6", name: "Mira", sessionPoints: 37 }),
      createPlayer({ userId: "u7", name: "Haziq", sessionPoints: 36 }),
      createPlayer({ userId: "u8", name: "Nadia", sessionPoints: 35 }),
      createPlayer({ userId: "u9", name: "Rafi", sessionPoints: 34 }),
      createPlayer({ userId: "u10", name: "Zul", sessionPoints: 33 }),
      createPlayer({ userId: "u11", name: "Yana", sessionPoints: 32 }),
    ];

    const markup = renderShareCard(players);

    expect(markup).toContain("truncate");
    expect(markup).toContain("Guest");
    expect(markup).toContain("Nurul Aisyah Long");
  });
});
