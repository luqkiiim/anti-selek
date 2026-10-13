// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionJoinProfilePanel } from "./SessionJoinProfilePanel";
import type { EligibleSessionProfile } from "./sessionTypes";

const profiles: EligibleSessionProfile[] = [
  {
    playerId: "player-north",
    profileClubId: "club-north",
    clubName: "North Club",
    playerName: "Alex",
    ownerUserId: "account-1",
    elo: 1200,
    preferredPool: "A" as EligibleSessionProfile["preferredPool"],
  },
  {
    playerId: "player-south",
    profileClubId: "club-south",
    clubName: "South Club",
    playerName: "Alex S",
    ownerUserId: "account-1",
    elo: 1130,
    preferredPool: "B" as EligibleSessionProfile["preferredPool"],
  },
];

describe("SessionJoinProfilePanel", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let onJoined: ReturnType<typeof vi.fn<(profile: EligibleSessionProfile) => void>>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ players: [] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    onJoined = vi.fn<(profile: EligibleSessionProfile) => void>();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("requires an explicit profile pair when an account has several club profiles", async () => {
    await act(async () => {
      root.render(
        <SessionJoinProfilePanel
          code="ABC"
          sessionStatus="WAITING"
          eligibleProfiles={profiles}
          selectedSelf={null}
          isInterclub
          onJoined={onJoined}
        />
      );
    });

    const select = container.querySelector("select[aria-label='Play as']") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "Choose a club profile",
      "Alex · North Club",
      "Alex S · South Club",
    ]);
    const joinButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Join session"
    ) as HTMLButtonElement;
    expect(joinButton.disabled).toBe(true);

    await act(async () => {
      select.value = "player-south:club-south";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(joinButton.disabled).toBe(false);

    await act(async () => joinButton.click());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/ABC/join",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          playerId: "player-south",
          profileClubId: "club-south",
          representingClubId: "club-south",
        }),
      })
    );
    expect(onJoined).toHaveBeenCalledWith(profiles[1]);
  });

  it("auto-selects a single eligible pair and hides after joining or on a completed tournament", async () => {
    await act(async () => {
      root.render(
        <SessionJoinProfilePanel
          code="ABC"
          sessionStatus="WAITING"
          eligibleProfiles={[profiles[0]]}
          selectedSelf={null}
          isInterclub={false}
          onJoined={onJoined}
        />
      );
    });
    const joinButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Join session"
    ) as HTMLButtonElement;
    expect(container.querySelector("select")).toBeNull();
    expect(joinButton.disabled).toBe(false);
    await act(async () => joinButton.click());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/ABC/join",
      expect.objectContaining({
        body: JSON.stringify({
          playerId: "player-north",
          profileClubId: "club-north",
          representingClubId: null,
        }),
      })
    );

    await act(async () => {
      root.render(
        <SessionJoinProfilePanel
          code="ABC"
          sessionStatus="COMPLETED"
          eligibleProfiles={[profiles[0]]}
          selectedSelf={null}
          isInterclub={false}
          onJoined={onJoined}
        />
      );
    });
    expect(container.textContent).toBe("");
  });
});
