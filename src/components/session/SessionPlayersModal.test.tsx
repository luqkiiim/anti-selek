import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import type { Player } from "./sessionTypes";
import { SessionPlayersModal } from "./SessionPlayersModal";

vi.mock("@/components/ui/PlayerPickerSheet", () => ({
  PlayerPickerSheet: ({
    title,
    toolbar,
    children,
    footer,
  }: {
    title: string;
    toolbar?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <section>
      <h1>{title}</h1>
      <div>{toolbar}</div>
      <div>{children}</div>
      <div>{footer}</div>
    </section>
  ),
}));

vi.mock("@/components/ui/SearchField", () => ({
  SearchField: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} readOnly />
  ),
}));

vi.mock("@/components/ui/Avatar", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name.slice(0, 1)}</span>,
}));

function createPlayer(
  userId: string,
  name: string,
  options: Partial<Player> = {}
): Player {
  return {
    userId,
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    pool: SessionPool.A,
    needsMoreRest: false,
    user: {
      id: userId,
      name,
      elo: 1000,
    },
    ...options,
  };
}

describe("SessionPlayersModal", () => {
  it("shows skip-next state and self-service cancel action", () => {
    const markup = renderToStaticMarkup(
      <SessionPlayersModal
        open
        players={[
          createPlayer("me", "Me Player", {
            skipNextMatchAt: "2026-07-08T00:00:00.000Z",
          }),
        ]}
        currentUserId="me"
        canEditPreferences
        canManagePlayers={false}
        poolsEnabled={false}
        togglingPausePlayerId={null}
        skippingNextPlayerId={null}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onToggleSkipNext={vi.fn()}
        onOpenPreferenceEditor={vi.fn()}
      />
    );

    expect(markup).toContain("Skipping next");
    expect(markup).toContain("Cancel skip");
  });

  it("keeps manager skip behind the player actions popover", () => {
    const markup = renderToStaticMarkup(
      <SessionPlayersModal
        open
        players={[createPlayer("other", "Other Player")]}
        currentUserId="me"
        canEditPreferences
        canManagePlayers
        poolsEnabled={false}
        togglingPausePlayerId={null}
        skippingNextPlayerId={null}
        onClose={vi.fn()}
        onTogglePause={vi.fn()}
        onToggleSkipNext={vi.fn()}
        onOpenPreferenceEditor={vi.fn()}
      />
    );

    expect(markup).toContain(">Edit<");
    expect(markup).not.toContain("Skip next");
  });
});
