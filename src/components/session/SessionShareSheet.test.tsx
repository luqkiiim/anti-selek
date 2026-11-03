// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { emptySessionDetails } from "@/lib/sessionDetails";
import type { SessionData } from "./sessionTypes";
const mocks = vi.hoisted(() => ({ api: vi.fn(), copy: vi.fn() }));
vi.mock("@/components/prototype/api", () => ({ api: mocks.api }));
vi.mock("@/components/prototype/Primitives", () => ({ Sheet: ({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) => <div role="dialog" aria-label={title}>{children}{footer}</div> }));
import { SessionShareSheet } from "./SessionShareSheet";

let root: Root;
let container: HTMLDivElement;
const session = { name: "Friendly", code: "ABC", status: "WAITING", viewerCanEditDetails: true, details: emptySessionDetails(), courts: [{ id: "court", courtNumber: 1 }], players: [{ userId: "p1", user: { name: "Amir" } }] } as SessionData;
const saved = vi.fn();
const render = (value = session) => root.render(<SessionShareSheet session={value} sessionUrl="https://example.test/session/ABC" onSaved={saved} onClose={vi.fn()} />);
const button = (name: string) => [...container.querySelectorAll("button")].find(item => item.textContent === name)!;
function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.copy } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("preserves an edited message through polling, resets from current data, and copies exactly the preview", async () => {
  await act(async () => render());
  const message = container.querySelector("textarea")!;
  await act(async () => fill(message, "Custom announcement"));
  await act(async () => render({ ...session, players: [...session.players, { userId: "p2", user: { name: "Zoe" } } as SessionData["players"][number]] }));
  expect(message.value).toBe("Custom announcement");
  await act(async () => button("Copy message").click());
  expect(mocks.copy).toHaveBeenCalledWith("Custom announcement");
  expect(button("Copied")).toBeDefined();
  await act(async () => button("Reset message").click());
  expect(message.value).toContain("2. Zoe");
});

it("selects the editable message when clipboard permission is denied", async () => {
  mocks.copy.mockRejectedValue(new Error("Blocked"));
  await act(async () => render());
  await act(async () => button("Copy message").click());
  const message = container.querySelector("textarea")!;
  expect(document.activeElement).toBe(message);
  expect(message.selectionEnd).toBe(message.value.length);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Select and copy");
  expect(button("Copied")).toBeUndefined();
});

it("saves only logistics, keeps customised text, and resets to the latest saved details", async () => {
  const courtBookings = [{ courtNumber: 1, startsAt: "2026-11-04T11:00:00.000Z", endsAt: "2026-11-04T14:00:00.000Z" }];
  const booking = { startsAt: "2026-11-04T15:00:00.000Z", endsAt: "2026-11-04T17:00:00.000Z", courtBookings };
  const details = { ...emptySessionDetails(), venue: "New hall", ...booking };
  mocks.api.mockResolvedValue({ details });
  await act(async () => render({ ...session, details: { ...emptySessionDetails(), ...booking } }));
  await act(async () => fill(container.querySelector("textarea")!, "Custom announcement"));
  await act(async () => button("Edit details").click());
  expect(container.textContent).not.toContain("Individual court times");
  expect(container.querySelectorAll('input[type="datetime-local"]')).toHaveLength(1);
  expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("2");
  const venue = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
  await act(async () => fill(venue, "New hall"));
  await act(async () => button("Save details").click());
  expect(mocks.api).toHaveBeenCalledWith("/api/sessions/ABC/details", "PATCH", { details });
  expect(saved).toHaveBeenCalledWith(details);
  expect(container.querySelector("textarea")!.value).toBe("Custom announcement");
  await act(async () => render({ ...session, details: { ...details, venue: "Latest hall" } }));
  await act(async () => button("Reset message").click());
  expect(container.querySelector("textarea")!.value).toContain("Venue: Latest hall");
});

it("shows copy controls without a details editor for viewers and completed sessions", async () => {
  await act(async () => render({ ...session, viewerCanEditDetails: false }));
  expect(button("Edit details")).toBeUndefined();
  expect(button("Copy message")).toBeDefined();
  await act(async () => render({ ...session, status: "COMPLETED" }));
  expect(button("Edit details")).toBeUndefined();
});
