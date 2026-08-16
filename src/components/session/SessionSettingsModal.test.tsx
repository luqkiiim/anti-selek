import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SessionSettingsModal } from "./SessionSettingsModal";

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
        canOpenRoster
        canEndSession
        canResetTestSession
        canCreateRealSession
        canDeleteTestSession
        courtLabelDrafts={{ "court-1": "" }}
        hasAutoQueueChange
        hasRespectPlayerRestChange={false}
        hasCourtLabelChanges={false}
        hasSettingsChanges
        savingSettings={false}
        onClose={vi.fn()}
        onOpenRoster={vi.fn()}
        onEndSession={vi.fn()}
        onResetTestSession={vi.fn()}
        onCreateRealSession={vi.fn()}
        onDeleteTestSession={vi.fn()}
        onAutoQueueChange={vi.fn()}
        onRespectPlayerRestChange={vi.fn()}
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
  });
});
