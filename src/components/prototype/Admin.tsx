"use client";
import { useState } from "react";
import {
  ArrowLeft,
  UsersThree,
  CalendarBlank,
  UserCircle,
  MagnifyingGlass,
  Plus,
  LinkSimple,
  PencilSimple,
  Check,
} from "@phosphor-icons/react";
import type { ClubPageMember } from "@/components/club/clubTypes";
import type { Snapshot } from "./Club";
import { api, useAction, useResource } from "./api";
import { Avatar, Sheet, ErrorText } from "./Primitives";
export default function Admin({
  snapshot,
  refresh,
  onBack,
  onNavigate,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<unknown>;
  onBack: () => void;
  onNavigate: (p: string) => void;
}) {
  const { club, clubMembers: players, claimRequests = [] } = snapshot;
  const [tab, setTab] = useState("Players"),
    [query, setQuery] = useState(""),
    [sheet, setSheet] = useState("");
  const [edit, setEdit] = useState<ClubPageMember | null>(null),
    [name, setName] = useState(""),
    [rating, setRating] = useState("1000"),
    [membership, setMembership] = useState("CORE"),
    [clubName, setClubName] = useState(club.name);
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
    let player = edit;
    if (!player) {
      player = await api<ClubPageMember>(endpoint + "/members", "POST", {
        name: name.trim(),
        status: membership,
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
    <div className="pc-app">
      <header className="pc-header">
        <button className="icon-button" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={23} />
        </button>
        <div>
          <strong>Manage club</strong>
          <small>{club.name}</small>
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
              <label className="search">
                <MagnifyingGlass size={20} />
                <input
                  aria-label="Search players"
                  placeholder="Search players by name"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="button-pair">
                <button className="primary" onClick={() => editor(null)}>
                  <Plus size={20} />
                  Add player
                </button>
                <button
                  className="secondary"
                  onClick={() => setSheet("invite")}
                >
                  <LinkSimple size={19} />
                  Invite link
                </button>
              </div>
              <div className="roster">
                {players
                  .filter((p) =>
                    p.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((p) => (
                    <div className="person" key={p.id}>
                      <Avatar name={p.name} url={p.avatarUrl} />
                      <span className="person-info">
                        <strong>{p.name}</strong>
                        <small>
                          {p.isOwner
                            ? "Owner"
                            : p.status === "OCCASIONAL"
                              ? "Occasional"
                              : p.isClaimed
                                ? "Member"
                                : "No account"}{" "}
                          · {p.elo}
                        </small>
                      </span>
                      <button
                        className="icon-button"
                        aria-label={"Edit " + p.name}
                        onClick={() => editor(p)}
                      >
                        <PencilSimple size={20} />
                      </button>
                    </div>
                  ))}
              </div>
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
            <>
              <h2>Club settings</h2>
              <label className="field-label">
                Club name
                <input
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                />
              </label>
              <button
                disabled={action.busy || !joins.data}
                role="switch"
                aria-checked={joins.data?.allowJoinRequests || false}
                className="toggle-row"
                onClick={() =>
                  void action.run(() =>
                    api(endpoint + "/join-requests", "PATCH", {
                      allowJoinRequests: !joins.data?.allowJoinRequests,
                    }),
                  )
                }
              >
                <span>
                  <strong>Allow join requests</strong>
                  <small>New players can request access</small>
                </span>
                <span
                  className={
                    "switch " + (joins.data?.allowJoinRequests ? "on" : "")
                  }
                />
              </button>
              <button
                className="primary"
                disabled={action.busy || clubName.trim().length < 3}
                onClick={() =>
                  void action.run(() =>
                    api(endpoint, "PATCH", { name: clubName.trim() }),
                  )
                }
              >
                Save changes
              </button>
              <details>
                <summary>Advanced settings</summary>
                <p>
                  Connect profiles across clubs only when both clubs confirm
                  they belong to the same person.
                </p>
                <button
                  className="secondary"
                  onClick={() => setSheet("identity")}
                >
                  Connect player profiles
                </button>
              </details>
            </>
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Main navigation">
        {[
          { p: "club", label: "Club", Icon: UsersThree },
          { p: "sessions", label: "Sessions", Icon: CalendarBlank },
          { p: "profile", label: "Profile", Icon: UserCircle },
        ].map((n) => (
          <button
            key={n.p}
            className={n.p === "club" ? "active" : ""}
            onClick={() => onNavigate(n.p)}
          >
            <n.Icon size={25} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
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
                  <option value="CORE">Member</option>
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
