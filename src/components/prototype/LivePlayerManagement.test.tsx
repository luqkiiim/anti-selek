// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PartnerPreference, PlayerGender, SessionCollabFormat, SessionCrossoverFrequency, SessionMode, SessionPool } from "@/types/enums";
import type { SessionData } from "@/components/session/sessionTypes";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("./api", () => ({ api: mocks.api }));
vi.mock("./Primitives", () => ({
  Avatar: ({ name }: { name: string }) => <span role="img" aria-label={name}>{name.slice(0, 1)}</span>,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open, title, children }: { open?: boolean; title: string; children: React.ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

import { LivePlayerManagement } from "./LivePlayerManagement";

function sessionFixture(): SessionData {
  return {
    id: "session-1",
    code: "LIVE01",
    clubId: "club-1",
    name: "Tuesday session",
    type: "OPEN",
    mode: SessionMode.MEXICANO,
    status: "ACTIVE",
    isTest: false,
    autoQueueEnabled: false,
    respectPlayerRest: true,
    poolsEnabled: true,
    poolAName: "Competitive",
    poolBName: "Social",
    poolACourtAssignments: 0,
    poolBCourtAssignments: 0,
    poolAMissedTurns: 0,
    poolBMissedTurns: 0,
    crossoverMissThreshold: 1,
    crossoverFrequency: SessionCrossoverFrequency.BALANCED,
    viewerCanManage: true,
    viewerIsQuickAccess: false,
    courts: [],
    players: [{
      userId: "player-1",
      sessionPoints: 0,
      isPaused: false,
      isGuest: false,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      pool: SessionPool.A,
      needsMoreRest: false,
      user: { id: "player-1", name: "Ari Player", elo: 1000 },
    }],
  };
}

describe("LivePlayerManagement", () => {
  let container: HTMLDivElement;
  let root: Root;
  let changed: () => Promise<void>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.api.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    changed = vi.fn(async () => undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(session = sessionFixture()) {
    await act(async () => root.render(
      <LivePlayerManagement
        code="LIVE01"
        session={session}
        open
        onClose={vi.fn()}
        onChanged={() => changed()}
      />,
    ));
  }

  it("shows only exceptional player states and keeps skip status compact", async () => {
    const session = sessionFixture();
    session.players.push(
      {
        ...session.players[0],
        userId: "player-2",
        isPaused: true,
        user: { id: "player-2", name: "Bea Paused", elo: 1100 },
      },
      {
        ...session.players[0],
        userId: "player-3",
        skipNextMatchAt: "2026-09-23T00:00:00.000Z",
        user: { id: "player-3", name: "Cal Skipping", elo: 1200 },
      },
    );

    await render(session);

    const rows = [...container.querySelectorAll(".pm-player-card")];
    const activeRow = rows.find((row) => row.textContent?.includes("Ari Player"));
    const pausedRow = rows.find((row) => row.textContent?.includes("Bea Paused"));
    const skippingRow = rows.find((row) => row.textContent?.includes("Cal Skipping"));

    expect(container.textContent).not.toContain("In rotation");
    expect(container.textContent).toContain("1 taking a break");
    expect(activeRow?.textContent).not.toContain("Paused");
    expect(pausedRow?.textContent).toContain("Paused");
    expect(skippingRow?.textContent).toContain("Skipping next");
    expect(rows.every((row) => !row.textContent?.includes("Skip next match"))).toBe(true);
    expect(container.querySelector('[aria-label="Options for Ari Player"]')).not.toBeNull();
  });

  it("keeps skip-next actions inside player options", async () => {
    mocks.api.mockResolvedValue({});
    const session = sessionFixture();
    await render(session);
    expect(container.textContent).not.toContain("0 taking a break");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Options for Ari Player"]')?.click();
    });

    const skipButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Skip next match"));
    expect(skipButton?.className).toContain("pm-secondary");
    expect(skipButton?.className).toContain("pm-full");

    await act(async () => skipButton?.click());

    expect(mocks.api).toHaveBeenCalledWith(
      "/api/sessions/LIVE01/players/player-1/skip-next",
      "PATCH",
      { skipNextMatch: true },
    );
    expect(changed).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-label="Options for Ari Player"]')).toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Ari Player"]')).not.toBeNull();

    session.players[0].skipNextMatchAt = "2026-09-23T00:00:00.000Z";
    await render(session);
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Cancel skip"))).toBe(true);
    expect(container.querySelector('[role="dialog"][aria-label="Ari Player"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>(".pm-back")?.click());
    expect(container.textContent).toContain("Skipping next");
  });

  it("offers Cancel skip inside options for a player with a scheduled skip", async () => {
    mocks.api.mockResolvedValue({});
    const session = sessionFixture();
    session.players[0].isPaused = true;
    session.players[0].skipNextMatchAt = "2026-09-23T00:00:00.000Z";
    await render(session);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Options for Ari Player"]')?.click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Cancel skip"))?.click();
    });

    expect(mocks.api).toHaveBeenCalledWith(
      "/api/sessions/LIVE01/players/player-1/skip-next",
      "PATCH",
      { skipNextMatch: false },
    );
    expect(changed).toHaveBeenCalledOnce();
  });

  it("saves partner preferences through the preference endpoint", async () => {
    mocks.api.mockResolvedValue({});
    const session = sessionFixture();
    session.mode = SessionMode.MIXICANO;

    await act(async () => root.render(
      <LivePlayerManagement
        code="LIVE01"
        session={session}
        open
        onClose={vi.fn()}
        onChanged={() => changed()}
      />,
    ));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Options for Ari Player"]')?.click();
    });

    const partnerPreference = container.querySelectorAll("select")[0];
    await act(async () => {
      partnerPreference.value = PartnerPreference.FEMALE_FLEX;
      partnerPreference.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(mocks.api).toHaveBeenLastCalledWith(
      "/api/sessions/LIVE01/players/player-1/preferences",
      "PATCH",
      { mixedSideOverride: null, partnerPreference: PartnerPreference.FEMALE_FLEX },
    );
    expect(changed).toHaveBeenCalledOnce();
  });

  it("loads club members and adds one with their selected session pool", async () => {
    mocks.api.mockImplementation(async (url: string, method?: string) => {
      if (url.endsWith("/members")) {
        return [{
          id: "member-2",
          name: "Bea Member",
          preferredPool: SessionPool.B,
          gender: PlayerGender.FEMALE,
          representingClubId: "club-1",
          representingClubName: "Club One",
          elo: 1100,
        }];
      }
      return { url, method };
    });
    const session = sessionFixture();
    session.poolsEnabled = false;
    await render(session);

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Add club members"))?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Bea Member");
    expect(mocks.api).toHaveBeenCalledWith("/api/clubs/club-1/members");

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Add to session"))?.click();
    });

    expect(mocks.api).toHaveBeenLastCalledWith(
      "/api/sessions/LIVE01/join",
      "POST",
      { userId: "member-2", pool: SessionPool.A },
    );
    expect(changed).toHaveBeenCalledOnce();
  });

  it("uses the session roster and club side for accepted interclub sessions", async () => {
    mocks.api.mockImplementation(async (url: string) => {
      if (url.endsWith("/roster")) {
        return [{
          id: "member-2",
          name: "Bea Member",
          preferredPool: SessionPool.B,
          gender: PlayerGender.FEMALE,
          representingClubId: "club-2",
          representingClubName: "Club Two",
          elo: 1100,
        }];
      }
      return {};
    });
    const session = sessionFixture();
    session.collabFormat = SessionCollabFormat.INTERCLUB;
    session.clubs = [
      { id: "club-1", name: "Club One", role: "HOST", status: "ACCEPTED" },
      { id: "club-2", name: "Club Two", role: "PARTNER", status: "ACCEPTED" },
    ];
    await render(session);

    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Add club members"))?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Add to session"))?.click();
    });

    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/LIVE01/roster");
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/api/sessions/LIVE01/join",
      "POST",
      { userId: "member-2", pool: SessionPool.B, representingClubId: "club-2" },
    );
  });
});
