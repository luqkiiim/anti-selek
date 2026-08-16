import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PastTournamentsPanel } from "./PastTournamentsPanel";
import type { ClubPageSession } from "./clubTypes";

const tournament: ClubPageSession = {
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
  canManageClub,
}: {
  canManageClub: boolean;
}) {
  return renderToStaticMarkup(
    <PastTournamentsPanel
      tournaments={[tournament]}
      canManageClub={canManageClub}
      latestPastTournamentId={tournament.id}
      rollingBackTournamentCode={null}
      onOpenTournament={vi.fn()}
      onRollbackTournament={vi.fn()}
    />
  );
}

describe("PastTournamentsPanel", () => {
  it("shows rollback for admins when rollback is enabled", () => {
    const markup = renderPanel({ canManageClub: true });

    expect(markup).toContain("Rollback");
    expect(markup).toContain(">Completed<");
    expect(markup).not.toContain(">COMPLETED<");
    expect(markup).not.toContain('role="link"');
  });

  it("hides rollback when management is disabled for tutorial history", () => {
    expect(renderPanel({ canManageClub: false })).not.toContain(
      "Rollback"
    );
  });
});
