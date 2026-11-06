"use client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { APP_NAVIGATION_EVENT, currentAppHref, registerAppDestination } from "@/lib/appNavigation";
import { AppLoading, useAppReady, useAppStarting } from "./AppStartup";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/nunito-sans/900.css";
import "@/components/product/product.css";
import "@/components/product/browser.css";
import "@/components/product/tablet.css";
import "./refinement.css";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(APP_NAVIGATION_EVENT, listener);
  return () => { window.removeEventListener("popstate", listener); window.removeEventListener(APP_NAVIGATION_EVENT, listener); };
}
export function useAppLocation() {
  return useSyncExternalStore(subscribe, currentAppHref, () => "/");
}
export function AppShell({ children, ready = false }: { children: ReactNode; ready?: boolean }) {
  const href = useAppLocation();
  const starting = useAppStarting();
  useAppReady(ready);
  useEffect(() => { registerAppDestination(); }, [href]);
  return <div className="product-root">
    <div className="app-launch-content" inert={starting} aria-hidden={starting || undefined}>{children}</div>
    {starting && <AppLoading />}
  </div>;
}
