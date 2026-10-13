"use client";
import { useEffect, useState } from "react";
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
import Club from "./Club";
import { BrowseClubs, type BrowsableClub } from "./BrowseClubs";
import { AccountSettings, type AccountUser } from "./AccountSettings";
import { JoinClubAdmission } from "./JoinClubAdmission";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/nunito-sans/900.css";
import "./prototype.css";
import "./browser.css";
import "./tablet.css";

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
  const accountReady = status !== "unauthenticated" && !!auth?.user?.id;
  const account = useResource<{ user: AccountUser }>(accountReady ? "/api/user/me" : null);
  const clubs = useResource<DashboardClub[]>(
    accountReady ? "/api/clubs" : null,
  );
  const [selected, setSelected] = useState<string | null>(null),
    [form, setForm] = useState(""),
    [value, setValue] = useState("");
  const [initialProfileClub, setInitialProfileClub] = useState<string | null>(null);
  const [globalClub, setGlobalClub] = useState<BrowsableClub | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [joinAccountOpen, setJoinAccountOpen] = useState(false);
  const action = useAction(clubs.refresh);
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/signin?callbackUrl="+encodeURIComponent(location.pathname+location.search));
  }, [status, router]);
  const userId = auth?.user?.id;
  useEffect(() => {
    if (!clubs.data || !userId || status !== "authenticated") return;
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
      const openProfile = params.get("tab") === "profile";
      params.delete("club");
      params.delete("tab");
      history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
      if (availableClubs.some(c => c.id === requestedClub)) {
        select(requestedClub);
        setInitialProfileClub(openProfile ? requestedClub : null);
      } else {
        switchClub();
      }
      return;
    }
    try {
      const saved = localStorage.getItem("pc-club:" + userId);
      if (availableClubs.some((c) => c.id === saved)) setSelected(saved);
      else if (availableClubs.length === 1) setSelected(availableClubs[0].id);
    } catch {}
    });return()=>{cancelled=true};
    // Selection changes only on authoritative club reads or a consumed link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubs.data, userId, status]);
  function select(id: string) {
    setInitialProfileClub(null);
    setGlobalClub(null);
    setSelected(id);
    try {
      localStorage.setItem("pc-club:" + userId, id);
    } catch {}
  }
  function switchClub() {
    setInitialProfileClub(null);
    setGlobalClub(null);
    setSelected(null);
    try {
      localStorage.removeItem("pc-club:" + userId);
    } catch {}
  }
  const club = clubs.data?.find((c) => c.id === selected);
  return (
    <div className="prototype-root">
      {globalClub ? <Club key={`global:${globalClub.id}`} globalView club={globalClub} onSwitch={switchClub} onAccountSaved={account.refresh} onClubsChanged={clubs.refresh} /> : club ? (
        <Club key={club.id} club={club} initialPage={initialProfileClub === club.id ? "profile" : "club"} onSwitch={switchClub} onAccountSaved={account.refresh} onClubsChanged={clubs.refresh} />
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
                <p>Choose your club to get started.</p>
              </div>
              <ErrorText error={clubs.error} />
              {!clubs.data && !clubs.error && (
                <p role="status">Loading your clubs…</p>
              )}
              {clubs.data?.map((c, i) => (
                <button
                  className="club-choice"
                  key={c.id}
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
                      · {c.membersCount} players
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
      {auth?.user?.canBrowseAllClubs && <BrowseClubs open={browseOpen} onClose={() => setBrowseOpen(false)} onSelect={club => { setGlobalClub(club); setBrowseOpen(false); }} />}
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
                      select(result.id);
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
        onOpenClub={id => {
          void Promise.allSettled([account.refresh(), clubs.refresh()]);
          select(id);
          setForm("");
        }}
      />}
    </div>
  );
}
