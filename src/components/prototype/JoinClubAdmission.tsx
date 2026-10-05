"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, ErrorText, Sheet } from "./Primitives";
import { api } from "./api";
import { formatProfileDate } from "./profileDate";
import type { AdmissionCandidate, AdmissionDiscovery, AdmissionKind, AdmissionRequest } from "./admissionTypes";
import "./admission.css";

type Selection = { id: string; kind: "EXISTING_PLAYER" | "OWNED_PLAYER" } | null;

function parseClubId(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (!raw.includes("/") && !raw.includes("?") && !raw.includes("://")) return raw;
  try {
    const url = new URL(raw, window.location.origin);
    return url.searchParams.get("join")?.trim() || "";
  } catch {
    return "";
  }
}

function playerMeta(player: AdmissionCandidate) {
  const matches = player.matchesPlayed ?? 0;
  return `${player.elo ?? "—"} rating · ${matches} ${matches === 1 ? "match" : "matches"}`;
}

export function JoinClubAdmission({ open, initialValue, accountName, accountGender, onClose, onOpenClub }: {
  open: boolean;
  initialValue: string;
  accountName: string;
  accountGender: string;
  onClose: () => void;
  onOpenClub: (clubId: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [discovery, setDiscovery] = useState<AdmissionDiscovery | null>(null);
  const [latestRequest, setLatestRequest] = useState<AdmissionRequest | null>(null);
  const [mode, setMode] = useState<"start" | "existing" | "new">("start");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [playerName, setPlayerName] = useState(accountName);
  const [gender, setGender] = useState(accountGender === "MALE" || accountGender === "FEMALE" ? accountGender : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  async function loadClub(clubId: string, search = "", nextMode: "start" | "existing" = "start") {
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    if (nextMode === "existing" && discovery) setDiscovery(current => current ? { ...current, players: [] } : current);
    try {
      const params = new URLSearchParams({ clubId });
      if (search.trim()) params.set("q", search.trim());
      const result = await api<AdmissionDiscovery>(`/api/clubs/join-requests?${params}`);
      if (requestVersion.current !== version) return;
      setDiscovery(result);
      setLatestRequest(result.requests[0] ?? null);
      setMode(nextMode);
      setSelection(null);
      setQuery(search);
      setValue(clubId);
    } catch (reason) {
      if (requestVersion.current === version) setError(reason instanceof Error ? reason.message : "Unable to find this club");
    } finally {
      if (requestVersion.current === version) setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const clubId = parseClubId(initialValue);
    if (clubId) void Promise.resolve().then(() => loadClub(clubId));
    return () => { requestVersion.current += 1; };
    // This sheet is mounted only while open, so component state starts fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValue]);

  const currentPending = latestRequest
    ? latestRequest.status === "PENDING" ? latestRequest : null
    : discovery?.requests.find(request => request.status === "PENDING") ?? null;
  const mostRecentRequest = latestRequest ?? discovery?.requests[0] ?? null;
  const hasActiveAccess = discovery?.access?.status === "ACTIVE";
  const isMember = hasActiveAccess && !!discovery?.membership;

  async function submit(kind: AdmissionKind, requestedPlayerId?: string) {
    if (!discovery) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<AdmissionRequest | { status: "MEMBER"; clubId: string }>("/api/clubs/join-requests", "POST", {
        clubId: discovery.club.id,
        kind,
        ...(requestedPlayerId ? { requestedPlayerId } : {}),
        ...(kind === "NEW_PLAYER" ? { proposedPlayerName: playerName.trim(), proposedGender: gender } : {}),
        note: note.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.status === "MEMBER") {
        onOpenClub(result.clubId);
        return;
      }
      setLatestRequest(result);
      setMode("start");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send your request");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(request: AdmissionRequest) {
    if (!discovery) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<AdmissionRequest>(`/api/clubs/${discovery.club.id}/join-requests/${request.id}`, "PATCH", { action: "CANCEL", revision: request.revision });
      setLatestRequest(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to cancel your request");
    } finally {
      setBusy(false);
    }
  }

  function openExisting() {
    setMode("existing");
    setSelection(null);
  }

  return <Sheet open={open} title="Join a club" busy={busy} onClose={onClose}>
    <ErrorText error={error} />
    {!discovery ? <>
      <p className="muted">Enter the club code or paste its invite link.</p>
      <form className="admission-form" onSubmit={event => { event.preventDefault(); const clubId = parseClubId(value); if (!clubId) { setError("Enter a valid club code or invite link."); return; } void loadClub(clubId); }}>
        <label className="field-label">Invite link or club code<input value={value} onChange={event => setValue(event.target.value)} placeholder="Paste an invite link" autoComplete="off" /></label>
        <button className="primary" disabled={busy || !value.trim()}>{busy ? "Finding club…" : "Find club"}</button>
      </form>
    </> : <>
      <div className="admission-club-heading"><span className="eyebrow">CLUB</span><h3>{discovery.club.name}</h3></div>
      {isMember ? <div className="admission-status is-approved" role="status"><strong>You’re already a member.</strong><span>Your Player profile is connected to this club.</span><button className="primary" type="button" onClick={() => onOpenClub(discovery.club.id)}>Open {discovery.club.name}</button></div>
        : currentPending ? <div className="admission-status" role="status"><strong>Request sent</strong><span>An admin will review your request to {discovery.club.name}.</span><small>Sent {formatProfileDate(currentPending.createdAt)}</small><button className="text-button" type="button" onClick={() => void cancel(currentPending)}>Cancel request</button></div>
        : mostRecentRequest?.status === "REJECTED" ? <div className="admission-status is-rejected" role="status"><strong>Your last request was declined.</strong><span>You can send a new request if your Player details have changed.</span></div>
        : mostRecentRequest?.status === "APPROVED" ? <div className="admission-status" role="status"><strong>Your request was approved.</strong><span>Club access may have since changed. Ask an admin if you still cannot open the club.</span></div>
        : null}

      {!isMember && !currentPending && hasActiveAccess && <div className="admission-status is-approved" role="status"><strong>Your account already has club access.</strong><span>Connect a Player profile to appear on the roster and keep the right match history.</span></div>}

      {!isMember && !currentPending && <>
        {!discovery.club.allowJoinRequests ? <div className="admission-status"><strong>Requests are closed.</strong><span>{discovery.club.name} is not accepting new members right now.</span></div>
          : mode === "start" ? <>
            <h3 className="admission-question">Have you played with this club before?</h3>
            <p className="muted">We’ll connect you to the right Player record so your match history stays together.</p>
            <div className="admission-choice-grid">
              <button type="button" className="admission-choice" onClick={openExisting}><strong>Yes, find my profile</strong><span>Search the club roster</span></button>
              <button type="button" className="admission-choice" onClick={() => { setMode("new"); setSelection(null); setPlayerName(accountName); setGender(accountGender === "MALE" || accountGender === "FEMALE" ? accountGender : ""); }}><strong>I’m new to this club</strong><span>Ask the admin to add a Player</span></button>
            </div>
          </> : mode === "existing" ? <>
            <button type="button" className="text-button admission-back" onClick={() => setMode("start")}>Back to the question</button>
            <h3>Find your Player profile</h3>
            <p className="muted">Choose the profile that represents you in {discovery.club.name}.</p>
            <form className="admission-search" onSubmit={event => { event.preventDefault(); void loadClub(discovery.club.id, query, "existing"); }}>
              <label className="field-label">Search by name<input value={query} maxLength={64} onChange={event => setQuery(event.target.value)} placeholder="Player name" /></label>
              <button className="secondary" type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
            </form>
            {!!discovery.players.length && <div className="admission-player-list" aria-label="Unclaimed Player profiles in this club">{discovery.players.map(player => <PlayerChoice key={player.id} player={player} selected={selection?.id === player.id} detail={playerMeta(player)} onClick={() => setSelection({ id: player.id, kind: "EXISTING_PLAYER" })} />)}</div>}
            {!discovery.players.length && <p className="admission-empty">No unclaimed Player profiles match this search.</p>}
            {!!discovery.ownedPlayers.length && <section className="admission-owned"><h4>Your Player profiles</h4><p className="muted">If you already own a Player profile from another club, you can use it here.</p>{discovery.ownedPlayers.map(player => <button key={player.id} type="button" className={`admission-owned-choice${selection?.id === player.id ? " selected" : ""}`} aria-pressed={selection?.id === player.id} onClick={() => setSelection({ id: player.id, kind: "OWNED_PLAYER" })}><Avatar name={player.name} /><strong>{player.name}</strong><span>{selection?.id === player.id ? "Selected" : "Use this profile"}</span></button>)}</section>}
            <label className="field-label">Note for the admin <textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Optional context for your request" /></label>
            <button type="button" className="primary" disabled={!selection || busy} onClick={() => selection && void submit(selection.kind, selection.id)}>Request to connect this Player</button>
          </> : discovery.ownedPlayers.length ? <>
            <button type="button" className="text-button admission-back" onClick={() => setMode("start")}>Back to the question</button>
            <h3>Use a Player profile you already own</h3>
            <p className="muted">This account already has Player profiles. Choose one to request access with its existing history.</p>
            <div className="admission-owned">{discovery.ownedPlayers.map(player => <button key={player.id} type="button" className={`admission-owned-choice${selection?.id === player.id ? " selected" : ""}`} aria-pressed={selection?.id === player.id} onClick={() => setSelection({ id: player.id, kind: "OWNED_PLAYER" })}><Avatar name={player.name} /><strong>{player.name}</strong><span>{selection?.id === player.id ? "Selected" : "Choose"}</span></button>)}</div>
            <label className="field-label">Note for the admin <textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Optional context for your request" /></label>
            <button type="button" className="primary" disabled={!selection || selection.kind !== "OWNED_PLAYER" || busy} onClick={() => selection?.kind === "OWNED_PLAYER" && void submit("OWNED_PLAYER", selection.id)}>Request to use this Player</button>
          </> : <>
            <button type="button" className="text-button admission-back" onClick={() => setMode("start")}>Back to the question</button>
            <h3>Request a new Player profile</h3>
            <p className="muted">The admin will review your request before a Player profile is created.</p>
            <label className="field-label">Player name<input value={playerName} maxLength={100} onChange={event => setPlayerName(event.target.value)} required /></label>
            <label className="field-label">Gender for mixed pairing<select value={gender} onChange={event => setGender(event.target.value)} required><option value="" disabled>Choose gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
            <p className="muted">This belongs to your new Player profile and does not change your account gender.</p>
            <label className="field-label">Note for the admin <textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Optional context for your request" /></label>
            <button type="button" className="primary" disabled={busy || playerName.trim().length < 1 || !gender} onClick={() => void submit("NEW_PLAYER")}>Send request</button>
          </>}
      </>}
      <button type="button" className="text-button admission-change-club" onClick={() => { setDiscovery(null); setLatestRequest(null); setMode("start"); setError(""); }}>Use a different club code</button>
    </>}
  </Sheet>;
}

function PlayerChoice({ player, selected, detail, onClick }: { player: AdmissionCandidate; selected: boolean; detail: string; onClick: () => void }) {
  return <button type="button" className="admission-player-choice" aria-pressed={selected} onClick={onClick}>
    <Avatar name={player.name} url={player.avatarUrl} />
    <span><strong>{player.name}</strong><small>{detail}{player.lastPlayedAt ? ` · last played ${formatProfileDate(player.lastPlayedAt)}` : ""}</small></span>
    <b>{selected ? "Selected" : "Choose"}</b>
  </button>;
}
