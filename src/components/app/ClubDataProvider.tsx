"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useResource } from "@/components/prototype/api";
import { ClubReadStore, type ReadState } from "./clubReadStore";
import { AppStartupProvider } from "./AppStartup";

const Context = createContext<ClubReadStore | null>(null);
const idle: ReadState<never> = { data: null, error: "", errorStatus: null, validated: false, loading: false, retryAt: 0 };
const noopSubscribe = () => () => {};
export function ClubDataProvider({ children }: { children: ReactNode }) {
  const { data, status } = useSession();
  const user = data?.user;
  const scope = status !== "unauthenticated" && user?.id
    ? JSON.stringify([user.id, !!user.isQuickAccess, user.guestPlayerId ?? null, user.quickAccessClubId ?? null]) : null;
  const store = useMemo(() => scope ? new ClubReadStore(scope) : null, [scope]);
  const previous = useRef<ClubReadStore | null>(null);
  useEffect(() => {
    if (previous.current !== store) previous.current?.clear();
    previous.current = store;
  }, [store]);
  return <Context.Provider key={scope ?? "anonymous"} value={store}><AppStartupProvider>{children}</AppStartupProvider></Context.Provider>;
}
export function useClubDataStore() { return useContext(Context); }
export function useClubIdentity(id: string) {
  const store = useClubDataStore();
  const subscribe = useCallback((listener: () => void) => store?.subscribeIdentity(listener) ?? (() => {}), [store]);
  const get = useCallback(() => store?.identity(id) ?? null, [store, id]);
  return useSyncExternalStore(subscribe, get, () => null);
}
export function useClubResource<T>(url: string | null) {
  const store = useClubDataStore();
  // Standalone/legacy embeds without the application provider retain their existing reads.
  const local = useResource<T>(store ? null : url);
  const { refresh: localRefresh, update: localUpdate } = local;
  const subscribe = useCallback((listener: () => void) => store && url ? store.subscribe(url, listener) : noopSubscribe(), [store, url]);
  const get = useCallback(() => store && url ? store.get<T>(url) : idle, [store, url]);
  const state = useSyncExternalStore(subscribe, get, () => idle);
  useEffect(() => { if (store && url) return store.retain(url); }, [store, url]);
  const refresh = useCallback(() => store && url ? store.refresh(url) : localRefresh(), [store, url, localRefresh]);
  const update = useCallback((updater: (current: T) => T) => {
    if (store && url) store.update(url, updater); else localUpdate(updater);
  }, [store, url, localUpdate]);
  return store ? { ...state, refresh, update } : { ...local, validated: !!local.data && !local.error, loading: !local.data && !local.error, retryAt: 0 };
}
