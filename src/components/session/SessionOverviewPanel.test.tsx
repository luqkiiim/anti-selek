import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionOverviewPanel } from "./SessionOverviewPanel";
import { SessionStatus } from "@/types/enums";

function renderOverviewPanel({
  sessionStatus = SessionStatus.ACTIVE,
  canStartSession = false,
  startBlockedReason = null,
}: {
  sessionStatus?: SessionStatus;
  canStartSession?: boolean;
  startBlockedReason?: string | null;
} = {}) {
  return renderToStaticMarkup(
    <SessionOverviewPanel
      sessionTypeLabel="Points"
      sessionModeLabel="Open"
      isTestSession={false}
      playersCount={10}
      guestPlayersCount={0}
      activeMatchesCount={2}
      completedMatchesCount={6}
      pausedPlayersCount={0}
      sessionStatus={sessionStatus}
      canStartSession={canStartSession}
      startBlockedReason={startBlockedReason}
      canOpenPlayerManager={true}
      canOpenSettings={true}
      onStartSession={vi.fn()}
      onOpenPlayerManager={vi.fn()}
      onOpenSettings={vi.fn()}
      onOpenMatchHistory={vi.fn()}
    />
  );
}

describe("SessionOverviewPanel", () => {
  it("keeps completed-session controls without the share action", () => {
    const markup = renderOverviewPanel({
      sessionStatus: SessionStatus.COMPLETED,
    });

    expect(markup).toContain("Match History");
    expect(markup).not.toContain(">Share<");
    expect(markup).not.toContain("Preparing...");
  });

  it("does not show share on active sessions", () => {
    const markup = renderOverviewPanel({
      sessionStatus: SessionStatus.ACTIVE,
    });

    expect(markup).not.toContain(">Share<");
    expect(markup).toContain("Live tournament");
    expect(markup).toContain(">Live<");
    expect(markup).not.toContain(">ACTIVE<");
  });

  it("keeps start visible but disabled when a player group is under minimum", () => {
    const reason =
      "Player groups need at least 2 active Competitive and 2 active Social players.";
    const markup = renderOverviewPanel({
      sessionStatus: SessionStatus.WAITING,
      canStartSession: true,
      startBlockedReason: reason,
    });

    expect(markup).toContain("Start Tournament");
    expect(markup).toContain("disabled");
    expect(markup).toContain(reason);
    expect(markup).toContain('aria-describedby="session-start-blocked-reason"');
  });
});
