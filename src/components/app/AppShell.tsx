"use client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { APP_NAVIGATION_EVENT, currentAppHref, registerAppDestination } from "@/lib/appNavigation";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/nunito-sans/900.css";
import "@/components/prototype/prototype.css";
import "@/components/prototype/browser.css";
import "@/components/prototype/tablet.css";
import "./refinement.css";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(APP_NAVIGATION_EVENT, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(APP_NAVIGATION_EVENT, listener); };
}
export function useAppLocation() {
  return useSyncExternalStore(subscribe, currentAppHref, () => "/");
}
export function AppShell({ children, specialist = false }: { children: ReactNode; specialist?: boolean }) {
  const href = useAppLocation();
  useEffect(() => { registerAppDestination(); }, [href]);
  return <div className={specialist ? "specialist-app" : "prototype-root"}>{children}</div>;
}
