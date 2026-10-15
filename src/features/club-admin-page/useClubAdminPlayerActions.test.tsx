// @vitest-environment jsdom
import { act, useLayoutEffect, useState, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi, type Mock } from "vitest";
import { useClubAdminPlayerActions } from "./useClubAdminPlayerActions";
import type { ClubAdminPlayer } from "@/components/club-admin/clubAdminTypes";
import { ClubPlayerStatus, PlayerGender, SessionPool, PartnerPreference } from "@/types/enums";

const member: ClubAdminPlayer = { id: "player", name: "Ari", email: null, isClaimed: false, isActive: true, role: "MEMBER", elo: 1000, gender: PlayerGender.MALE, partnerPreference: PartnerPreference.OPEN, status: ClubPlayerStatus.CORE, preferredPool: SessionPool.B, createdAt: "2026-10-15" };
let root: Root;
let container: HTMLDivElement;
let actions: ReturnType<typeof useClubAdminPlayerActions>;
let roster: ClubAdminPlayer[];
let refresh: Mock<() => Promise<void>>;
let error: Mock<Dispatch<SetStateAction<string>>>;
function Harness() {
  const [players, setPlayers] = useState([member]);
  const value = useClubAdminPlayerActions({ clubId: "club", currentPlayerId: "self", players, setPlayers, refreshClubData: refresh, router: { replace: vi.fn() }, setError: error, setSuccess: vi.fn() });
  useLayoutEffect(() => { roster = players; actions = value; });
  return null;
}
beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  refresh = vi.fn(async () => undefined); error = vi.fn();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(<Harness />); });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("applies successful name responses before a pending refresh and releases saving", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...member, name: "Ari Two" }))));
  refresh.mockImplementation(() => new Promise(() => {}));
  await act(async () => { actions.openPlayerEditor(member); actions.setEditorName("Ari Two"); });
  await act(async () => { await actions.handleSavePlayerName(member); });
  expect(roster[0].name).toBe("Ari Two"); expect(actions.savingName).toBe(false); expect(actions.refreshing).toBe(true);
});
it("omits unchanged and other claimed players’ pairing fields", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ...member, status: ClubPlayerStatus.OCCASIONAL })));
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => { await actions.handleUpdatePreferences({ ...member, isClaimed: true }, { gender: PlayerGender.FEMALE, mixedSideOverride: null, preferredPool: SessionPool.B, status: ClubPlayerStatus.OCCASIONAL }); });
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ status: ClubPlayerStatus.OCCASIONAL });
});
it("guards duplicate creation and applies the created member immediately", async () => {
  let resolve!: (value: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetchMock);
  await act(async () => actions.setName("Bea"));
  let saving!: Promise<void>;
  await act(async () => { saving = actions.handleAddPlayer({ preventDefault() {} } as never); await actions.handleAddPlayer({ preventDefault() {} } as never); });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(actions.creatingPlayer).toBe(true);
  await act(async () => { resolve(new Response(JSON.stringify({ ...member, id: "new", name: "Bea" }))); await saving; });
  expect(roster.some(player => player.id === "new")).toBe(true); expect(actions.creatingPlayer).toBe(false);
});
it("blocks replay after an unknown creation result until a successful read", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Network lost"); }));
  await act(async () => { await actions.handleAddPlayer({ preventDefault() {} } as never); });
  expect(actions.uncertain).toBe(true); expect(actions.creatingPlayer).toBe(false);
  await act(async () => { await actions.handleAddPlayer({ preventDefault() {} } as never); });
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => { await actions.retryRefresh(); });
  expect(actions.uncertain).toBe(false); expect(fetch).toHaveBeenCalledTimes(1);
});
