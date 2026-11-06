import { getSafeCallbackUrl } from "./authCallback";
import { getClubTab, getSessionTab } from "./appNavigation";

/** Compatibility links select a current screen; they never select a second UI. */
export function normalizeProductHref(href: string) {
  // An outgoing screen can still observe the login URL before it unmounts.
  // Only normalize routes owned by these controllers; keep auth callbacks intact.
  if (!/^\/(?:community|club|session)\//.test(href)) return href;
  const url = new URL(getSafeCallbackUrl(href), "https://anti-selek.local");
  url.pathname = url.pathname.replace(/^\/community\//, "/club/");
  const tools = url.searchParams.get("tools");
  url.searchParams.delete("tools");
  const tab = url.searchParams.get("tab");
  if (/^\/club\/[^/]+\/admin$/.test(url.pathname)) {
    if (tab === "members") url.searchParams.set("tab", "players");
    else if (tab === "claims") url.searchParams.set("tab", "requests");
    else if (!tab && tools === "practice") url.searchParams.set("tab", "settings");
  } else if (/^\/club\/[^/]+$/.test(url.pathname)) {
    if (tab) url.searchParams.set("tab", getClubTab(tab));
    else if (tools) url.searchParams.set("tab", tools === "practice" ? "sessions" : "setup");
  } else if (/^\/session\/[^/]+$/.test(url.pathname)) {
    if (tab) url.searchParams.set("tab", getSessionTab(tab).toLowerCase());
    if (tools === "practice") url.searchParams.set("practice", "1");
  }
  return url.pathname + (url.searchParams.size ? `?${url.searchParams}` : "") + url.hash;
}
