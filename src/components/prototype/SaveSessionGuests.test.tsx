// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SessionData } from "@/components/session/sessionTypes";
import { SaveSessionGuests } from "./SaveSessionGuests";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/adminClient", () => ({ adminApi: mocks.api }));
vi.mock("@/components/app/ClubDataProvider", () => ({ useClubDataStore: () => null }));
vi.mock("./Primitives", () => ({ ErrorText: ({ error }: { error: string }) => <p role="alert">{error}</p>, Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div role="dialog">{children}</div> : null }));
let root: Root;
let container: HTMLDivElement;
const fixture = () => ({ status: "COMPLETED", isTest: false, clubId: "host", viewerAdminClubIds: ["host"], players: [
  { userId: "guest-a", isGuest: true, representingClubId: "host", user: { name: "Host Guest" } },
  { userId: "guest-b", isGuest: true, representingClubId: "partner", user: { name: "Partner Guest" } },
] }) as SessionData;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; mocks.api.mockReset(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function click(text: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === text)!.click()); }

it("offers only the admin's represented guests and does not save the same identity twice", async () => {
  mocks.api.mockResolvedValueOnce([]).mockResolvedValueOnce({ userId: "guest-a" });
  await act(async () => root.render(<SaveSessionGuests session={fixture()} />));
  await click("Save guests to club");
  expect(container.textContent).toContain("Host Guest");
  expect(container.textContent).not.toContain("Partner Guest");
  await click("Add to club");
  expect(mocks.api).toHaveBeenLastCalledWith("/api/clubs/host/guests/guest-a", "POST");
  expect(container.textContent).toContain("Added");
  expect([...container.querySelectorAll("button")].some(button => button.textContent === "Add to club")).toBe(false);
});

it("shows already-saved guests as added after reopening", async () => {
  mocks.api.mockResolvedValue([{ id: "guest-a" }]);
  await act(async () => root.render(<SaveSessionGuests session={fixture()} />));
  await click("Save guests to club");
  expect(container.textContent).toContain("Added");
  expect([...container.querySelectorAll("button")].some(button => button.textContent === "Add to club")).toBe(false);
});

it.each([{ status: "ACTIVE" }, { isTest: true }, { viewerAdminClubIds: [] }, { viewerIsQuickAccess: true }])("does not offer promotion outside an authorized completed session: %j", async overrides => {
  await act(async () => root.render(<SaveSessionGuests session={{ ...fixture(), ...overrides }} />));
  expect(container.querySelector("button")).toBeNull();
  expect(mocks.api).not.toHaveBeenCalled();
});
