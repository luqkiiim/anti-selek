// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { AdminSaveOutcomeUnknownError } from "@/lib/adminClient";
import { NewSessionPlayerForm } from "./NewSessionPlayerForm";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/adminClient", async original => ({ ...await original<typeof import("@/lib/adminClient")>(), adminApi: mocks.api }));
let root: Root;
let container: HTMLDivElement;
const member = { id: "saved-player", name: "New Friend", elo: 1000 } as ClubPageMember;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.api.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function fill() {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('input:not([type="number"])')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "New Friend");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const gender = container.querySelector<HTMLSelectElement>("select")!;
    gender.value = "FEMALE"; gender.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent?.startsWith(text));
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}

it("creates one saved identity and retries only admission when the session join fails", async () => {
  mocks.api.mockResolvedValueOnce([]).mockResolvedValueOnce(member);
  const admit = vi.fn().mockRejectedValueOnce(new Error("Session connection failed.")).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<NewSessionPlayerForm mode="live" clubs={[{ id: "club", name: "Club", canSave: true }]} onSaved={admit} onGuest={vi.fn()} onCancel={vi.fn()} />));
  await fill(); await submit();
  expect(mocks.api).toHaveBeenCalledWith("/api/clubs/club/members", "POST", { name: "New Friend", gender: "FEMALE", initialRating: 1000, status: "CORE", mixedSideOverride: null });
  expect(container.textContent).toContain("New Friend is saved to the club");
  expect(container.textContent).toContain("Session connection failed.");
  await submit();
  expect(admit).toHaveBeenNthCalledWith(2, member, "club");
  expect(mocks.api.mock.calls.filter(call => call[1] === "POST")).toHaveLength(1);
});

it("offers an existing profile without creating or merging a duplicate", async () => {
  mocks.api.mockResolvedValue([member]);
  const select = vi.fn();
  await act(async () => root.render(<NewSessionPlayerForm mode="setup" clubs={[{ id: "club", name: "Club", canSave: true }]} onSaved={select} onGuest={vi.fn()} onCancel={vi.fn()} />));
  await fill(); await submit();
  expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("New Friend");
  expect(select).not.toHaveBeenCalled();
  await click("Select New Friend");
  expect(select).toHaveBeenCalledWith(member, "club");
  expect(mocks.api.mock.calls.every(call => call[1] !== "POST")).toBe(true);
});

it("checks the roster after an uncertain creation and lets the user select the saved identity", async () => {
  mocks.api.mockResolvedValueOnce([]).mockRejectedValueOnce(new AdminSaveOutcomeUnknownError()).mockResolvedValueOnce([member]);
  const select = vi.fn();
  await act(async () => root.render(<NewSessionPlayerForm mode="setup" clubs={[{ id: "club", name: "Club", canSave: true }]} onSaved={select} onGuest={vi.fn()} onCancel={vi.fn()} />));
  await fill(); await submit(); await submit();
  expect(mocks.api).toHaveBeenCalledTimes(2);
  await click("Refresh to check"); await click("Select New Friend");
  expect(select).toHaveBeenCalledWith(member, "club");
  expect(mocks.api.mock.calls.filter(call => call[1] === "POST")).toHaveLength(1);
});

it("limits staff to session-only creation while allowing existing-player selection", async () => {
  mocks.api.mockResolvedValue([]);
  const guest = vi.fn();
  await act(async () => root.render(<NewSessionPlayerForm mode="live" clubs={[{ id: "partner", name: "Partner", canSave: false }]} onSaved={vi.fn()} onGuest={guest} onCancel={vi.fn()} />));
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Save to club")!.disabled).toBe(true);
  await fill(); await submit();
  expect(guest).toHaveBeenCalledWith({ name: "New Friend", gender: "FEMALE", initialElo: 1000, mixedSideOverride: null, representingClubId: "partner" });
  expect(mocks.api.mock.calls.every(call => call[1] !== "POST")).toBe(true);
});

it("applies save permission to the chosen collaboration club", async () => {
  await act(async () => root.render(<NewSessionPlayerForm mode="live" clubs={[{ id: "home", name: "Home", canSave: true }, { id: "partner", name: "Partner", canSave: false }]} onSaved={vi.fn()} onGuest={vi.fn()} onCancel={vi.fn()} />));
  await act(async () => { const club = container.querySelector<HTMLSelectElement>("select")!; club.value = "partner"; club.dispatchEvent(new Event("change", { bubbles: true })); });
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Save to club")!.disabled).toBe(true);
  expect(container.textContent).toContain("Saving to the club requires an admin.");
});
