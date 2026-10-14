"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  UsersThree,
  Plus,
  LinkSimple,
  CaretRight,
} from "@phosphor-icons/react";
import type { DashboardClub } from "@/components/dashboard/dashboardTypes";
import { api, useResource, useAction } from "./api";
import { Avatar, Sheet, ErrorText } from "./Primitives";
import { useClubDataStore } from "@/components/app/ClubDataProvider";
import { ClubHeader } from "@/components/app/ClubHeader";
import type { ClubIdentity } from "@/components/app/clubReadStore";
import { AppShell } from "@/components/app/AppShell";
import { clubHref, getClubTab, navigateApp } from "@/lib/appNavigation";
import { BrowseClubs } from "./BrowseClubs";
import { AccountSettings, type AccountUser } from "./AccountSettings";
import { JoinClubAdmission } from "./JoinClubAdmission";


function ClubMark({ url, tone }: { url?: string | null; tone: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className={`club-mark tone${tone}`} aria-hidden="true">
      {url && failedUrl !== url ? (
        <Image src={url} alt="" width={60} height={60} unoptimized
          className="club-mark-image" onError={() => setFailedUrl(url)} />
      ) : <UsersThree size={28} weight="duotone" />}
    </span>
  );
}

export default function PrototypeApp() {
  const { data: auth, status } = useSession();
  const router = useRouter();
  const clubStore = useClubDataStore();
  const destination = useRef<string | null>(null);
  const accountReady = status !== "unauthenticated" && !!auth?.user?.id;
  const account = useResource<{ user: AccountUser }>(accountReady ? "/api/user/me" : null);
  const clubs = useResource<DashboardClub[]>(
    accountReady ? "/api/clubs" : null,
  );
  const [selected, setSelected] = useState<(ClubIdentity & { globalView?: boolean }) | null>(null),
    [form, setForm] = useState(""),
    [value, setValue] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [joinAccountOpen, setJoinAccountOpen] = useState(false);
  const action = useAction(clubs.refresh);
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/signin?callbackUrl="+encodeURIComponent(location.pathname+location.search));
  }, [status, router]);
  const userId = auth?.user?.id;
  useEffect(() => {
    if (!clubs.data || !userId || status !== "authenticated" || destination.current) return;
    const availableClubs=clubs.data;
    let cancelled=false;
    void Promise.resolve().then(()=>{if(cancelled)return;
    const params = new URLSearchParams(location.search);
    const invite = params.get("join");
    if (invite) {
      setForm("join");
      setValue(invite);
      history.replaceState(null, "", "/");
      return;
    }
    const requestedClub = params.get("club");
    if (requestedClub !== null) {
      const requestedTab = getClubTab(params.get("tab"));
      params.delete("club");
      params.delete("tab");
      history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
      if (params.getAll("view").includes("global")) {
        if (auth?.user?.canBrowseAllClubs) select(requestedClub, requestedTab, true, undefined, true);
        else switchClub();
        return;
      }
      if (availableClubs.some(c => c.id === requestedClub)) {
        select(requestedClub, requestedTab, true);
      } else {
        switchClub();
      }
      return;
    }
    try {
      if (params.get("chooser") === "1" || history.state?.antiSelekChooser) return;
      if (sessionStorage.getItem("anti-selek:show-chooser")) { sessionStorage.removeItem("anti-selek:show-chooser"); return; }
      const saved = localStorage.getItem("pc-club:" + userId);
      if (availableClubs.some((c) => c.id === saved)) select(saved!, "club", true);
      else if (availableClubs.length === 1) select(availableClubs[0].id, "club", true);
    } catch {}
    });return()=>{cancelled=true};
    // Selection changes only on authoritative club reads or a consumed link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubs.data, userId, status, auth?.user?.canBrowseAllClubs]);
  function select(id: string, tab = "club", replace = false, known?: ClubIdentity, globalView = false) {
    const identity = known ?? clubs.data?.find(c => c.id === id) ?? clubStore?.identity(id) ?? { id, name: "" };
    destination.current = id;
    setSelected({ ...identity, globalView });
    clubStore?.prepareClub(identity, globalView);
    if (!replace) history.replaceState({ ...history.state, antiSelekChooser: true }, "", location.href);
    navigateApp(router, clubHref(id, tab, globalView), replace);
    try {
      localStorage.setItem("pc-club:" + userId, id);
    } catch {}
  }
  function switchClub() {
    destination.current = null;
    setSelected(null);
    try {
      localStorage.removeItem("pc-club:" + userId);
    } catch {}
  }
  function prefetch(id: string, globalView = false) { router.prefetch?.(clubHref(id, "club", globalView)); }
  function cancelSelection() {
    if (selected) clubStore?.cancelPreparedClub(selected.id, selected.globalView);
    switchClub();
    router.replace("/?chooser=1", { scroll: false });
  }
  return (
    <AppShell>
      {selected && status !== "unauthenticated" ? (
        <div className="pc-app"><ClubHeader identity={selected} globalView={selected.globalView} onSwitch={cancelSelection} /><div className="pc-scroll"><main className="pc-content"><p role="status">Loading club…</p></main></div></div>
      ) : (
        <div className="pc-app">
          <header className="pc-header">
            <span className="brand">
              Anti-Selek<span>.</span>
            </span>
            <button
              className="icon-button"
              aria-label="Account"
              onClick={() => setForm("account")}
            >
              <Avatar name={account.data?.user.name || auth?.user?.name || ""} url={account.data?.user.avatarUrl} />
            </button>
          </header>
          <div className="pc-scroll">
            <main className="pc-content chooser">
              <div className="chooser-intro">
                <span className="eyebrow">YOUR CLUBS</span>
                <h1>
                  Where are we
                  <br />
                  playing?
                </h1>
              </div>
              <ErrorText error={clubs.error} />
              {!clubs.data && !clubs.error && (
                <p role="status">Loading your clubs…</p>
              )}
              {clubs.data?.map((c, i) => (
                <button
                  className="club-choice"
                  key={c.id}
                  onPointerEnter={() => prefetch(c.id)}
                  onFocus={() => prefetch(c.id)}
                  onPointerDown={() => prefetch(c.id)}
                  onClick={() => select(c.id)}
                >
                  <ClubMark url={c.avatarUrl} tone={i % 5} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.viewerIsOwner
                        ? "Owner"
                        : c.role === "ADMIN"
                          ? "Admin"
                          : c.role === "STAFF"
                            ? "Staff"
                            : "Member"}{" "}
                      · {c.membersCount} {c.membersCount === 1 ? "player" : "players"}
                    </small>
                    {c.sessionStatus === "ACTIVE" ? (
                      <span className="club-session-status is-live">Live session</span>
                    ) : c.sessionStatus === "WAITING" ? (
                      <span className="club-session-status is-standby">Standby session</span>
                    ) : null}
                  </span>
                  <CaretRight size={20} />
                </button>
              ))}
              {auth?.user?.canBrowseAllClubs && <button className="secondary" onClick={() => setBrowseOpen(true)}>Browse clubs</button>}
              {status === "authenticated" && account.data && !account.data.user.isQuickAccess && (
                <div className="chooser-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      setForm("create");
                      setValue("");
                    }}
                  >
                    <Plus size={19} />
                    Create club
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setForm("join");
                      setValue("");
                    }}
                  >
                    <LinkSimple size={19} />
                    Join a club
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>
      )}
      {auth?.user?.canBrowseAllClubs && <BrowseClubs open={browseOpen} onClose={() => setBrowseOpen(false)} onPrepare={id => prefetch(id, true)} onSelect={club => { setBrowseOpen(false); select(club.id, "club", false, club, true); }} />}
      <AccountSettings open={form === "account" || joinAccountOpen} onClose={() => {
        if (joinAccountOpen) void account.refresh().catch(() => {}).finally(() => setJoinAccountOpen(false));
        else setForm("");
      }} onSaved={async () => { await account.refresh(); if (joinAccountOpen) setJoinAccountOpen(false); }} />
      <Sheet open={!!form && form !== "account" && form !== "join"}
          title="Create club"
          busy={action.busy}
          onClose={() => setForm("")}
        >
          <ErrorText error={action.error} />
            <>
              <label className="field-label">
                Club name
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Your club name"
                />
              </label>
              <button
                className="primary"
                disabled={!value.trim()}
                onClick={() =>
                  void action.run(
                    async () => {
                      const result = await api<{ id: string }>(
                        "/api/clubs",
                        "POST",
                        { name: value.trim(), allowJoinRequests: true },
                      );
                      select(result.id, "club", false, { id: result.id, name: value.trim() });
                    },
                    () => setForm(""),
                  )
                }
              >
                Create club
              </button>
            </>
        </Sheet>
      {form === "join" && <JoinClubAdmission
        open={!joinAccountOpen}
        accountReady={!!account.data}
        onCompleteAccountDetails={() => setJoinAccountOpen(true)}
        initialValue={value}
        accountName={account.data?.user.name || auth?.user?.name || ""}
        accountGender={account.data?.user.gender || ""}
        onClose={() => setForm("")}
        onOpenClub={(id, identity) => {
          void Promise.allSettled([account.refresh(), clubs.refresh()]);
          select(id, "club", false, identity);
          setForm("");
        }}
      />}
    </AppShell>
  );
}
