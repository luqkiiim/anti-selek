"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const Context = createContext<{ starting: boolean; finish: () => void } | null>(null);

/** Survives the chooser-to-club handoff; resets with the authenticated identity. */
export function AppStartupProvider({ children }: { children: ReactNode }) {
  const [starting, setStarting] = useState(true);
  const finish = useCallback(() => setStarting(false), []);
  const value = useMemo(() => ({ starting, finish }), [starting, finish]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppStarting() { return useContext(Context)?.starting ?? false; }

export function useAppReady(ready: boolean) {
  const finish = useContext(Context)?.finish;
  useEffect(() => { if (ready) finish?.(); }, [ready, finish]);
}

export function AppLoading() {
  return <div className="app-launch-screen" role="status" aria-label="Loading Anti-Selek">
    <span className="app-launch-brand" aria-hidden="true">Anti-Selek<span>.</span></span>
    <span className="app-launch-indicator" aria-hidden="true" />
  </div>;
}
