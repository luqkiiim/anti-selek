"use client";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
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
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@fontsource/nunito-sans/800.css";
import "@fontsource/nunito-sans/900.css";
import "./prototype.css";
import "./browser.css";
export default function PrototypeApp() {
  const { data: auth, status } = useSession();
  const router = useRouter();
  const clubs = useResource<DashboardClub[]>(
    status === "authenticated" ? "/api/clubs" : null,
  );
  const [selected, setSelected] = useState<string | null>(null),
    [form, setForm] = useState(""),
    [value, setValue] = useState(""),
    [notice, setNotice] = useState("");
  const action = useAction(clubs.refresh);
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/signin?callbackUrl="+encodeURIComponent(location.pathname+location.search));
  }, [status, router]);
  const userId = auth?.user?.id;
  useEffect(() => {
    if (!clubs.data || !userId) return;
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
    try {
      const saved = localStorage.getItem("pc-club:" + userId);
      if (availableClubs.some((c) => c.id === saved)) setSelected(saved);
      else if (availableClubs.length === 1) setSelected(availableClubs[0].id);
    } catch {}
    });return()=>{cancelled=true};
  }, [clubs.data, userId]);
  function select(id: string) {
    setSelected(id);
    try {
      localStorage.setItem("pc-club:" + userId, id);
    } catch {}
  }
  function switchClub() {
    setSelected(null);
    try {
      localStorage.removeItem("pc-club:" + userId);
    } catch {}
  }
  const club = clubs.data?.find((c) => c.id === selected);
  return (
    <div className="prototype-root">
      {club ? (
        <Club key={club.id} club={club} onSwitch={switchClub} />
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
              <Avatar name={auth?.user?.name || ""} />
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
              {notice && <p role="status">{notice}</p>}
              {!clubs.data && !clubs.error && (
                <p role="status">Loading your clubs…</p>
              )}
              {clubs.data?.map((c, i) => (
                <button
                  className="club-choice"
                  key={c.id}
                  onClick={() => select(c.id)}
                >
                  <span className={"club-mark tone" + (i % 5)}>
                    <UsersThree size={28} weight="duotone" />
                  </span>
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
                  </span>
                  <CaretRight size={20} />
                </button>
              ))}
              {status === "authenticated" && !auth?.user?.isQuickAccess && (
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
      <Sheet open={!!form}
          title={
            form === "create"
              ? "Create club"
              : form === "join"
                ? "Join a club"
                : "Your account"
          }
          busy={action.busy}
          onClose={() => setForm("")}
        >
          <ErrorText error={action.error} />
          {form === "account" ? (
            <>
              <p>{auth?.user?.name}</p>
              <button className="primary" onClick={() => setForm("")}>
                Done
              </button>
              <button
                className="text-button"
                onClick={() => void signOut({ callbackUrl: "/signin" })}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <label className="field-label">
                {form === "create" ? "Club name" : "Invite link"}
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={
                    form === "create"
                      ? "Your club name"
                      : "Paste an invite link"
                  }
                />
              </label>
              <button
                className="primary"
                disabled={!value.trim()}
                onClick={() =>
                  void action.run(
                    async () => {
                      if (form === "join") {
                        let clubId = value.trim();
                        try {
                          clubId =
                            new URL(value).searchParams.get("join") || "";
                        } catch {}
                        const result = await api<{
                          status: string;
                          clubId: string;
                        }>("/api/clubs/join-requests", "POST", { clubId });
                        if (result.status === "MEMBER") select(result.clubId);
                        else
                          setNotice(
                            "Request sent. A club admin will review it.",
                          );
                      } else {
                        const result = await api<{ id: string }>(
                          "/api/clubs",
                          "POST",
                          { name: value.trim(), allowJoinRequests: true },
                        );
                        select(result.id);
                      }
                    },
                    () => setForm(""),
                  )
                }
              >
                {form === "create" ? "Create club" : "Request to join"}
              </button>
            </>
          )}
        </Sheet>
    </div>
  );
}
