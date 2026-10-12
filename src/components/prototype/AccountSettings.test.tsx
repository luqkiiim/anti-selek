// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountSettings, type AccountUser } from "./AccountSettings";
import { MixedSide, PlayerGender } from "@/types/enums";
vi.mock("next-auth/react", () => ({ useSession: () => ({ update: vi.fn() }), signOut: vi.fn() }));
vi.mock("./Primitives", () => ({ Avatar: () => <span />, ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null, Sheet: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null }));
const initial: AccountUser = { id: "account", name: "Ari", gender: "MALE", email: "a@example.com", avatarUrl: null, canRenameName: true, canChangeGender: true, isClaimed: true, isQuickAccess: false };
let user: AccountUser, container: HTMLDivElement, root: Root;
const saved = vi.fn(async () => {});
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; user = { ...initial }; saved.mockClear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); vi.stubGlobal("fetch", vi.fn(async (_url, init) => ({ ok: true, json: async () => { if (init?.method === "PATCH") { const body = JSON.parse(init.body); user = { ...user, ...body }; } return { user, ...(init?.method === "PATCH" ? { clubPreferences: JSON.parse(init.body).clubPreferences } : {}) }; } }))); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(club = true, clubGender = PlayerGender.MALE) { await act(async () => root.render(<AccountSettings open onClose={() => {}} onSaved={saved} clubContext={club ? { clubId: "club", clubName: "Riverside", playerId: "player", gender: clubGender, mixedSideOverride: null } : undefined} />)); }
function button(text: string) { const found = Array.from(container.querySelectorAll("button")).find(b => b.textContent === text); if (!found) throw new Error(`Missing ${text}`); return found; }
async function change(label: string, value: string) { const node = label === "name" ? container.querySelector("input:not([type=file])")! : container.querySelector(`[aria-label="${label}"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })); }); }
function patches() { return vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PATCH"); }
it("omits club preferences outside a club", async () => { await render(false); expect(container.querySelector('[aria-label="Player level"]')).toBeNull(); });
it("allows preference-only saves when identity allowances are used", async () => { user.canRenameName = false; user.canChangeGender = false; await render(); expect(button("Save changes").disabled).toBe(true); await change("Player level", MixedSide.LOWER); await act(async () => button("Save changes").click()); expect(patches()).toHaveLength(1); expect(JSON.parse(patches()[0][1]!.body as string)).toEqual({ clubPreferences: { clubId: "club", playerId: "player", mixedSideOverride: "LOWER" } }); expect(container.querySelector('[aria-label="Confirm account changes"]')).toBeNull(); expect(saved).toHaveBeenCalledOnce(); });
it("resets level on gender draft changes and cancels without writing", async () => { await render(); await change("Player level", "LOWER"); await change("Account gender", "FEMALE"); expect((container.querySelector('[aria-label="Player level"]') as HTMLSelectElement).value).toBe(""); await act(async () => button("Save changes").click()); expect(container.textContent).toContain("You can change your gender only once."); expect(container.textContent).toContain("Male"); await act(async () => button("Cancel").click()); expect(patches()).toHaveLength(0); expect((container.querySelector('[aria-label="Account gender"]') as HTMLSelectElement).value).toBe("FEMALE"); });
it("confirms the combined changed fields once and retains drafts on atomic failure", async () => { await render(); await change("Account gender", "FEMALE"); await change("Player level", "UPPER"); await act(async () => button("Save changes").click()); vi.mocked(fetch).mockImplementationOnce(async () => ({ ok: false, status: 409, json: async () => ({ error: "This Player is no longer yours." }) } as Response)); await act(async () => { button("Confirm changes").click(); button("Confirm changes").click(); }); expect(patches()).toHaveLength(1); expect(JSON.parse(patches()[0][1]!.body as string)).toEqual({ gender: "FEMALE", clubPreferences: { clubId: "club", playerId: "player", mixedSideOverride: "UPPER" } }); expect(container.querySelector('[aria-label="Confirm account changes"]')?.textContent).toContain("This Player is no longer yours."); expect(saved).not.toHaveBeenCalled(); await act(async () => button("Confirm changes").click()); expect(patches()).toHaveLength(2); expect(saved).toHaveBeenCalledOnce(); });

it("uses preserved club gender until a genuine account gender change is submitted", async () => {
  await render(true, PlayerGender.FEMALE);
  const level = container.querySelector('[aria-label="Player level"]') as HTMLSelectElement;
  expect(Array.from(level.options).map(option => option.value)).toEqual(["", "UPPER"]);
  expect(container.querySelector(".account-field-note")).toBeNull();
  await change("Player level", "UPPER");
  await act(async () => button("Save changes").click());
  expect(JSON.parse(patches()[0][1]!.body as string)).toEqual({ clubPreferences: { clubId: "club", playerId: "player", mixedSideOverride: "UPPER" } });
  expect(level.value).toBe("UPPER");
  await change("Account gender", "FEMALE");
  await change("Account gender", "MALE");
  expect(Array.from(level.options).map(option => option.value)).toEqual(["", "UPPER"]);
});
it("uses the server-normalized side for confirmed UI state", async () => {
  await render();
  await change("Player level", "LOWER");
  vi.mocked(fetch).mockImplementationOnce(async () => ({ ok: true, json: async () => ({ user, clubPreferences: { mixedSideOverride: null } }) } as Response));
  await act(async () => button("Save changes").click());
  expect((container.querySelector('[aria-label="Player level"]') as HTMLSelectElement).value).toBe("");
  expect(button("Save changes").disabled).toBe(true);
  expect(saved).toHaveBeenCalledOnce();
});
