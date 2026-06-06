import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionOverviewPanel } from "./SessionOverviewPanel";
import { SessionStatus } from "@/types/enums";

function renderOverviewPanel({
  sessionStatus = SessionStatus.ACTIVE,
}: {
  sessionStatus?: SessionStatus;
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
      canStartSession={false}
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
  });
});
