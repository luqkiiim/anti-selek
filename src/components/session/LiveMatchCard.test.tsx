import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MatchStatus } from "@/types/enums";
import type { Match, MatchScores } from "./sessionTypes";
import { LiveMatchCard } from "./LiveMatchCard";

function createMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    status: MatchStatus.IN_PROGRESS,
    team1User1: { id: "quick-1", name: "Quick Player" },
    team1User2: { id: "player-2", name: "Player Two" },
    team2User1: { id: "player-3", name: "Player Three" },
    team2User2: { id: "player-4", name: "Player Four" },
    ...overrides,
  };
}

function renderCard({
  match = createMatch(),
  currentUserId = "quick-1",
  canSubmitScores,
  isAdmin = false,
  isClaimedUser = false,
  matchScores = {},
}: {
  match?: Match;
  currentUserId?: string;
  canSubmitScores: boolean;
  isAdmin?: boolean;
  isClaimedUser?: boolean;
  matchScores?: MatchScores;
}) {
  return renderToStaticMarkup(
    <LiveMatchCard
      match={match}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      isClaimedUser={isClaimedUser}
      canSubmitScores={canSubmitScores}
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

describe("LiveMatchCard", () => {
  it("keeps quick-access participants read-only in active matches", () => {
    const markup = renderCard({ canSubmitScores: false });

    expect(markup).not.toContain("data-live-score-input");
    expect(markup).not.toContain("Submit Score");
  });

  it("keeps full-account participants able to submit active scores", () => {
    const markup = renderCard({
      canSubmitScores: true,
      isClaimedUser: true,
      matchScores: { "match-1": { team1: "21", team2: "18" } },
    });

    expect(markup).toContain("data-live-score-input");
    expect(markup).toContain("Submit Score");
  });

  it("keeps quick-access viewers from confirming pending scores", () => {
    const markup = renderCard({
      canSubmitScores: false,
      match: createMatch({
        status: MatchStatus.PENDING_APPROVAL,
        scoreSubmittedByUserId: "player-3",
        team1Score: 21,
        team2Score: 18,
      }),
    });

    expect(markup).toContain("Awaiting Confirmation");
    expect(markup).not.toContain("Confirm Results");
  });
});
