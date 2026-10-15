// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useClubAdminData } from "./useClubAdminData";
import { useAdminRefresh } from "./useAdminRefresh";
import type { ClubAdminPlayer } from "@/components/club-admin/clubAdminTypes";

it("prevents a GET begun before a saved response from overwriting it", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let resolveRoster!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/members")
    ? new Promise<Response>(resolve => { resolveRoster = resolve; })
    : new Response(JSON.stringify(url.endsWith("/claim-requests") ? [] : { club: { id: "club", role: "ADMIN" } }))));
  const router = { push: vi.fn(), replace: vi.fn() };
  let data!: ReturnType<typeof useClubAdminData>;
  function Harness() { const value = useClubAdminData({ clubId: "club", status: "loading", router }); useLayoutEffect(() => { data = value; }); return null; }
  const container = document.createElement("div"); const root = createRoot(container);
  try {
    await act(async () => { root.render(<Harness />); });
    let read!: Promise<void>;
    await act(async () => { read = data.fetchClubAndPlayers(); });
    await act(async () => { data.setPlayers([{ id: "player", name: "Saved name" } as ClubAdminPlayer]); });
    const discarded = expect(read).rejects.toThrow("Club details changed");
    await act(async () => { resolveRoster(new Response(JSON.stringify([{ id: "player", name: "Old name" }]))); await discarded; });
    expect(data.players[0].name).toBe("Saved name");
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("does not reuse a pre-write snapshot to resolve an unknown save", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let resolveOld!: (response: Response) => void;
  let resolveFresh!: (response: Response) => void;
  let clubReads = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") throw new TypeError("Response lost");
    if (url === "/api/clubs/club") {
      clubReads++;
      return new Promise<Response>(resolve => { if (clubReads === 1) resolveOld = resolve; else resolveFresh = resolve; });
    }
    return Response.json(url.endsWith("/members") ? [{ id: "player", name: "Fresh", role: "ADMIN" }] : []);
  });
  vi.stubGlobal("fetch", fetchMock);
  let data!: ReturnType<typeof useClubAdminData>;
  let action!: ReturnType<typeof useAdminRefresh>;
  const router = { push: vi.fn(), replace: vi.fn() };
  function Harness() {
    const state = useClubAdminData({ clubId: "club", status: "loading", router });
    const recovery = useAdminRefresh(state.fetchClubAndPlayers, state.invalidateReads);
    useLayoutEffect(() => { data = state; action = recovery; });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness />));
    let old!: Promise<void>;
    await act(async () => { old = action.retryRefresh(); });
    await act(async () => { await expect(action.request("/api/clubs/club/members/player", { method: "PATCH", body: JSON.stringify({ role: "ADMIN" }) })).rejects.toThrow("Couldn’t confirm"); });
    expect(action.uncertain).toBe(true);
    let fresh!: Promise<void>;
    await act(async () => { fresh = action.retryRefresh(); });
    expect(clubReads).toBe(2);
    await act(async () => { resolveOld(Response.json({ club: { id: "club", role: "ADMIN" } })); await old; });
    expect(action.uncertain).toBe(true);
    expect(data.players).toEqual([]);
    await act(async () => { resolveFresh(Response.json({ club: { id: "club", role: "ADMIN" } })); await fresh; });
    expect(action.uncertain).toBe(false);
    expect(data.players[0].role).toBe("ADMIN");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("coalesces simultaneous recovery reads and only resolves after applying the snapshot", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let resolveClub!: (response: Response) => void;
  const fetchMock = vi.fn(async (url: string) => url === "/api/clubs/club"
    ? new Promise<Response>(resolve => { resolveClub = resolve; })
    : Response.json(url.endsWith("/members") ? [{ id: "player", name: "Fresh" }] : []));
  vi.stubGlobal("fetch", fetchMock);
  let data!: ReturnType<typeof useClubAdminData>;
  const router = { push: vi.fn(), replace: vi.fn() };
  function Harness() {
    const value = useClubAdminData({ clubId: "club", status: "loading", router });
    useLayoutEffect(() => { data = value; });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Harness />));
    let first!: Promise<void>, second!: Promise<void>;
    await act(async () => { first = data.fetchClubAndPlayers(); second = data.fetchClubAndPlayers(); });
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolveClub(Response.json({ club: { id: "club", role: "ADMIN" } })); await Promise.all([first, second]); });
    expect(data.players[0].name).toBe("Fresh");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
