import { ApiError } from "@/components/prototype/api";

export type ClubIdentity = { id: string; name: string; avatarUrl?: string | null };
export const CLUB_CACHE_MS = 60_000;
const READ_TIMEOUT_MS = 10_000;
export type ReadState<T> = {
  data: T | null; error: string; errorStatus: number | null;
  validated: boolean; loading: boolean; retryAt: number;
};
type Entry = {
  state: ReadState<unknown>; updatedAt: number; version: number; users: number;
  listeners: Set<() => void>; controller?: AbortController; pending?: Promise<void>;
  refreshing?: Promise<void>; handoff: boolean; releaseTimer?: ReturnType<typeof setTimeout>;
  pausedValidation?: boolean;
  retryTimer?: ReturnType<typeof setTimeout>;
};
const empty = (): ReadState<unknown> => ({ data: null, error: "", errorStatus: null, validated: false, loading: false, retryAt: 0 });
export function clubSnapshotUrl(id: string, globalView = false) {
  return `/api/clubs/${encodeURIComponent(id)}${globalView ? "?view=global" : ""}`;
}
function clubIdFor(url: string) {
  const parsed = new URL(url, "https://anti-selek.local");
  const match = parsed.pathname.match(/^\/api\/clubs\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : parsed.searchParams.get("clubId");
}
function retryTime(value: string | null) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Math.max(Date.now(), Date.parse(value) || 0);
}

