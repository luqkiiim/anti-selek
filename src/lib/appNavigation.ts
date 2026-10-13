import { getSafeCallbackUrl } from "./authCallback";

export type ClubTab = "club" | "sessions" | "rankings" | "profile" | "setup";
const clubAliases: Record<string, ClubTab> = { overview: "club", tournaments: "sessions", leaderboard: "rankings", host: "setup" };
export function getClubTab(value: string | null): ClubTab {
  return value && ["club", "sessions", "rankings", "profile", "setup"].includes(value)
    ? value as ClubTab : clubAliases[value ?? ""] ?? "club";
}
export function getSessionTab(value: string | null) {
  return value === "players" ? "Players" : value === "standings" ? "Standings" : "Courts";
}
export function clubHref(id: string, tab = "club", globalView = false) {
  const params = new URLSearchParams({ tab });
  if (globalView) params.set("view", "global");
  return `/club/${encodeURIComponent(id)}?${params}`;
}
export function sessionHref(code: string, globalClubId?: string, tab = "courts") {
  const params = new URLSearchParams({ tab });
  if (globalClubId) { params.set("view", "global"); params.set("clubId", globalClubId); }
  return `/session/${encodeURIComponent(code)}?${params}`;
}
export function changeAppQuery(href: string, changes: Record<string, string | string[] | null>) {
  const url = new URL(getSafeCallbackUrl(href), "https://anti-selek.local");
  for (const [key, value] of Object.entries(changes)) {
    url.searchParams.delete(key);
    for (const item of value === null ? [] : Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
  }
  return url.pathname + (url.searchParams.size ? `?${url.searchParams}` : "") + url.hash;
}

export const APP_NAVIGATION_EVENT = "anti-selek:navigation";
export function currentAppHref() { return location.pathname + location.search + location.hash; }
type Router = { push: (href: string, options?: { scroll: boolean }) => void; replace: (href: string, options?: { scroll: boolean }) => void; back: () => void };

export function navigateApp(router: Router, href: string, replace = false) {
  const target = getSafeCallbackUrl(href);
  const from = currentAppHref();
  if (target === from) return;
  if (new URL(target, location.origin).pathname === location.pathname) {
    const state = { ...history.state, antiSelekFrom: replace ? history.state?.antiSelekFrom : from };
    history[replace ? "replaceState" : "pushState"](state, "", target);
    window.dispatchEvent(new Event(APP_NAVIGATION_EVENT));
  } else {
    try { sessionStorage.setItem("anti-selek:destination", JSON.stringify({ target, from, at: Date.now(), replace })); } catch {}
    router[replace ? "replace" : "push"](target, { scroll: false });
  }
}
export function registerAppDestination() {
  try {
    const value = sessionStorage.getItem("anti-selek:destination");
    if (!value) return;
    const destination = JSON.parse(value);
    if (destination.target !== currentAppHref()) return;
    sessionStorage.removeItem("anti-selek:destination");
    if (Date.now() - destination.at < 30_000) {
      history.replaceState({ ...history.state, antiSelekFrom: destination.replace ? history.state?.antiSelekFrom : getSafeCallbackUrl(destination.from) }, "", currentAppHref());
    }
  } catch {}
}
export function backInApp(router: Router, fallback: string) {
  if (history.state?.antiSelekFrom) router.back();
  else navigateApp(router, fallback, true);
}
