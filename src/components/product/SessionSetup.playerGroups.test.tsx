// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseCreateSessionRequest } from "@/app/api/sessions/createSessionRequest";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { ClubPlayerStatus, PartnerPreference, PlayerGender, SessionPool } from "@/types/enums";
import { SessionSetup } from "./SessionSetup";

vi.mock("./Primitives", () => ({
  Avatar: () => null,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

const members: ClubPageMember[] = Array.from({ length: 4 }, (_, index) => ({
  id: `player-${index + 1}`,
  ownerUserId: `account-${index + 1}`,
  profileClubId: "home",
  name: `Player ${index + 1}`,
  status: ClubPlayerStatus.CORE,
  preferredPool: SessionPool.B,
  gender: PlayerGender.MALE,
  partnerPreference: PartnerPreference.OPEN,
  elo: 1000,
  wins: 0,
  losses: 0,
  isClaimed: true,
  role: "MEMBER",
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("only shows players chosen in Who’s playing when opening group assignments", async () => {
  await act(async () => root.render(<SessionSetup clubId="home" members={members} onCreated={vi.fn()} />));
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-roster-summary")!.click());
  await act(async () => {
    const checkboxes = container.querySelectorAll<HTMLInputElement>(".setup-person-select input");
    checkboxes[0].click();
    checkboxes[1].click();
  });
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-roster-done button")!.click());
  await act(async () => {
    const groups = Array.from(container.querySelectorAll<HTMLLabelElement>(".setup-toggle"))
      .find(label => label.textContent?.includes("Player groups"))!;
    groups.querySelector<HTMLInputElement>("input")!.click();
  });
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-inline-action")!.click());

  expect(Array.from(container.querySelectorAll(".setup-roster-list .setup-person strong"), node => node.textContent))
    .toEqual(["Player 1", "Player 2"]);
  expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Player groups");
  expect(container.querySelectorAll('[role="dialog"] input[type="checkbox"]')).toHaveLength(0);

  await act(async () => {
    const group = container.querySelector<HTMLSelectElement>('[aria-label="Group for Player 1"]')!;
    group.value = SessionPool.A;
    group.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-roster-done button")!.click());
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-roster-summary")!.click());
  await act(async () => {
    const checkboxes = container.querySelectorAll<HTMLInputElement>(".setup-person-select input");
    expect(Array.from(checkboxes, checkbox => checkbox.checked)).toEqual([true, true, false, false]);
    checkboxes[1].click();
    checkboxes[2].click();
  });
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-roster-done button")!.click());
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-inline-action")!.click());

  expect(Array.from(container.querySelectorAll(".setup-roster-list .setup-person strong"), node => node.textContent))
    .toEqual(["Player 1", "Player 3"]);
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Group for Player 1"]')!.value).toBe(SessionPool.A);
});

it("preserves setup group choices through API parsing when club defaults are all Social", async () => {
  let submitted: ReturnType<typeof parseCreateSessionRequest> | undefined;
  const onCreated = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/sessions");
    submitted = parseCreateSessionRequest(JSON.parse(init.body as string));
    return new Response(JSON.stringify({ code: "GROUPED" }), { status: 200 });
  }));

  await act(async () => root.render(<SessionSetup clubId="home" members={members} onCreated={onCreated} />));
  await act(async () => {
    const name = container.querySelector<HTMLInputElement>(".setup-name input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Grouped Friday");
    name.dispatchEvent(new Event("input", { bubbles: true }));
    const groups = Array.from(container.querySelectorAll<HTMLLabelElement>(".setup-toggle"))
      .find(label => label.textContent?.includes("Player groups"))!;
    groups.querySelector<HTMLInputElement>("input")!.click();
    container.querySelector<HTMLButtonElement>(".setup-roster-summary")!.click();
  });
  await act(async () => {
    container.querySelectorAll<HTMLInputElement>(".setup-person-select input").forEach(input => input.click());
  });
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-roster-done button")!.click());
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-inline-action")!.click());
  await act(async () => {
    for (const name of ["Player 1", "Player 2"]) {
      const select = container.querySelector<HTMLSelectElement>(`[aria-label="Group for ${name}"]`)!;
      select.value = SessionPool.A;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await act(async () => container.querySelector<HTMLButtonElement>(".setup-roster-done button")!.click());
  expect(container.querySelector(".setup-inline-action")?.textContent).toContain("2 Competitive · 2 Social");

  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

  expect(onCreated).toHaveBeenCalledWith("GROUPED");
  expect(submitted?.poolsEnabled).toBe(true);
  expect(submitted?.requestedPlayerIds.map(id => submitted?.playerConfigMap.get(id)?.pool)).toEqual([
    SessionPool.A,
    SessionPool.A,
    SessionPool.B,
    SessionPool.B,
  ]);
});