// One instance per authenticated client identity; never a server/module-wide cache.
export class ClubReadStore {
  private entries = new Map<string, Entry>();
  private identities = new Map<string, ClubIdentity>();
  private identityListeners = new Set<() => void>();
  private storageLoaded = false;
  private disposed = false;
  constructor(private scope: string) {}
  private get storageKey() { return `anti-selek:club-identities:${this.scope}`; }
  private entry(url: string) {
    let entry = this.entries.get(url);
    if (!entry) {
      entry = { state: empty(), updatedAt: 0, version: 0, users: 0, listeners: new Set(), handoff: false };
      this.entries.set(url, entry);
    }
    if (!entry.users && !entry.pending && entry.state.data && Date.now() - entry.updatedAt >= CLUB_CACHE_MS) {
      entry.state = { ...entry.state, data: null, validated: false };
    }
    return entry;
  }
  private publish(entry: Entry, state: ReadState<unknown>) {
    entry.state = state;
    entry.listeners.forEach(listener => listener());
  }
  get<T>(url: string): ReadState<T> { return this.entry(url).state as ReadState<T>; }
  subscribe(url: string, listener: () => void) {
    const entry = this.entry(url);
    entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  }
  retain(url: string) {
    const entry = this.entry(url);
    const resuming = entry.releaseTimer !== undefined;
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = undefined;
    if (entry.users++ === 0) {
      const handoff = entry.handoff;
      entry.handoff = false;
      if (resuming && entry.pausedValidation && entry.state.data) this.publish(entry, { ...entry.state, validated: true });
      // A route can resume before cleanup after entry() has expired its data.
      const expiredHandoff = (handoff || resuming) && !entry.pending && !entry.state.data && !entry.state.error;
      if ((!handoff && !resuming) || expiredHandoff) void this.read(url).catch(() => {});
    }
    return () => {
      if (--entry.users !== 0) return;
      entry.pausedValidation = entry.state.validated;
      this.publish(entry, { ...entry.state, validated: false });
      // Let simultaneous consumers and Strict Mode remounts reuse this read.
      entry.releaseTimer = setTimeout(() => {
        entry.releaseTimer = undefined;
        if (!entry.users && !entry.handoff) this.cancel(entry);
      }, 0);
    };
  }
  prepareClub(identity: ClubIdentity, globalView = false, { preloadProfile = false } = {}) {
    if (this.disposed) return;
    if (identity.name) this.remember(identity);
    const url = clubSnapshotUrl(identity.id, globalView);
    // Startup can prepare a saved club before its authoritative list arrives.
    // Selecting that club must consume the same read, even if it already finished.
    const prepared = this.entry(url);
    if (prepared.handoff && (prepared.pending || prepared.state.validated)) return;
    for (const [key, entry] of this.entries) {
      if (key !== url && !entry.users) { entry.handoff = false; this.cancel(entry); }
    }
    clearTimeout(this.entry(url).releaseTimer);
    this.entry(url).releaseTimer = undefined;
    this.entry(url).handoff = true;
    const read = this.read(url);
    const version = prepared.version;
    void read.then(() => {
      if (!preloadProfile || globalView || this.disposed || prepared.version !== version || !prepared.state.validated || (!prepared.handoff && !prepared.users)) return;
      const snapshot = prepared.state.data as { viewer?: { playerId?: string | null } } | null;
      const playerId = snapshot?.viewer?.playerId;
      if (!playerId) return;
      const profileUrl = `/api/users/${encodeURIComponent(playerId)}/stats?clubId=${encodeURIComponent(identity.id)}`;
      const profile = this.entry(profileUrl);
      if (profile.users || profile.handoff) return;
      clearTimeout(profile.releaseTimer);
      profile.releaseTimer = undefined;
      profile.handoff = true;
      void this.read(profileUrl).catch(() => {});
    }).catch(() => {});
  }
  cancelPreparedClub(id: string, globalView = false) {
    const entry = this.entry(clubSnapshotUrl(id, globalView));
    entry.handoff = false;
    if (!entry.users) this.cancel(entry);
    for (const [url, profile] of this.entries) {
      if (profile.handoff && !profile.users && clubIdFor(url) === id) {
        profile.handoff = false;
        this.cancel(profile);
      }
    }
  }
  private cancel(entry: Entry) {
    entry.pausedValidation = false;
    entry.version++;
    entry.controller?.abort();
    entry.controller = undefined;
    entry.pending = undefined;
    this.publish(entry, { ...entry.state, loading: false, validated: false });
  }
  async read(url: string): Promise<void> {
    if (this.disposed) return;
    const entry = this.entry(url);
    if (entry.pending) return entry.pending;
    if (entry.state.retryAt > Date.now()) return;
    const controller = new AbortController();
    const version = ++entry.version;
    entry.controller = controller;
    entry.pausedValidation = false;
    this.publish(entry, { ...entry.state, loading: true, validated: false, error: "", errorStatus: null });
    const current = () => !this.disposed && entry.version === version;
    entry.pending = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const data = await Promise.race([
          (async () => {
            const response = await fetch(url, { signal: controller.signal });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
              const error = new ApiError(body?.error || `Request failed (${response.status})`, response.status);
              Object.assign(error, { retryAt: retryTime(response.headers?.get("Retry-After") ?? null) });
              throw error;
            }
            return body;
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => { reject(new Error("Request timed out.")); controller.abort(); }, READ_TIMEOUT_MS);
          }),
        ]);
        if (!current()) return;
        entry.updatedAt = Date.now();
        if (data?.club?.id && data.club.name) this.remember(data.club);
        this.publish(entry, { data, error: "", errorStatus: null, validated: true, loading: false, retryAt: 0 });
      } catch (error) {
        if (!current()) return;
        const status = error instanceof ApiError ? error.status : null;
        const snapshotRead = new URL(url, "https://anti-selek.local").pathname.startsWith("/api/clubs/");
        if (status === 401 || status === 403 || (status === 404 && snapshotRead)) {
          this.evictClub(clubIdFor(url), url, status === 401, { error: error instanceof Error ? error.message : "Access unavailable.", errorStatus: status });
          if (status === 404) this.forgetIdentity(clubIdFor(url));
        } else if (status === 404) {
          this.publish(entry, empty());
        }
        const retryTime = error instanceof ApiError && "retryAt" in error ? Number(error.retryAt) : 0;
        const retryAt = retryTime > Date.now() ? retryTime : 0;
        this.publish(entry, { ...entry.state, error: error instanceof Error ? error.message : "Unable to load.", errorStatus: status, validated: false, loading: false, retryAt });
        if (retryAt > Date.now()) {
          clearTimeout(entry.retryTimer);
          entry.retryTimer = setTimeout(() => this.publish(entry, { ...entry.state, retryAt: 0 }), retryAt - Date.now());
        }
        throw error;
      } finally {
        clearTimeout(timer);
        if (current()) { entry.pending = undefined; entry.controller = undefined; }
      }
    })();
    return entry.pending;
  }
  refresh(url: string) {
    if (this.disposed) return Promise.resolve();
    const entry = this.entry(url);
    if (entry.refreshing) return entry.refreshing;
    if (entry.state.retryAt > Date.now()) return Promise.resolve();
    // Coalesce save callbacks, but discard a GET that began before the save.
    this.cancel(entry);
    entry.refreshing = Promise.resolve().then(() => this.read(url)).finally(() => { entry.refreshing = undefined; });
    return entry.refreshing;
  }
  /** Recovery must perform a new read; a suppressed or superseded read is not confirmation. */
  async refreshConfirmed(url: string): Promise<void> {
    if (this.disposed) throw new Error("Club access changed. Reload to continue.");
    const entry = this.entry(url);
    if (entry.state.retryAt > Date.now()) throw new ApiError("Please wait before refreshing again.", 429);
    this.cancel(entry);
    const request = this.read(url);
    const version = entry.version;
    await request;
    if (this.disposed || entry.version !== version || !entry.state.validated || !entry.state.data) {
      throw new Error("Club details changed. Refresh again.");
    }
  }
  refreshClub(id: string) {
    const reads: Promise<void>[] = [];
    for (const [url, entry] of this.entries) {
      if (clubIdFor(url) !== id) continue;
      if (entry.users) reads.push(this.refresh(url));
      else { this.cancel(entry); entry.updatedAt = 0; }
    }
    return Promise.all(reads);
  }
  update<T>(url: string, updater: (current: T) => T) {
    if (this.disposed) return;
    const entry = this.entry(url);
    this.cancel(entry);
    if (entry.state.data) {
      entry.updatedAt = Date.now();
      this.publish(entry, { ...empty(), data: updater(entry.state.data as T), validated: true });
    }
  }
  evictClub(id: string | null, except?: string, all = false, failure?: Pick<ReadState<unknown>, "error" | "errorStatus">) {
    for (const [url, entry] of this.entries) {
      if (!all && clubIdFor(url) !== id) continue;
      if (url !== except) this.cancel(entry);
      this.publish(entry, { ...empty(), ...failure, loading: url === except && entry.state.loading });
    }
  }
  deleteClub(id: string) { this.evictClub(id); this.forgetIdentity(id); }
  private loadIdentities() {
    if (this.storageLoaded || typeof sessionStorage === "undefined") return;
    this.storageLoaded = true;
    try {
      const values: unknown = JSON.parse(sessionStorage.getItem(this.storageKey) || "[]");
      if (Array.isArray(values)) for (const value of values) {
        if (value && typeof value.id === "string" && typeof value.name === "string") {
          this.identities.set(value.id, { id: value.id, name: value.name, avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : null });
        }
      }
    } catch {}
  }
  private saveIdentities() {
    try { sessionStorage.setItem(this.storageKey, JSON.stringify([...this.identities.values()].slice(-30))); } catch {}
    this.identityListeners.forEach(listener => listener());
  }
  remember(identity: ClubIdentity) {
    if (this.disposed) return;
    this.loadIdentities();
    const safe = { id: identity.id, name: identity.name, avatarUrl: identity.avatarUrl ?? null };
    const old = this.identities.get(safe.id);
    if (old?.name === safe.name && old?.avatarUrl === safe.avatarUrl) return;
    this.identities.set(safe.id, safe);
    this.saveIdentities();
  }
  identity(id: string) { if (this.disposed) return null; this.loadIdentities(); return this.identities.get(id) ?? null; }
  subscribeIdentity(listener: () => void) { this.identityListeners.add(listener); return () => { this.identityListeners.delete(listener); }; }
  private forgetIdentity(id: string | null) { if (id) this.identities.delete(id); this.saveIdentities(); }
  clear() {
    this.disposed = true;
    for (const entry of this.entries.values()) { clearTimeout(entry.releaseTimer); clearTimeout(entry.retryTimer); this.cancel(entry); this.publish(entry, empty()); }
    this.identities.clear();
    try { sessionStorage.removeItem(this.storageKey); } catch {}
    this.identityListeners.forEach(listener => listener());
  }
}
