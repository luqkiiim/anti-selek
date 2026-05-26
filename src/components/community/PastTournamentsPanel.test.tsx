import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PastTournamentsPanel } from "./PastTournamentsPanel";
import type { CommunityPageSession } from "./communityTypes";

const tournament: CommunityPageSession = {
  id: "session-1",
  code: "session-1",
  name: "Warm-up Cup",
  type: "POINTS",
  status: "COMPLETED",
  isTest: false,
  createdAt: "2026-05-20T00:00:00.000Z",
  endedAt: "2026-05-20T02:00:00.000Z",
  players: [],
};

function renderPanel({
  canManageCommunity,
}: {
  canManageCommunity: boolean;
}) {
  return renderToStaticMarkup(
    <PastTournamentsPanel
      tournaments={[tournament]}
      canManageCommunity={canManageCommunity}
      latestPastTournamentId={tournament.id}
      rollingBackTournamentCode={null}
      onOpenTournament={vi.fn()}
      onRollbackTournament={vi.fn()}
    />
  );
}

describe("PastTournamentsPanel", () => {
  it("shows rollback for admins when rollback is enabled", () => {
    expect(renderPanel({ canManageCommunity: true })).toContain("Rollback");
  });

  it("hides rollback when management is disabled for tutorial history", () => {
    expect(renderPanel({ canManageCommunity: false })).not.toContain(
      "Rollback"
    );
  });
});
