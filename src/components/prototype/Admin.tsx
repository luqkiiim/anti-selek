"use client";
import { useState } from "react";
import { MainNav } from "./MainNav";
import {
  ArrowLeft,
  MagnifyingGlass,
  Plus,
  LinkSimple,
  PencilSimple,
  Check,
} from "@phosphor-icons/react";
import type { ClubPageMember } from "@/components/club/clubTypes";
import type { Snapshot } from "./Club";
import { api, useAction, useResource } from "./api";
import { ClubSettings } from "./ClubSettings";
import "./manage-club.css";
import { Avatar, Sheet, ErrorText } from "./Primitives";
export default function Admin({
  snapshot,
  refresh,
  onBack,
  onNavigate,
  onDeleted,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<unknown>;
  onBack: () => void;
  onNavigate: (p: string) => void;
  onDeleted: () => Promise<void>;
}) {
  const { club, clubMembers: players, claimRequests = [] } = snapshot;
  const [tab, setTab] = useState("Players"),
    [query, setQuery] = useState(""),
    [sheet, setSheet] = useState("");
  const [edit, setEdit] = useState<ClubPageMember | null>(null),
    [name, setName] = useState(""),
    [rating, setRating] = useState("1000"),
    [membership, setMembership] = useState("CORE"),
    [gender, setGender] = useState("");
  const joins = useResource<{
    allowJoinRequests: boolean;
    requests: { id: string; name: string }[];
  }>("/api/clubs/" + club.id + "/join-requests");
  const action = useAction(async () => {
    await Promise.all([refresh(), joins.refresh()]);
  });
  const endpoint = "/api/clubs/" + club.id;
  const requests = claimRequests.filter((r) => r.status === "PENDING");
  const invite =
    typeof location === "undefined"
      ? ""
      : location.origin + "/?join=" + encodeURIComponent(club.id);
  function editor(player: ClubPageMember | null) {
    setEdit(player);
    setName(player?.name || "");
    setRating(String(player?.elo ?? 1000));
    setMembership(player?.status || "CORE");
    setGender(player?.gender || "");
    setSheet("player");
    action.setError("");
  }
  async function save() {
    if (
      name.trim().length < 2 ||
      !rating.trim() ||
      !Number.isInteger(Number(rating)) ||
      Number(rating) < 0 ||
      Number(rating) > 5000
    )
      throw new Error("Enter a name and a whole rating from 0 to 5000.");
    if (!edit && !["MALE", "FEMALE"].includes(gender)) throw new Error("Choose the player’s gender.");
    let player = edit;
    if (!player) {
      player = await api<ClubPageMember>(endpoint + "/members", "POST", {
        name: name.trim(),
        status: membership,
        gender,
      });
      setEdit(player);
    } else
      await api(endpoint + "/members/" + player.id, "PATCH", {
        ...(!player.isClaimed && name.trim() !== player.name
          ? { name: name.trim() }
          : {}),
        status: membership,
      });
    if (Number(rating) !== player.elo)
      await api(endpoint + "/members/" + player.id + "/rating", "POST", {
        rating: Number(rating),
        expectedRating: player.elo,
        reason: "Manual rating change from player editor",
      });
  }
  return (
    <div className="pc-app manage-club">
      <header className="pc-header">
        <button className="icon-button" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={23} />
        </button>
        <div>
          <strong>Manage club</strong>
        </div>
        <span />
      </header>
      <div className="local-tabs" role="tablist">
        {["Players", "Requests", "Settings"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "Requests" &&
              requests.length + (joins.data?.requests.length || 0) > 0 && (
                <span className="count">
                  {requests.length + (joins.data?.requests.length || 0)}
                </span>
              )}
          </button>
        ))}
      </div>
      <div className="pc-scroll with-tabs">
        <main className="pc-content">
          <ErrorText error={action.error || joins.error} />
          {tab === "Players" ? (
            <>
              <button className="manage-club-identity" onClick={() => setTab("Settings")} aria-label="Edit club details"><Avatar large name={club.name} url={club.avatarUrl} /><span><strong>{club.name}</strong><small>{players.length} players</small></span><PencilSimple size={19} /></button>
              <label className="search">
                <MagnifyingGlass size={20} />
                <input
                  aria-label="Search players"
                  placeholder="Search players by name"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="manage-player-action"><button className="primary" onClick={() => editor(null)}><Plus size={20} />Add player</button></div>
              {(["CORE", "OCCASIONAL"] as const).map(status => {
                const group = players.filter(p => p.status === status && p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || a.id.localeCompare(b.id));
                return group.length ? <section className="manage-player-group" key={status} aria-label={status === "CORE" ? "Core members" : "Occasional members"}>
                  <h3>{status === "CORE" ? "Core" : "Occasional"}<span>{group.length}</span></h3>
                  <div className="roster">{group.map(p => <div className="person" key={p.id}>
                    <Avatar name={p.name} url={p.avatarUrl} /><span className="person-info"><strong>{p.name}</strong><small>{p.elo} rating</small></span>
                    <button className="icon-button" aria-label={"Edit " + p.name} onClick={() => editor(p)}><PencilSimple size={20} /></button>
                  </div>)}</div>
                </section> : null;
              })}
              {!players.some(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && <p className="muted">No players found.</p>}
            </>
          ) : tab === "Requests" ? (
            <>
              <h2>Requests</h2>
              <p className="muted">Review who joins your club.</p>
              {joins.data?.requests.map((r) => (
                <div className="card" key={r.id}>
                  <strong>{r.name} wants to join the club</strong>
                  <div className="button-pair spaced">
                    <button
                      className="primary"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(() =>
                          api(endpoint + "/join-requests/" + r.id, "PATCH", {
                            action: "APPROVE",
                          }),
                        )
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="secondary"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(() =>
                          api(endpoint + "/join-requests/" + r.id, "PATCH", {
                            action: "REJECT",
                          }),
                        )
                      }
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
              {requests.map((r) => (
                <div className="card" key={r.id}>
                  <strong>
                    {r.requesterName} wants to connect to {r.targetName}
                  </strong>
                  <div className="button-pair spaced">
                    <button
                      disabled={action.busy}
                      className="primary"
                      onClick={() =>
                        void action.run(() =>
                          api(endpoint + "/claim-requests/" + r.id, "PATCH", {
                            action: "APPROVE",
                          }),
                        )
                      }
                    >
                      Approve
                    </button>
                    <button
                      disabled={action.busy}
                      className="secondary"
                      onClick={() =>
                        void action.run(() =>
                          api(endpoint + "/claim-requests/" + r.id, "PATCH", {
                            action: "REJECT",
                          }),
                        )
                      }
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
              {!requests.length && !joins.data?.requests.length && (
                <div className="empty">
                  <Check size={32} />
                  <h3>All caught up</h3>
                  <p>No pending requests.</p>
                </div>
              )}
            </>
          ) : (
            <ClubSettings club={club} allowJoinRequests={joins.data?.allowJoinRequests} busy={action.busy} onInvite={() => setSheet("invite")} onToggleJoins={() => void action.run(() => api(endpoint + "/join-requests", "PATCH", { allowJoinRequests: !joins.data?.allowJoinRequests }))} refresh={refresh} onDeleted={onDeleted} />
          )}
        </main>
      </div>
      <MainNav active="club" onNavigate={onNavigate} />
      <Sheet open={!!sheet}
          title={
            sheet === "player"
              ? edit
                ? "Edit " + edit.name
                : "Add player"
              : sheet === "remove"
                ? "Remove player?"
                : sheet === "invite"
                  ? "Invite to your club"
                  : "Connect profiles"
          }
          busy={action.busy}
          onClose={() => setSheet("")}
        >
          <ErrorText error={action.error} />
          {sheet === "player" ? (
            <>
              <label className="field-label">
                Name
                <input
                  value={name}
                  disabled={edit?.isClaimed}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {edit?.isClaimed && (
                <small className="muted">
                  Account holders manage their own name.
                </small>
              )}
              {!edit && <label className="field-label">Gender<select aria-label="Gender" value={gender} onChange={e => setGender(e.target.value)} required><option value="" disabled>Choose gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>}
              <label className="field-label">
                Rating
                <input
                  type="number"
                  min="0"
                  max="5000"
                  step="1"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                />
              </label>
              <label className="field-label">
                Membership
                <select
                  value={membership}
                  onChange={(e) => setMembership(e.target.value)}
                >
                  <option value="CORE">Core</option>
                  <option value="OCCASIONAL">Occasional</option>
                </select>
              </label>
              <button
                className="primary"
                onClick={() => void action.run(save, () => setSheet(""))}
              >
                {edit ? "Save changes" : "Add player"}
              </button>
              {edit && !edit.isOwner && (
                <button
                  className="danger text-button"
                  onClick={() => setSheet("remove")}
                >
                  Remove player
                </button>
              )}
            </>
          ) : sheet === "remove" ? (
            <>
              <p>
                Remove {edit?.name} from {club.name}?
              </p>
              <button
                className="primary"
                onClick={() =>
                  void action.run(
                    () => api(endpoint + "/members/" + edit?.id, "DELETE"),
                    () => setSheet(""),
                  )
                }
              >
                Remove player
              </button>
              <button
                className="text-button"
                onClick={() => setSheet("player")}
              >
                Keep player
              </button>
            </>
          ) : sheet === "invite" ? (
            <>
              <p>Share access to {club.name}.</p>
              <div className="sample-link">{invite}</div>
              <button
                className="primary"
                onClick={() =>
                  void action.run(
                    () => navigator.clipboard.writeText(invite),
                    () => setSheet(""),
                  )
                }
              >
                <LinkSimple size={19} />
                Copy invite link
              </button>
              <p className="muted">An admin approves each request.</p>
            </>
          ) : (
            <>
              <p>Find a player without an account.</p>
              {players
                .filter((p) => !p.isClaimed)
                .map((p) => (
                  <button
                    key={p.id}
                    className="secondary"
                    onClick={() => {
                      setTab("Players");
                      setQuery(p.name);
                      setSheet("");
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              <p className="muted">
                Cross-club connection is not available in this interface yet.
              </p>
            </>
          )}
        </Sheet>
    </div>
  );
}
