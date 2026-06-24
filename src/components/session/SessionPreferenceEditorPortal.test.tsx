// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import type { Player } from "./sessionTypes";
import { SessionPreferenceEditorPortal } from "./SessionPreferenceEditorPortal";

function createPlayer(overrides: Partial<Player> = {}): Player {
  return {
    userId: "player-1",
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    mixedSideOverride: null,
    pool: SessionPool.A,
    needsMoreRest: false,
    user: {
      id: "player-1",
      name: "Player One",
      elo: 1000,
    },
    ...overrides,
  };
}

describe("SessionPreferenceEditorPortal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("toggles more rest for the current session", async () => {
    const onClose = vi.fn();
    const onUpdatePreference = vi.fn(async () => {});
    const player = createPlayer();

    await act(async () => {
      root.render(
        <SessionPreferenceEditorPortal
          openPreferenceEditor={{ userId: player.userId, left: 10, top: 20 }}
          activePreferencePlayer={player}
          isAdmin
          isCompletedSession={false}
          isMixicano={false}
          poolsEnabled={false}
          renamingGuestId={null}
          removingPlayerId={null}
          onClose={onClose}
          onUpdatePreference={onUpdatePreference}
          onRequestRenameGuest={vi.fn()}
          onRemovePlayer={vi.fn()}
        />
      );
    });

    const checkbox = document.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox?.click();
    });

    expect(onClose).toHaveBeenCalled();
    expect(onUpdatePreference).toHaveBeenCalledWith(
      "player-1",
      PlayerGender.MALE,
      null,
      SessionPool.A,
      true
    );
  });
});
