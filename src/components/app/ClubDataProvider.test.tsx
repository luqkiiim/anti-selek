// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ClubDataProvider, useClubDataStore, useClubIdentity, useClubResource } from "./ClubDataProvider";
import { CLUB_CACHE_MS } from "./clubReadStore";
const session = vi.hoisted(() => ({ status: "authenticated", data: { user: { id: "account", isQuickAccess: false, guestPlayerId: null as string | null, quickAccessClubId: null as string | null } } }));
vi.mock("next-auth/react", () => ({ useSession: () => session }));
const url = "/api/clubs/riverside";
function Reader({ stats = false }: { stats?: boolean }) {
  const read = useClubResource<{ club?: { name: string }; value?: string }>(stats ? "/api/users/player/stats?clubId=riverside" : url);
  const [draft, setDraft] = useState("");
  const identity = useClubIdentity("riverside");
  return <div><output>{read.data?.club?.name ?? read.data?.value ?? "loading"}</output><span>{identity?.name ?? "unknown"}</span><input aria-label="Draft" value={draft} onChange={e => setDraft(e.target.value)} /><button disabled={!read.validated}>Edit</button></div>;
}
function Selection() {
  const store = useClubDataStore();
  return <button onClick={() => store?.prepareClub({ id: "riverside", name: "Riverside" })}>Select</button>;
}
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  session.status = "authenticated"; session.data.user = { id: "account", isQuickAccess: false, guestPlayerId: null, quickAccessClubId: null };
  sessionStorage.clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify(String(url).includes("stats") ? { value: "statistics" } : { club: { id: "riverside", name: "Riverside" } }))));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("shares selection, Strict Mode mounts, and simultaneous statistics consumers", async () => {
  await act(async () => root.render(<StrictMode><ClubDataProvider><Selection /></ClubDataProvider></StrictMode>));
  await act(async () => container.querySelector("button")!.click());
  await act(async () => root.render(<StrictMode><ClubDataProvider><Reader /><Reader stats /><Reader stats /></ClubDataProvider></StrictMode>));
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/clubs/riverside")).toHaveLength(1);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("stats"))).toHaveLength(1);
  expect(container.querySelector("output")?.textContent).toBe("Riverside");
});
it("reloads expired club data when the destination page remounts in the same commit", async () => {
  vi.useFakeTimers();
  try {
    await act(async () => root.render(<ClubDataProvider><Reader key="club" /></ClubDataProvider>));
    expect(container.querySelector("output")?.textContent).toBe("Riverside");
    vi.setSystemTime(Date.now() + CLUB_CACHE_MS + 1);
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise(accept => { resolve = accept; }));
    await act(async () => root.render(<ClubDataProvider><Reader key="manage-club" /></ClubDataProvider>));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.querySelector("button")?.disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      resolve(new Response(JSON.stringify({ club: { id: "riverside", name: "Refreshed club" } })));
    });
    expect(container.querySelector("output")?.textContent).toBe("Refreshed club");
    expect(container.querySelector("button")?.disabled).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
it("preserves an open draft during session refresh and clears content on account change", async () => {
  await act(async () => root.render(<ClubDataProvider><Reader /></ClubDataProvider>));
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Unsaved draft");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  session.status = "loading";
  await act(async () => root.render(<ClubDataProvider><Reader /></ClubDataProvider>));
  expect(container.querySelector("input")?.value).toBe("Unsaved draft");
  expect(fetch).toHaveBeenCalledTimes(1);
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValue(new Promise(accept => { resolve = accept; }));
  session.data.user.id = "other-account"; session.status = "authenticated";
  await act(async () => root.render(<ClubDataProvider><Reader /></ClubDataProvider>));
  expect(container.querySelector("output")?.textContent).toBe("loading");
  expect(container.querySelector("input")?.value).toBe("");
  expect(container.querySelector("button")?.disabled).toBe(true);
  expect(sessionStorage.getItem('anti-selek:club-identities:["account",false,null,null]')).toBeNull();
  await act(async () => resolve(new Response(JSON.stringify({ club: { id: "riverside", name: "Other account club" } }))));
});
