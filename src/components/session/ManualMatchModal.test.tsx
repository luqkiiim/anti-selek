import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type {
  ManualMatchFormState,
  Player,
} from "./sessionTypes";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import { ManualMatchModal } from "./ManualMatchModal";

vi.mock("@/components/ui/chrome", () => ({
  ModalFrame: ({
    title,
    subtitle,
    children,
    footer,
  }: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      <div>{children}</div>
      <div>{footer}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/Avatar", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name.slice(0, 1)}</span>,
}));

function createPlayer(userId: string, name: string, pool = SessionPool.A): Player {
  return {
    userId,
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    pool,
    user: {
      id: userId,
      name,
      elo: 1000,
    },
  };
}

function renderModal({
  manualMatchForm,
  players,
}: {
  manualMatchForm: ManualMatchFormState;
  players: Player[];
}) {
  return renderToStaticMarkup(
    <ManualMatchModal
      open
      court={null}
      manualMatchForm={manualMatchForm}
      manualMatchPlayerOptions={players}
      selectedManualPlayerIds={
        new Set(Object.values(manualMatchForm).filter((value) => value.length > 0))
      }
      creatingManualMatch={false}
      poolsEnabled={false}
      onClose={vi.fn()}
      onTogglePlayer={vi.fn()}
      onCreateMatch={vi.fn()}
    />
  );
}

describe("ManualMatchModal", () => {
  it("renders a sticky compact summary instead of the old tall team cards", () => {
    const markup = renderModal({
      manualMatchForm: {
        team1User1Id: "u1",
        team1User2Id: "u2",
        team2User1Id: "",
        team2User2Id: "",
      },
      players: [
        createPlayer("u1", "Alice"),
        createPlayer("u2", "Bianca"),
        createPlayer("u3", "Cara"),
        createPlayer("u4", "Dinesh"),
      ],
    });

    expect(markup).toContain("Tap 4 players");
    expect(markup).toContain("Picks 1-2 form Team 1. Picks 3-4 form Team 2. Tap again to remove.");
    expect(markup).toContain("sticky top-0");
    expect(markup).toContain("T1");
    expect(markup).toContain("Alice + Bianca");
    expect(markup).toContain("T2");
    expect(markup).toContain("Pick 3 + 4");
    expect(markup).not.toContain("Tap player 1");
    expect(markup).not.toContain("<select");
  });

  it("keeps detailed player rows, shows both team pills, and blocks a fifth add until someone is removed", () => {
    const markup = renderModal({
      manualMatchForm: {
        team1User1Id: "u1",
        team1User2Id: "u2",
        team2User1Id: "u3",
        team2User2Id: "u4",
      },
      players: [
        createPlayer("u1", "Alice"),
        createPlayer("u2", "Bianca"),
        createPlayer("u3", "Cara"),
        createPlayer("u4", "Dinesh"),
        createPlayer("u5", "Evan"),
      ],
    });

    expect(markup).toContain("4/4 selected");
    expect(markup).toContain("Alice + Bianca");
    expect(markup).toContain("Cara + Dinesh");
    expect(markup).toContain("Rating 1000");
    expect(markup).toContain("Remove one to change the lineup.");
    expect(markup).toContain("Team 1 - 1");
    expect(markup).toContain("Team 1 - 2");
    expect(markup).toContain("Team 2 - 1");
    expect(markup).toContain("Team 2 - 2");
    expect(markup.match(/disabled=""/g)?.length ?? 0).toBe(1);
  });
});
