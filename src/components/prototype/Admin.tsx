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
import { getMixedSideOverrideOptionForGender, getStoredPartnerPreference, normalizeMixedSideOverrideForGender } from "@/lib/mixedSide";
import type { Snapshot } from "./Club";
import { api, useAction, useResource } from "./api";
import type { AdminAdmissionList, AdmissionCandidate, AdmissionRequest } from "./admissionTypes";
import { MemberPhotoEditor } from "./MemberPhotoEditor";
import { ClubSettings } from "./ClubSettings";
import "./manage-club.css";
import { Avatar, Sheet, ErrorText } from "./Primitives";
export default function Admin({
  snapshot,
  refresh,
  onBack,
  onNavigate,
  onDeleted,
  onOpenProfile,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<unknown>;
  onBack: () => void;
  onNavigate: (p: string) => void;
  onDeleted: () => Promise<void>;
  onOpenProfile: (id: string) => void;
}) {
  const { club, clubMembers: players } = snapshot;
  const [tab, setTab] = useState("Players"),
    [query, setQuery] = useState(""),
    [sheet, setSheet] = useState("");
  const [alternatePicker, setAlternatePicker] = useState<Record<string, boolean>>({});
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<ClubPageMember | null>(null),
    [name, setName] = useState(""),
    [rating, setRating] = useState("1000"),
    [membership, setMembership] = useState("CORE"),
    [gender, setGender] = useState(""),
    [playerLevel, setPlayerLevel] = useState(""),
    [preferredGroup, setPreferredGroup] = useState("B");
  const joins = useResource<AdminAdmissionList>("/api/clubs/" + club.id + "/join-requests");
  const action = useAction(async () => {
    await Promise.all([refresh(), joins.refresh()]);
  });
  const levelOption = edit ? getMixedSideOverrideOptionForGender(edit.gender) : null;
  const endpoint = "/api/clubs/" + club.id;
  const requests = joins.data?.requests ?? [];
  const invite =
    typeof location === "undefined"
      ? ""
      : location.origin + "/?join=" + encodeURIComponent(club.id);
  function candidatesFor(request: AdmissionRequest): AdmissionCandidate[] {
    const candidates = [...(joins.data?.candidates ?? [])];
    for (const owned of request.ownedPlayers ?? []) {
      if (!candidates.some(candidate => candidate.id === owned.id)) candidates.push({ id: owned.id, name: owned.name });
    }
    if (request.history && request.requestedPlayerId && !candidates.some(candidate => candidate.id === request.requestedPlayerId)) {
      candidates.push({ ...request.history, id: request.requestedPlayerId });
    }
    return candidates.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }
  function chosenPlayer(request: AdmissionRequest) {
    const id = selectedCandidate[request.id] ?? request.requestedPlayerId ?? "";
    return candidatesFor(request).find(candidate => candidate.id === id) ?? null;
  }
  function reviewAdmission(request: AdmissionRequest, body: { action: "APPROVE" | "REJECT"; playerId?: string; asNew?: boolean; reason?: string }) {
    void action.run(() => api(endpoint + "/join-requests/" + request.id, "PATCH", { ...body, revision: request.revision }));
  }
  function editor(player: ClubPageMember | null) {
    setEdit(player);
    setName(player?.name || "");
    setRating(String(player?.elo ?? 1000));
    setMembership(player?.status || "CORE");
    setGender(player?.gender || "");
    setPlayerLevel(player ? normalizeMixedSideOverrideForGender(player.gender, player.mixedSideOverride, player.partnerPreference) ?? "" : "");
    setPreferredGroup(player?.preferredPool ?? "B");
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
        ...(levelOption ? { mixedSideOverride: playerLevel || null, partnerPreference: getStoredPartnerPreference(player.gender, playerLevel || null) } : {}),
        preferredPool: preferredGroup,
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
            {t === "Requests" && requests.length > 0 && (
                <span className="count">
                  {requests.length}
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
                    <button className="manage-profile-link" onClick={() => onOpenProfile(p.id)} aria-label={`View ${p.name} profile`}><Avatar name={p.name} url={p.avatarUrl} /><span className="person-info"><strong>{p.name}</strong><small>{p.elo} rating</small></span></button>
                    <button className="icon-button" aria-label={"Edit " + p.name} onClick={() => editor(p)}><PencilSimple size={20} /></button>
                  </div>)}</div>
                </section> : null;
              })}
              {!players.some(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && <p className="muted">No players found.</p>}
            </>
          ) : tab === "Requests" ? (
            <>
              <h2>Requests</h2>
              <p className="muted">Check the Player history and choose how each account should join.</p>
              {joins.data && !joins.data.allowJoinRequests && <p className="admission-review-closed">New requests are closed. You can still review requests already submitted.</p>}
              {requests.map((r) => (
                <article className="admission-review-card" key={r.id}>
                  <div className="admission-review-account">
                    <Avatar name={r.requesterName ?? r.requester?.name ?? r.name ?? "Member"} />
                    <div><strong>{r.requesterName ?? r.requester?.name ?? r.name ?? "Member"}</strong><small>{r.requesterEmail ?? r.requester?.email ?? "Email unavailable"} · requested {new Date(r.createdAt).toLocaleDateString()}</small></div>
                  </div>
                  <p className="admission-review-kind">{r.kind === "NEW_PLAYER" ? "New Player request" : r.kind === "OWNED_PLAYER" ? "Existing owned Player" : "Claim an existing Player"}</p>
                  {r.kind === "NEW_PLAYER" ? <div className="admission-review-player"><strong>{r.proposedPlayerName ?? r.requesterName ?? "New Player"}</strong><span>{r.proposedGender === "FEMALE" ? "Female" : r.proposedGender === "MALE" ? "Male" : "Gender not provided"} · no Player profile has been created</span></div> : <div className="admission-review-player"><strong>Claim candidate: {r.targetName ?? r.history?.name ?? "Player unavailable"}</strong><span>{r.history ? `${r.history.elo} rating · ${r.history.matchesPlayed} matches` : "No completed match history found"}{r.history?.lastPlayedAt ? ` · last played ${new Date(r.history.lastPlayedAt).toLocaleDateString()}` : ""}</span></div>}
                  {r.conflict && <p className="admission-review-conflict" role="alert">{r.conflict} No Player records or match history will be merged.</p>}
                  {!!r.possibleDuplicates?.length && <div className="admission-duplicate-list"><strong>Possible matching Players</strong>{r.possibleDuplicates.map(candidate => <button key={candidate.id} type="button" className="text-button" onClick={() => { setAlternatePicker(current => ({ ...current, [r.id]: true })); setSelectedCandidate(current => ({ ...current, [r.id]: candidate.id })); }}>{candidate.name} · {candidate.elo} rating</button>)}</div>}
                  {r.note && <blockquote className="admission-review-note">“{r.note}”</blockquote>}
                  {r.events?.length ? <small className="admission-review-events">Request history: {r.events.map(event => event.action.toLowerCase()).join(" → ")}</small> : null}

                  {r.requestedPlayerId && !alternatePicker[r.id] ? <button type="button" className="text-button admission-change-candidate" onClick={() => setAlternatePicker(current => ({ ...current, [r.id]: true }))}>Choose another Player</button> : null}
                  {!r.requestedPlayerId && !alternatePicker[r.id] ? <button type="button" className="text-button admission-change-candidate" onClick={() => setAlternatePicker(current => ({ ...current, [r.id]: true }))}>Choose an existing Player instead</button> : null}
                  {alternatePicker[r.id] && <label className="field-label admission-candidate-picker">Player to connect<select aria-label={`Player for ${r.requesterName ?? r.name ?? "request"}`} value={selectedCandidate[r.id] ?? r.requestedPlayerId ?? ""} onChange={event => setSelectedCandidate(current => ({ ...current, [r.id]: event.target.value }))}><option value="">Select a Player</option>{candidatesFor(r).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}{r.ownedPlayers?.some(owned => owned.id === candidate.id) ? " · owned by this account" : ""}{candidate.elo !== undefined ? ` · ${candidate.elo} rating` : ""}</option>)}</select></label>}
                  {chosenPlayer(r) && <p className="admission-selected-candidate">Selected: <strong>{chosenPlayer(r)?.name}</strong>{chosenPlayer(r)?.matchesPlayed !== undefined ? ` · ${chosenPlayer(r)?.matchesPlayed} matches` : ""}</p>}
                  <label className="field-label admission-rejection-reason">Rejection note (optional)<textarea rows={2} maxLength={1000} value={rejectionReasons[r.id] ?? ""} onChange={event => setRejectionReasons(current => ({ ...current, [r.id]: event.target.value }))} placeholder="Explain what the requester can correct" /></label>
                  <div className="admission-review-actions">
                    {chosenPlayer(r) && <button type="button" className="primary" disabled={action.busy || (!!r.conflict && (selectedCandidate[r.id] ?? r.requestedPlayerId) === r.requestedPlayerId)} onClick={() => reviewAdmission(r, { action: "APPROVE", playerId: selectedCandidate[r.id] ?? r.requestedPlayerId! })}>Approve {chosenPlayer(r)?.name}</button>}
                    <button type="button" className="secondary" disabled={action.busy || !!r.ownedPlayers?.length} onClick={() => reviewAdmission(r, { action: "APPROVE", asNew: true })}>Approve as new Player</button>
                    <button type="button" className="secondary admission-reject" disabled={action.busy} onClick={() => reviewAdmission(r, { action: "REJECT", reason: rejectionReasons[r.id]?.trim() || undefined })}>Reject request</button>
                  </div>
                </article>
              ))}
              {joins.data && !requests.length && (
                <div className="empty">
                  <Check size={32} />
                  <h3>All caught up</h3>
                  <p>No pending requests.</p>
                </div>
              )}
              {!joins.data && !joins.error && <p role="status">Loading requests…</p>}
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
              {edit && <MemberPhotoEditor key={edit.id} member={edit} clubId={club.id} onSaved={async avatarUrl => { setEdit(current => current?.id === edit.id ? { ...current, avatarUrl } : current); await refresh(); }} />}
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
              {edit && <div className="manage-player-preferences">
                <label className="field-label">Player level<select aria-label="Player level" value={playerLevel} onChange={e => setPlayerLevel(e.target.value)} disabled={!levelOption}><option value="">Default</option>{levelOption && <option value={levelOption.value}>{edit.gender === "FEMALE" ? "High level" : "Low level"}</option>}</select></label>
                <p className="manage-preference-hint">Used when forming mixed pairs.</p>
                <label className="field-label">Preferred game group<select aria-label="Preferred game group" value={preferredGroup} onChange={e => setPreferredGroup(e.target.value)}><option value="A">Competitive</option><option value="B">Social</option></select></label>
              </div>}
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
