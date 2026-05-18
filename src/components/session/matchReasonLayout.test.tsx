import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchStatus, SessionMode, SessionType } from "@/types/enums";
import type { MatchmakingReason } from "@/lib/matchmaking/matchReason";
import type { Match, MatchScores, QueuedMatch } from "./sessionTypes";
import { LiveMatchCard } from "./LiveMatchCard";
import { QueuedMatchCard } from "./QueuedMatchCard";

const matchReason: MatchmakingReason = {
  version: 1,
  source: "v3",
  sessionType: SessionType.POINTS,
  sessionMode: SessionMode.MEXICANO,
  selectedUserIds: ["u1", "u2", "u3", "u4"],
  team1UserIds: ["u1", "u2"],
  team2UserIds: ["u3", "u4"],
  summary: ["Test reason"],
  metrics: {
    fairnessBand: 0,
    selectedMatchCounts: [0, 0, 0, 0],
    balanceGap: 0,
    partnerRepeatPenalty: 0,
    opponentRepeatPenalty: 0,
    exactRematchPenalty: 0,
    waitRangeSeconds: 0,
    minimumWaitSeconds: 0,
    totalWaitSeconds: 0,
    mixedMode: false,
  },
};

function createLiveMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    status: MatchStatus.IN_PROGRESS,
    team1User1: { id: "u1", name: "Alice" },
    team1User2: { id: "u2", name: "Bianca" },
    team2User1: { id: "u3", name: "Charlie" },
    team2User2: { id: "u4", name: "Dinesh" },
    ...overrides,
  };
}

function createQueuedMatch(overrides: Partial<QueuedMatch> = {}): QueuedMatch {
  return {
    id: "queue-1",
    team1User1: { id: "u1", name: "Alice" },
    team1User2: { id: "u2", name: "Bianca" },
    team2User1: { id: "u3", name: "Charlie" },
    team2User2: { id: "u4", name: "Dinesh" },
    ...overrides,
  };
}

function renderLiveCard(match: Match, matchScores: MatchScores = {}) {
  return renderToStaticMarkup(
    <LiveMatchCard
      match={match}
      currentUserId="admin-user"
      isAdmin={true}
      isClaimedUser={true}
      confirmingScoreMatchId={null}
      reshufflingCourtPlayerId={null}
      replacingCourtPlayerId={null}
      reopeningMatchId={null}
      submittingMatchId={null}
      matchScores={matchScores}
      onReshuffleWithoutPlayer={vi.fn()}
      onReplacePlayer={vi.fn()}
      onHandleScoreChange={vi.fn()}
      onRequestScoreSubmitConfirmation={vi.fn()}
      onCancelScoreSubmitConfirmation={vi.fn()}
      onSubmitScore={vi.fn()}
      onApproveScore={vi.fn()}
      onReopenScoreForEdit={vi.fn()}
    />
  );
}

function renderQueuedCard(queuedMatch: QueuedMatch | null) {
  return renderToStaticMarkup(
    <QueuedMatchCard
      queuedMatch={queuedMatch}
      canReshuffleQueuedPlayers={true}
      canViewMatchReason={true}
      canOpenManualQueue={true}
      clearingQueuedMatch={false}
      creatingQueuedMatch={false}
      creatingManualQueuedMatch={false}
      reshufflingQueuedPlayerId={null}
      replacingQueuedPlayerId={null}
      reshufflingQueuedMatch={false}
      onClearQueuedMatch={vi.fn()}
      onOpenManualQueuedMatchModal={vi.fn()}
      onReshuffleQueuedMatch={vi.fn()}
      onReshuffleQueuedPlayer={vi.fn()}
      onReplaceQueuedPlayer={vi.fn()}
    />
  );
}

describe("match reason layout", () => {
  it("uses balanced live match rails when reasoning is available", () => {
    const markup = renderLiveCard(
      createLiveMatch({ matchmakingReason: matchReason })
    );

    expect(markup).toContain('data-live-match-reason-layout="balanced-rails"');
    expect(markup).toContain('data-live-match-reason-spacer="true"');
    expect(markup).toContain('data-live-match-reason-rail="true"');
    expect(markup).toContain('aria-label="Show match reasoning"');
    expect(markup).not.toContain("pr-10 md:pr-11");
  });

  it("omits live match rails when no reasoning is available", () => {
    const markup = renderLiveCard(createLiveMatch({ matchmakingReason: null }));

    expect(markup).not.toContain("data-live-match-reason-layout");
    expect(markup).not.toContain("data-live-match-reason-spacer");
    expect(markup).not.toContain("data-live-match-reason-rail");
    expect(markup).not.toContain('aria-label="Show match reasoning"');
  });

  it("uses a queued right rail when reasoning is available", () => {
    const markup = renderQueuedCard(
      createQueuedMatch({ matchmakingReason: matchReason })
    );

    expect(markup).toContain('data-queued-match-reason-layout="right-rail"');
    expect(markup).toContain('data-queued-match-reason-rail="true"');
    expect(markup).toContain('aria-label="Show match reasoning"');
    expect(markup).not.toContain("pr-10 md:pr-11");
  });

  it("omits queued rails when no reasoning is available", () => {
    const markup = renderQueuedCard(
      createQueuedMatch({ matchmakingReason: null })
    );

    expect(markup).not.toContain("data-queued-match-reason-layout");
    expect(markup).not.toContain("data-queued-match-reason-rail");
    expect(markup).not.toContain('aria-label="Show match reasoning"');
  });
});
