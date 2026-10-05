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
  currentAccountId = "",
  currentUserId = "quick-1",
  canSubmitScores,
  isAdmin = false,
  isClaimedUser = false,
  matchScores = {},
}: {
  match?: Match;
  currentAccountId?: string;
  currentUserId?: string;
  canSubmitScores: boolean;
  isAdmin?: boolean;
  isClaimedUser?: boolean;
  matchScores?: MatchScores;
}) {
  return renderToStaticMarkup(
    <LiveMatchCard
      match={match}
      currentAccountId={currentAccountId}
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
    expect(markup).not.toContain("Review result");
  });

  it("keeps full-account participants able to submit active scores", () => {
    const markup = renderCard({
      canSubmitScores: true,
      isClaimedUser: true,
      matchScores: { "match-1": { team1: "21", team2: "18" } },
    });

    expect(markup).toContain("data-live-score-input");
    expect(markup).toContain("Review result");
    expect(markup).toContain(
      'aria-label="Team 1 score, Quick Player and Player Two"'
    );
    expect(markup).toContain('name="match-1-team1-score"');
    expect(markup).toContain(
      'aria-label="Team 2 score, Player Three and Player Four"'
    );
    expect(markup).toContain('name="match-1-team2-score"');
    expect(markup).toContain("line-clamp-2");
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

    expect(markup).toContain("Waiting for opponent or admin approval");
    expect(markup).not.toContain("Approve score");
  });

  it("uses Account and Player identities separately for score approval", () => {
    const match = createMatch({
      status: MatchStatus.PENDING_APPROVAL,
      scoreSubmittedByUserId: "account-submitter",
      scoreSubmittedByPlayerId: "player-submitter",
      team1User1: { id: "player-submitter", name: "Submitting player" },
      team1User2: { id: "player-one", name: "Player One" },
      team2User1: { id: "player-viewer", name: "Reviewing player" },
      team2User2: { id: "player-two", name: "Player Two" },
      team1Score: 21,
      team2Score: 18,
    });

    const markup = renderCard({
      match,
      currentAccountId: "account-viewer",
      currentUserId: "player-viewer",
      canSubmitScores: true,
      isClaimedUser: true,
    });

    expect(markup).toContain("Approve score");
  });
});
