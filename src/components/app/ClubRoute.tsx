"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Club from "@/components/product/Club";
import { AppShell, useAppLocation } from "./AppShell";
import { backInApp, navigateApp } from "@/lib/appNavigation";
import { withCallbackUrl } from "@/lib/authCallback";
import { useClubIdentity } from "./ClubDataProvider";
import { normalizeProductHref } from "@/lib/productNavigation";

export default function ClubRoute({ admin = false }: { admin?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: auth, status } = useSession();
  const identity = useClubIdentity(id);
  const href = useAppLocation();
  const normalizedHref = normalizeProductHref(href);
  useEffect(() => { if (normalizedHref !== href) navigateApp(router, normalizedHref, true); }, [href, normalizedHref, router]);
  const params = new URL(normalizedHref, "https://anti-selek.local").searchParams;
  useEffect(() => {
    if (status === "unauthenticated") router.replace(withCallbackUrl("/signin", href));
  }, [status, router, href]);
  if (status === "unauthenticated" || !auth?.user?.id) return <AppShell><div className="pc-app"><p role="status" className="route-loading">Loading club…</p></div></AppShell>;
  return <AppShell><Club
    key={`${id}:${params.getAll("view").includes("global")}`}
    club={{ id, name: identity?.name ?? "", avatarUrl: identity?.avatarUrl, membersCount: 0, sessionsCount: 0, isPasswordProtected: false }}
    globalView={params.getAll("view").includes("global")}
    initialPage={admin ? "admin" : "club"}
    onRoute={(target, replace) => navigateApp(router, target, replace)}
    onRouteBack={fallback => backInApp(router, fallback)}
    onSwitch={() => { try { sessionStorage.setItem("anti-selek:show-chooser", "1"); } catch {} navigateApp(router, "/?chooser=1"); }}
    onAccountSaved={async () => {}}
    onClubsChanged={async () => {}}
  /></AppShell>;
}
export function ClubAdminRoute() { return <ClubRoute admin />; }
