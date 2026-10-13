"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Club from "@/components/prototype/Club";
import { AppShell, useAppLocation } from "./AppShell";
import { backInApp, clubHref, navigateApp } from "@/lib/appNavigation";
import { withCallbackUrl } from "@/lib/authCallback";
const LegacyClubPage = dynamic(() => import("@/features/club-page/ClubPage"));
const LegacyClubAdminPage = dynamic(() => import("@/features/club-admin-page/ClubAdminPage"));

export default function ClubRoute({ admin = false }: { admin?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const href = useAppLocation();
  const params = new URL(href, "https://anti-selek.local").searchParams;
  useEffect(() => {
    if (status === "unauthenticated") router.replace(withCallbackUrl("/signin", href));
  }, [status, router, href]);
  if (status !== "authenticated") return <AppShell><div className="pc-app"><p role="status" className="route-loading">Loading club…</p></div></AppShell>;
  if (!params.getAll("view").includes("global") && (params.get("tools") === "advanced" || params.get("tools") === "practice")) {
    return <AppShell specialist><a className="specialist-back" href={clubHref(id)}>Back to club</a>{admin ? <LegacyClubAdminPage /> : <LegacyClubPage />}</AppShell>;
  }
  return <AppShell><Club
    club={{ id, name: "Club", membersCount: 0, sessionsCount: 0, isPasswordProtected: false }}
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
