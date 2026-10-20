// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubReadStore, CLUB_CACHE_MS, clubSnapshotUrl } from "./clubReadStore";

const url = clubSnapshotUrl("riverside");
const stats = "/api/users/player/stats?clubId=riverside";
const identity = { id: "riverside", name: "Riverside", avatarUrl: "/club.png" };
const snapshot = { club: { ...identity, role: "ADMIN" }, viewer: { playerId: "player" }, sessions: [] };
function response(data: unknown, status = 200, headers?: Record<string, string>) { return new Response(JSON.stringify(data), { status, headers }); }
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(accept => { resolve = accept; });
  return { promise, resolve };
}
describe("shared club reads", () => {
  let store: ClubReadStore;
  beforeEach(() => {
    vi.useFakeTimers(); sessionStorage.clear(); store = new ClubReadStore("account");
    vi.stubGlobal("fetch", vi.fn(async () => response(snapshot)));
  });
  afterEach(() => { store.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("hands off one slow selection request to all destination consumers", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    store.prepareClub(identity);
    const release = store.retain(url); const releaseOther = store.retain(url);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.identity("riverside")).toEqual(identity);
    pending.resolve(response(snapshot)); await store.read(url);
    expect(store.get(url).validated).toBe(true);
    release(); releaseOther();
  });
  it("does not repeat a handoff that finished before the route mounted", async () => {
    store.prepareClub(identity); await store.read(url);
    const release = store.retain(url);
    expect(fetch).toHaveBeenCalledTimes(1); release();
  });
  it("reuses a completed startup preload when the club list selects the same club", async () => {
    store.prepareClub({ id: identity.id, name: "" }); await store.read(url);
    store.prepareClub(identity);
    const release = store.retain(url);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.get(url)).toMatchObject({ data: snapshot, validated: true });
    release();
  });
  it("starts current viewer statistics before route code mounts and hands off both reads once", async () => {
    store.prepareClub(identity, false, { preloadProfile: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([url, stats]);
    store.prepareClub(identity);
    const releaseClub = store.retain(url), releaseStats = store.retain(stats);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    releaseClub(); releaseStats();
  });
  it("cancels a preloaded profile when its saved club is unavailable", async () => {
    const pending = deferred();
    vi.mocked(fetch).mockImplementation(async request => String(request) === stats ? pending.promise : response(snapshot));
    store.prepareClub(identity, false, { preloadProfile: true });
    await vi.advanceTimersByTimeAsync(0);
    const signal = vi.mocked(fetch).mock.calls.find(([request]) => String(request) === stats)?.[1]?.signal;
    expect(signal).toBeDefined();
    store.cancelPreparedClub(identity.id);
    expect(signal?.aborted).toBe(true);
    pending.resolve(response({ value: "obsolete profile" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get(stats).data).toBeNull();
  });
  it("does not preload a personal profile for global club reads", async () => {
    store.prepareClub(identity, true, { preloadProfile: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([clubSnapshotUrl(identity.id, true)]);
  });
  it("does not launch profile reads from a late response after an account change", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    store.prepareClub(identity, false, { preloadProfile: true });
    store.clear(); pending.resolve(response(snapshot));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("shows warm content read-only and refreshes once on return", async () => {
    const release = store.retain(url); await store.read(url); release();
    await vi.advanceTimersByTimeAsync(1);
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const again = store.retain(url); const other = store.retain(url);
    expect(store.get(url)).toMatchObject({ data: snapshot, validated: false, loading: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    pending.resolve(response({ ...snapshot, club: { ...identity, name: "Renamed" } })); await store.read(url);
    expect(store.identity(identity.id)?.name).toBe("Renamed");
    again(); other();
  });
  it.each([CLUB_CACHE_MS - 1, CLUB_CACHE_MS, CLUB_CACHE_MS + 1])("resumes a route handoff after %i ms without losing the club read", async age => {
    const release = store.retain(url); await store.read(url);
    // Time passes while browsing profiles, with the club still mounted.
    vi.setSystemTime(Date.now() + age);
    release();
    store.get(url); // The destination renders before its retain effect runs.
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const again = store.retain(url);
    if (age < CLUB_CACHE_MS) {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(store.get(url)).toMatchObject({ data: snapshot, validated: true, loading: false });
    } else {
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(store.get(url)).toMatchObject({ data: null, validated: false, loading: true });
      const other = store.retain(url);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(vi.mocked(fetch).mock.calls[1][1]?.signal?.aborted).toBe(false);
      pending.resolve(response(snapshot)); await store.read(url);
      expect(store.get(url)).toMatchObject({ data: snapshot, validated: true, loading: false });
      other();
    }
    again();
  });
  it("shows a recoverable timeout if an expired route handoff cannot reload", async () => {
    const release = store.retain(url); await store.read(url);
    vi.setSystemTime(Date.now() + CLUB_CACHE_MS);
    release();
    vi.mocked(fetch).mockReturnValue(deferred().promise);
    const again = store.retain(url);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.get(url)).toMatchObject({ data: null, validated: false, loading: false, error: "Request timed out." });
    vi.mocked(fetch).mockResolvedValue(response(snapshot));
    await store.refresh(url);
    expect(store.get(url)).toMatchObject({ data: snapshot, validated: true, loading: false, error: "" });
    again();
  });
  it("drops expired content while keeping the remembered header", async () => {
    const release = store.retain(url); await store.read(url); release();
    await vi.advanceTimersByTimeAsync(CLUB_CACHE_MS + 1);
    expect(store.get(url).data).toBeNull(); expect(store.identity(identity.id)).toEqual(identity);
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const again = store.retain(url); expect(store.get(url).data).toBeNull();
    pending.resolve(response(snapshot)); await store.read(url); again();
  });
  it("keeps immediate warm handoffs read-only and cancels the scheduled release", async () => {
    const release = store.retain(url); await store.read(url); release();
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    store.prepareClub(identity); const again = store.retain(url);
    expect(store.get(url).validated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.mocked(fetch).mock.calls[1][1]?.signal?.aborted).toBe(false);
    pending.resolve(response(snapshot)); await store.read(url); again();
  });
  it("revalidates a handoff if route assets take longer than the cache window", async () => {
    store.prepareClub(identity); await store.read(url);
    await vi.advanceTimersByTimeAsync(CLUB_CACHE_MS + 1);
    const release = store.retain(url); await store.read(url);
    expect(fetch).toHaveBeenCalledTimes(2); release();
  });
  it("deduplicates statistics and coalesces save refresh callbacks", async () => {
    const a = store.retain(stats); const b = store.retain(stats); await store.read(stats);
    expect(fetch).toHaveBeenCalledTimes(1);
    await Promise.all([store.refresh(stats), store.refresh(stats)]);
    expect(fetch).toHaveBeenCalledTimes(2); a(); b();
  });
  it("refreshes affected active statistics once and invalidates inactive reads after a club save", async () => {
    const release = store.retain(url); const a = store.retain(stats); const b = store.retain(stats);
    const inactive = "/api/users/other/stats?clubId=riverside";
    await Promise.all([store.read(url), store.read(stats), store.read(inactive)]);
    await Promise.all([store.refreshClub(identity.id), store.refresh(stats)]);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === stats)).toHaveLength(2);
    expect(store.get(inactive).data).toBeNull(); release(); a(); b();
  });
  it("invalidates the other club views after an admin save without repeating its confirmed read", async () => {
    const admin = `${url}?section=admin`;
    const release = store.retain(admin);
    await Promise.all([store.read(admin), store.read(url), store.read(stats)]);
    const count = vi.mocked(fetch).mock.calls.length;
    await store.refreshClub(identity.id, admin);
    expect(fetch).toHaveBeenCalledTimes(count);
    expect(store.get(admin)).toMatchObject({ data: snapshot, validated: true });
    expect(store.get(url).data).toBeNull();
    expect(store.get(stats).data).toBeNull();
    release();
  });
  it("does not let a pre-save response overwrite authoritative local data", async () => {
    await store.read(stats);
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const old = store.read(stats);
    store.update<typeof snapshot>(stats, current => ({ ...current, club: { ...current.club, name: "Saved" } }));
    pending.resolve(response(snapshot)); await old;
    expect(store.get<typeof snapshot>(stats).data?.club.name).toBe("Saved");
  });
  it("invalidates an in-flight read when save callbacks refresh", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const old = store.read(url); const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await Promise.all([store.refresh(url), store.refresh(url)]);
    expect(signal?.aborted).toBe(true); expect(fetch).toHaveBeenCalledTimes(2);
    pending.resolve(response({ club: { ...identity, name: "Stale" } })); await old;
    expect(store.identity(identity.id)?.name).toBe("Riverside");
  });
  it("cancels superseded selections and ignores their late responses", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    store.prepareClub(identity); const old = store.read(url);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    store.prepareClub({ id: "other", name: "Other club" });
    expect(signal?.aborted).toBe(true);
    pending.resolve(response({ club: { ...identity, name: "Stale" } })); await old;
    expect(store.get(url).data).toBeNull(); expect(store.identity(identity.id)?.name).toBe("Riverside");
    await store.read(clubSnapshotUrl("other"));
  });
  it("cancels a selection when the chooser is reopened during navigation", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    store.prepareClub(identity); const old = store.read(url);
    store.cancelPreparedClub(identity.id);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    pending.resolve(response(snapshot)); await old; expect(store.get(url).data).toBeNull();
  });
  it("surfaces a statistics access denial on the affected club without a perpetual spinner", async () => {
    await store.read(url);
    vi.mocked(fetch).mockResolvedValue(response({ error: "Access unavailable" }, 403));
    await expect(store.read(stats)).rejects.toThrow();
    expect(store.get(url)).toMatchObject({ data: null, loading: false, error: "Access unavailable", errorStatus: 403 });
  });
  it("retains read-only cached content on a transient failure", async () => {
    await store.read(url);
    vi.mocked(fetch).mockResolvedValue(response({ error: "Try again later." }, 503));
    await expect(store.refresh(url)).rejects.toThrow("Try again later.");
    expect(store.get(url)).toMatchObject({ data: snapshot, validated: false, errorStatus: 503 });
  });
  it.each([401, 403, 404])("clears private club content after a %i", async status => {
    await store.read(url); await store.read(stats);
    vi.mocked(fetch).mockResolvedValue(response({ error: "Access unavailable" }, status));
    await expect(store.refresh(url)).rejects.toThrow();
    expect(store.get(url).data).toBeNull(); expect(store.get(stats).data).toBeNull();
    expect(store.get(url).errorStatus).toBe(status);
    if (status === 404) expect(store.identity(identity.id)).toBeNull();
  });
  it.each(["5", new Date(Date.now() + 5000).toUTCString()])("respects Retry-After %s without retry storms", async value => {
    vi.mocked(fetch).mockResolvedValue(response({ error: "Too many requests" }, 429, { "Retry-After": value }));
    await expect(store.read(url)).rejects.toThrow();
    await store.refresh(url); const release = store.retain(url); await store.read(url);
    expect(fetch).toHaveBeenCalledTimes(1); expect(store.get(url).retryAt).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(5001);
    expect(store.get(url).retryAt).toBe(0);
    vi.mocked(fetch).mockResolvedValue(response(snapshot)); await store.refresh(url);
    expect(fetch).toHaveBeenCalledTimes(2); release();
  });
  it("times out slow reads at ten seconds", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const read = expect(store.read(url)).rejects.toThrow("Request timed out.");
    await vi.advanceTimersByTimeAsync(10_000); await read;
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(store.get(url)).toMatchObject({ loading: false, validated: false });
  });
  it("does not confirm recovery while Retry-After suppresses reads", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ error: "Too many requests" }, 429, { "Retry-After": "5" }));
    await expect(store.read(url)).rejects.toThrow();
    await expect(store.refreshConfirmed(url)).rejects.toThrow("Please wait");
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5001);
    vi.mocked(fetch).mockResolvedValue(response(snapshot));
    await store.refreshConfirmed(url);
    expect(store.get(url).validated).toBe(true);
  });
  it("rejects recovery when a newer local update supersedes its read", async () => {
    await store.read(url);
    const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const recovery = expect(store.refreshConfirmed(url)).rejects.toThrow("Refresh again");
    store.update<typeof snapshot>(url, current => ({ ...current, club: { ...current.club, name: "Saved" } }));
    pending.resolve(response(snapshot)); await recovery;
    expect(store.get<typeof snapshot>(url).data?.club.name).toBe("Saved");
  });
  it("confirms with a fresh read instead of an outstanding pre-save request", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const old = store.read(url);
    await store.refreshConfirmed(url);
    pending.resolve(response({ ...snapshot, club: { ...identity, name: "Stale" } })); await old;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.get<typeof snapshot>(url).data?.club.name).toBe("Riverside");
  });
  it("isolates normal/global and account/quick-access reads", async () => {
    const guest = new ClubReadStore("guest:player:club"); const account = new ClubReadStore("other-account");
    await store.read(url);
    expect(store.get(clubSnapshotUrl(identity.id, true)).data).toBeNull();
    expect(guest.get(url).data).toBeNull(); expect(account.get(url).data).toBeNull();
    guest.clear(); account.clear();
  });
  it("persists only display metadata and removes it with deleted clubs/sign-out", async () => {
    store.remember({ ...identity, role: "ADMIN" } as typeof identity);
    expect(JSON.parse(sessionStorage.getItem("anti-selek:club-identities:account")!)).toEqual([identity]);
    const refreshed = new ClubReadStore("account"); expect(refreshed.identity(identity.id)).toEqual(identity);
    expect(refreshed.get(url).data).toBeNull(); store.deleteClub(identity.id);
    expect(store.identity(identity.id)).toBeNull(); store.remember(identity); store.clear();
    expect(sessionStorage.getItem("anti-selek:club-identities:account")).toBeNull(); refreshed.clear();
  });
  it("ignores late reads and callbacks from a cleared account scope", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    store.prepareClub(identity); const old = store.read(url); store.clear();
    pending.resolve(response(snapshot)); await old; store.prepareClub(identity);
    expect(store.get(url).data).toBeNull(); expect(store.identity(identity.id)).toBeNull();
    expect(sessionStorage.getItem("anti-selek:club-identities:account")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
