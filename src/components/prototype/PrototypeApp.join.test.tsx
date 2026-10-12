// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PrototypeApp from "./PrototypeApp";

const session = vi.hoisted(() => ({ data: { user: { id: "account-1", name: "Ari" } }, status: "authenticated" }));
vi.mock("next-auth/react", () => ({ useSession: () => session }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("./Club", () => ({ Club: () => null }));
vi.mock("./Primitives", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name}</span>,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open = true, title, children, footer }: { open?: boolean; title: string; children: ReactNode; footer?: ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null,
}));
let accountGender = "UNSPECIFIED";
vi.mock("./AccountSettings", () => ({ AccountSettings: ({ open, onSaved, onClose }: { open: boolean; onSaved: () => Promise<unknown>; onClose: () => void }) => open ? <div role="dialog" aria-label="Your account"><button onClick={() => { accountGender = "FEMALE"; void onSaved(); }}>Save details</button><button onClick={onClose}>Close account</button></div> : null }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  accountGender = "UNSPECIFIED"; localStorage.clear(); history.replaceState(null, "", "/?join=club-1");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => ({ ok: true, json: async () => String(url) === "/api/user/me" ? { user: { id: "account-1", name: "Ari", gender: accountGender } } : String(url) === "/api/clubs" ? [] : { requiresJoinCode: false, club: { id: "club-1", name: "Riverside", allowJoinRequests: true, isPasswordProtected: false, avatarUrl: null }, players: [], requests: [], access: null, membership: null } }) as Response));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); history.replaceState(null, "", "/"); });
function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find(item => item.textContent === label);
  if (!found) throw new Error(`Missing ${label}`); return found;
}
it("opens account settings and returns to the same joining confirmation after refreshed details", async () => {
  await act(async () => root.render(<PrototypeApp />));
  await act(async () => button("I’m new to this clubAsk the admin to add a Player").click());
  await act(async () => button("Complete account details").click());
  expect(container.querySelector('[aria-label="Join a club"]')).toBeNull();
  expect(container.querySelector('[aria-label="Your account"]')).not.toBeNull();
  await act(async () => button("Save details").click());
  expect(container.querySelector('[aria-label="Your account"]')).toBeNull();
  expect(container.textContent).toContain("Riverside");
  expect(container.textContent).toContain("Request a new Player profile");
  expect(container.querySelector(".admission-account-summary")?.textContent).toContain("AriFemale");
  expect(button("Send request").disabled).toBe(false);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/clubs/join-requests?clubId=club-1")).toHaveLength(1);
});
