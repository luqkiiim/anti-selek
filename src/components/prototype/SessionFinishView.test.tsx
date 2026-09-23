import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
  SessionType,
} from "@/types/enums";
import type { Player } from "@/components/session/sessionTypes";
import { SessionFinishView } from "./SessionFinishView";

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
    needsMoreRest: false,
    user: {
      id: userId,
      name,
      avatarUrl,
      elo: 1000,
    },
  };
}

const players = [
  createPlayer({
    userId: "u1",
    name: "Aiman Rahman",
    avatarUrl: "https://cdn.test/aiman.jpg",
    sessionPoints: 84,
  }),
  createPlayer({ userId: "u2", name: "Siti Noor", sessionPoints: 80 }),
  createPlayer({ userId: "u3", name: "Farah Lim", sessionPoints: 76 }),
  createPlayer({ userId: "u4", name: "Amir Guest", isGuest: true, sessionPoints: 72 }),
];

const pointDiffByUserId = new Map([
  ["u1", 31],
  ["u2", 18],
  ["u3", -2],
  ["u4", -8],
]);

const playerStatsByUserId = new Map([
  ["u1", { played: 8, wins: 7, losses: 1 }],
  ["u2", { played: 8, wins: 6, losses: 2 }],
  ["u3", { played: 8, wins: 5, losses: 3 }],
  ["u4", { played: 8, wins: 4, losses: 4 }],
]);

function renderFinishView({
  sessionType = SessionType.POINTS,
  players: playersToRender = players,
  onShareResults,
  sharingResults,
}: {
  sessionType?: string;
  players?: Player[];
  onShareResults?: () => void;
  sharingResults?: boolean;
} = {}) {
  return renderToStaticMarkup(
    <SessionFinishView
      sessionName="Thursday Social"
      sessionType={sessionType}
      players={playersToRender}
      pointDiffByUserId={pointDiffByUserId}
      playerStatsByUserId={playerStatsByUserId}
      onShareResults={onShareResults}
      sharingResults={sharingResults}
    />
  );
}

describe("SessionFinishView", () => {
  it("renders ranked podium photos, scores, point differences, and the full standings", () => {
    const markup = renderFinishView();

    expect(markup).toContain("Session complete");
    expect(markup).toContain("Thursday Social");
    expect(markup).toContain('aria-label="Top finishers"');
    expect(markup).toContain("1st place: Aiman Rahman");
    expect(markup).toContain("2nd place: Siti Noor");
    expect(markup).toContain("3rd place: Farah Lim");
    expect(markup).toContain('src="https://cdn.test/aiman.jpg"');
    expect(markup).toContain(">84<");
    expect(markup).toContain("+31 diff");
    expect(markup).toContain("4 players");
    expect(markup).toContain("Guest · 4W / 4L");
    expect(markup).toContain("8 MP");
  });

  it("shows ladder records and keeps share controls permission-gated by the caller", () => {
    const markup = renderFinishView({
      sessionType: SessionType.LADDER,
      players: [players[0]],
      onShareResults: () => undefined,
      sharingResults: true,
    });

    expect(markup).toContain(">7-1<");
    expect(markup).toContain(">Record<");
    expect(markup).toContain("Preparing image…");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-label="Replay winner celebration"');
    expect(renderFinishView()).not.toContain("Share standings");
  });

  it("renders the optional interclub slot and an empty-result state", () => {
    const withScoreboard = renderToStaticMarkup(
      <SessionFinishView
        sessionName="Club night"
        sessionType={SessionType.POINTS}
        players={players}
        pointDiffByUserId={pointDiffByUserId}
        playerStatsByUserId={playerStatsByUserId}
      >
        <aside>Club A 3–2 Club B</aside>
      </SessionFinishView>
    );
    expect(withScoreboard).toContain("Club A 3–2 Club B");

    const emptyMarkup = renderFinishView({ players: [] });
    expect(emptyMarkup).toContain("No final results have been recorded.");
    expect(emptyMarkup).not.toContain("Top finishers");
  });
});
