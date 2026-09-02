import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SessionSettingsModal } from "./SessionSettingsModal";
import {
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionCrossoverFrequency,
  SessionMatchmakingStyle,
  SessionPairingMode,
} from "@/types/enums";

vi.mock("@/components/ui/chrome", () => ({
  ModalFrame: ({
    title,
    children,
    footer,
  }: {
    title: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <section>
      <h1>{title}</h1>
      {children}
      {footer}
    </section>
  ),
}));

describe("SessionSettingsModal", () => {
  it("exposes named switches and tournament terminology", () => {
    const markup = renderToStaticMarkup(
      <SessionSettingsModal
        open
        courts={[
          { id: "court-1", courtNumber: 1, currentMatch: null },
        ]}
        isTestSession
        autoQueueEnabled={false}
        autoQueueDraft
        respectPlayerRest={false}
        respectPlayerRestDraft={false}
        canEditGameplay
        collabFormat={SessionCollabFormat.FREE_PLAY}
        matchmakingStyleDraft={SessionMatchmakingStyle.BALANCED}
        balanceMetricDraft={SessionBalanceMetric.SESSION_POINTS}
        pairingModeDraft={SessionPairingMode.OPEN}
        poolsEnabledDraft={false}
        crossoverFrequencyDraft={SessionCrossoverFrequency.BALANCED}
        courtCountDraft={1}
        canOpenRoster
        canEndSession
        canResetSession
        canCreateRealSession
        canDeleteSession
        courtLabelDrafts={{ 1: "" }}
        hasGameplayChanges
        hasAutoQueueChange
        hasRespectPlayerRestChange={false}
        hasCourtLabelChanges={false}
        hasSettingsChanges
        savingSettings={false}
        onClose={vi.fn()}
        onOpenRoster={vi.fn()}
        onEndSession={vi.fn()}
        onResetSession={vi.fn()}
        onCreateRealSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onAutoQueueChange={vi.fn()}
        onRespectPlayerRestChange={vi.fn()}
        onMatchmakingStyleChange={vi.fn()}
        onBalanceMetricChange={vi.fn()}
        onPairingModeChange={vi.fn()}
        onPoolsEnabledChange={vi.fn()}
        onCrossoverFrequencyChange={vi.fn()}
        onCourtCountChange={vi.fn()}
        onCourtLabelChange={vi.fn()}
        onSaveSettings={vi.fn()}
      />
    );

    expect(markup).toContain("Tournament settings");
    expect(markup).toContain("End Tournament");
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-label="Auto queue"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-label="Respect player rest"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Gameplay setup");
    expect(markup).toContain("Gameplay changes will apply when you save.");
    expect(markup).toContain("Matchmaking style");
  });

  it("offers reset and cancellation controls for a real tournament", () => {
    const markup = renderToStaticMarkup(
      <SessionSettingsModal
        open
        courts={[]}
        isTestSession={false}
        autoQueueEnabled
        autoQueueDraft
        respectPlayerRest
        respectPlayerRestDraft
        canEditGameplay={false}
        collabFormat={SessionCollabFormat.FREE_PLAY}
        matchmakingStyleDraft={SessionMatchmakingStyle.BALANCED}
        balanceMetricDraft={SessionBalanceMetric.SESSION_POINTS}
        pairingModeDraft={SessionPairingMode.OPEN}
        poolsEnabledDraft={false}
        crossoverFrequencyDraft={SessionCrossoverFrequency.BALANCED}
        courtCountDraft={0}
        canOpenRoster
        canEndSession
        canResetSession
        canCreateRealSession={false}
        canDeleteSession
        courtLabelDrafts={{}}
        hasGameplayChanges={false}
        hasAutoQueueChange={false}
        hasRespectPlayerRestChange={false}
        hasCourtLabelChanges={false}
        hasSettingsChanges={false}
        savingSettings={false}
        onClose={vi.fn()}
        onOpenRoster={vi.fn()}
        onEndSession={vi.fn()}
        onResetSession={vi.fn()}
        onCreateRealSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onAutoQueueChange={vi.fn()}
        onRespectPlayerRestChange={vi.fn()}
        onMatchmakingStyleChange={vi.fn()}
        onBalanceMetricChange={vi.fn()}
        onPairingModeChange={vi.fn()}
        onPoolsEnabledChange={vi.fn()}
        onCrossoverFrequencyChange={vi.fn()}
        onCourtCountChange={vi.fn()}
        onCourtLabelChange={vi.fn()}
        onSaveSettings={vi.fn()}
      />
    );

    expect(markup).toContain("Reset Tournament");
    expect(markup).toContain("Cancel &amp; Delete Tournament");
    expect(markup).toContain(
      "Reset the tournament to change these gameplay settings."
    );
    expect(markup).not.toContain("Gameplay changes will apply when you save.");
  });
});
