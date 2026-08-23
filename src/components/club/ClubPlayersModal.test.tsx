// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
  SessionCollabFormat,
  SessionPool,
} from "@/types/enums";
import type { ClubPageMember } from "./clubTypes";
import { ClubPlayersModal } from "./ClubPlayersModal";

vi.mock("@/components/ui/PlayerPickerSheet", () => ({
  PlayerPickerSheet: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

const player: ClubPageMember = {
  id: "player-1",
  name: "Alex Lee",
  status: ClubPlayerStatus.CORE,
  needsMoreRest: false,
  preferredPool: SessionPool.B,
  gender: PlayerGender.MALE,
  partnerPreference: PartnerPreference.OPEN,
  elo: 1000,
  wins: 0,
  losses: 0,
  isClaimed: true,
  role: "MEMBER",
};

function renderModal({
  canSavePreferredPools,
  onSavePlayerPreferredPool = vi.fn(async () => undefined),
  modalPlayer = player,
  selectedPartnerClub = null,
}: {
  canSavePreferredPools: boolean;
  onSavePlayerPreferredPool?: (
    playerId: string,
    pool: SessionPool
  ) => Promise<void>;
  modalPlayer?: ClubPageMember;
  selectedPartnerClub?: { id: string; name: string; membersCount: number } | null;
}) {
  return (
    <ClubPlayersModal
      open
      selectedPlayerIds={[]}
      selectedPlayerPools={{}}
      playerSearch=""
      poolsEnabled={false}
      canSavePreferredPools={canSavePreferredPools}
      savingPreferredPoolPlayerId={null}
      selectablePlayers={[modalPlayer]}
      filteredSelectablePlayers={[modalPlayer]}
      onPlayerSearchChange={vi.fn()}
      onToggleAllPlayers={vi.fn()}
      onTogglePlayerSelection={vi.fn()}
      onChangePlayerPool={vi.fn()}
      onSavePlayerPreferredPool={onSavePlayerPreferredPool}
      collabFormat={SessionCollabFormat.FREE_PLAY}
      hostClubId="club-1"
      hostClubName="Club One"
      selectedPartnerClub={selectedPartnerClub}
      selectedPlayerRepresentingClubs={{}}
      onChangePlayerRepresentingClub={vi.fn()}
      onClose={vi.fn()}
    />
  );
}

describe("ClubPlayersModal saved group preference", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("lets club operators update only the saved game-group preference", async () => {
    const onSavePlayerPreferredPool = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        renderModal({
          canSavePreferredPools: true,
          onSavePlayerPreferredPool,
        })
      );
    });

    expect(container.textContent).toContain("Saved club preference");
    expect(container.textContent).toContain("future tournaments");
    expect(container.textContent).not.toContain("Roster status");
    expect(container.textContent).not.toContain("Club role");

    const competitiveButton = Array.from(
      container.querySelectorAll("button")
    ).find((button) => button.textContent === "Competitive");
    await act(async () => {
      competitiveButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    expect(onSavePlayerPreferredPool).toHaveBeenCalledWith(
      "player-1",
      SessionPool.A
    );
  });

  it("keeps the saved-preference controls hidden without operator access", async () => {
    await act(async () => {
      root.render(renderModal({ canSavePreferredPools: false }));
    });

    expect(container.textContent).not.toContain("Saved club preference");
  });

  it("does not offer a host-club preference edit for a partner-only player", async () => {
    await act(async () => {
      root.render(
        renderModal({
          canSavePreferredPools: true,
          modalPlayer: {
            ...player,
            communityBadges: [
              { id: "club-2", name: "Club Two", userId: player.id, elo: 1000 },
            ],
          },
          selectedPartnerClub: {
            id: "club-2",
            name: "Club Two",
            membersCount: 1,
          },
        })
      );
    });

    expect(container.textContent).not.toContain("Saved club preference");
  });
});
