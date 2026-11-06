"use client";

import { useEffect, useRef, useState } from "react";
import { CaretLeft } from "@phosphor-icons/react";
import { Avatar, ErrorText, Sheet } from "./Primitives";
import { api, ApiError } from "./api";
import { formatProfileDate } from "./profileDate";
import type { AdmissionCandidate, AdmissionDiscovery, AdmissionKind, AdmissionRequest, AdmissionRequestSummary } from "./admissionTypes";
import "./admission.css";

type ClubResult = { id: string; name: string; avatarUrl: string | null; isPasswordProtected: boolean };

type Selection = { id: string; kind: "EXISTING_PLAYER" } | null;

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

export function JoinClubAdmission({ open, initialValue, accountName, accountGender, accountReady = true, onCompleteAccountDetails, onClose, onOpenClub }: {
  open: boolean;
  initialValue: string;
  accountName: string;
  accountGender: string;
  accountReady?: boolean;
  onCompleteAccountDetails?: () => void;
  onClose: () => void;
  onOpenClub: (clubId: string, identity?: { id: string; name: string; avatarUrl?: string | null }) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [clubQuery, setClubQuery] = useState("");
  const [clubResults, setClubResults] = useState<ClubResult[]>([]);
  const [clubSearching, setClubSearching] = useState(false);
  const [clubSearchError, setClubSearchError] = useState("");
  const [password, setPassword] = useState("");
  const searchVersion = useRef(0);
  const [discovery, setDiscovery] = useState<AdmissionDiscovery | null>(null);
  const [latestRequest, setLatestRequest] = useState<AdmissionRequestSummary | null>(null);
  const [mode, setMode] = useState<"start" | "existing" | "new">("start");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [duplicates, setDuplicates] = useState<AdmissionCandidate[]>([]);
  const [duplicateError, setDuplicateError] = useState("");
  const [duplicateSearching, setDuplicateSearching] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const initialClubLoaded = useRef("");
  const submissionLock = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);

  async function loadClub(clubId: string, search = "", nextMode: "start" | "existing" | "new" = "start") {
    const version = ++requestVersion.current;
    setPassword("");
    setBusy(true);
    setError("");
    if (nextMode === "existing" && discovery) {
      setDiscovery(current => current ? { ...current, players: [] } : current);
      setSelection(null);
    }
    try {
      const params = new URLSearchParams({ clubId });
      if (search.trim()) params.set("q", search.trim());
      const result = await api<AdmissionDiscovery>(`/api/clubs/join-requests?${params}`);
      if (requestVersion.current !== version) return;
      setDiscovery(result);
      setLatestRequest(result.requests[0] ?? null);
      setMode(result.requiresJoinCode ? "start" : nextMode);
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
    if (clubId && initialClubLoaded.current !== clubId) {
      initialClubLoaded.current = clubId;
      void Promise.resolve().then(() => loadClub(clubId));
    }
    return () => { requestVersion.current += 1; };
    // Account completion hides this sheet without discarding its selected club or profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValue]);

  useEffect(() => {
    const version = ++searchVersion.current;
    const controller = new AbortController();
    const q = clubQuery.trim();
    setClubResults([]);
    setClubSearchError("");
    if (!open || discovery || q.length < 2) { setClubSearching(false); return () => controller.abort(); }
    setClubSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/clubs/search?${new URLSearchParams({ q })}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to search clubs");
        if (version === searchVersion.current && !controller.signal.aborted) setClubResults(data.clubs);
      } catch (reason) {
        if (version === searchVersion.current && !controller.signal.aborted) setClubSearchError(reason instanceof Error ? reason.message : "Unable to search clubs");
      } finally {
        if (version === searchVersion.current && !controller.signal.aborted) setClubSearching(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [clubQuery, open, discovery]);

  useEffect(() => {
    if (!open) { requestVersion.current += 1; setPassword(""); }
  }, [open]);

  const duplicateClubId = discovery?.club.id;
  const duplicateLocked = discovery?.requiresJoinCode || discovery?.identityReviewRequired;
  useEffect(() => {
    const controller = new AbortController();
    setDuplicates([]); setDuplicateError(""); setDuplicateSearching(false);
    const q = accountName.trim().slice(0, 64);
    if (!open || mode !== "new" || !duplicateClubId || duplicateLocked || !accountReady || !q) return () => controller.abort();
    setDuplicateSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/clubs/join-requests?${new URLSearchParams({ clubId: duplicateClubId, q })}`, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new ApiError(data?.error || "Unable to check matching profiles", response.status, data?.code);
        const result = data as AdmissionDiscovery;
        if (result.requiresJoinCode) {
          setDiscovery(result); setLatestRequest(result.requests[0] ?? null); setMode("start"); setSelection(null);
        } else if (result.identityReviewRequired) { setDiscovery(result); setSelection(null); }
        else setDuplicates(result.players);
      } catch (reason) {
        if (!controller.signal.aborted) {
          if (reason instanceof ApiError && (reason.code === "JOIN_CODE_REQUIRED" || reason.code === "PASSWORD_REQUIRED")) {
            setDiscovery(current => current ? { ...current, requiresJoinCode: true, players: [] } : current); setMode("start"); setSelection(null); setPassword("");
          }
          setDuplicateError(reason instanceof Error ? reason.message : "Unable to check matching profiles");
        }
      } finally { if (!controller.signal.aborted) setDuplicateSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, mode, duplicateClubId, duplicateLocked, accountName, accountReady]);

  async function verifyEntry() {
    if (!discovery) return;
    const clubId = discovery.club.id;
    const entered = password;
    const version = ++requestVersion.current;
    setPassword("");
    setBusy(true);
    setError("");
    try {
      await api("/api/clubs/join-entry", "POST", { clubId, password: entered });
      if (requestVersion.current === version) await loadClub(clubId);
    } catch (reason) {
      if (requestVersion.current !== version) return;
      setError(reason instanceof Error ? reason.message : "Unable to verify the club join code");
    } finally { setBusy(false); }
  }

  const currentPending = latestRequest
    ? latestRequest.status === "PENDING" ? latestRequest : null
    : discovery?.requests.find(request => request.status === "PENDING") ?? null;
  const mostRecentRequest = latestRequest ?? discovery?.requests[0] ?? null;
  const hasActiveAccess = discovery?.access?.status === "ACTIVE";
  const isMember = hasActiveAccess && !!discovery?.membership && !discovery?.identityReviewRequired;

  async function submit(kind: AdmissionKind, requestedPlayerId?: string) {
    if (!discovery || discovery.requiresJoinCode || discovery.identityReviewRequired || submissionLock.current) return;
    if (!accountReady || !accountName.trim() || !["MALE", "FEMALE"].includes(accountGender) || profileIncomplete) return;
    submissionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = { clubId: discovery.club.id, kind, ...(requestedPlayerId ? { requestedPlayerId } : {}), note: note.trim() || undefined };
      const signature = JSON.stringify(body);
      if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
      const result = await api<AdmissionRequest | { status: "MEMBER"; clubId: string }>("/api/clubs/join-requests", "POST", { ...body, idempotencyKey: retry.current.key });
      retry.current = null;
      if (result.status === "MEMBER") {
        onOpenClub(result.clubId, discovery.club);
        return;
      }
      setLatestRequest(result);
      setMode("start");
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "ACCOUNT_PROFILE_INCOMPLETE") setProfileIncomplete(true);
      if (reason instanceof ApiError && (reason.code === "JOIN_CODE_REQUIRED")) {
        setPassword("");
        setSelection(null);
        setMode("start");
        setDiscovery(current => current ? { ...current, requiresJoinCode: true, players: [] } : current);
        await loadClub(discovery.club.id);
      }
      setError(reason instanceof Error ? reason.message : "Unable to send your request");
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  }

  async function cancel(request: AdmissionRequestSummary) {
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

  const accountDetailsComplete = !!accountName.trim() && ["MALE", "FEMALE"].includes(accountGender);
  useEffect(() => { if (accountReady && accountDetailsComplete) setProfileIncomplete(false); }, [accountReady, accountName, accountGender, accountDetailsComplete]);
  const selectedPlayer = discovery?.players.find(player => player.id === selection?.id);
  const showFooter = !!discovery && !isMember && !currentPending && !discovery.identityReviewRequired && mostRecentRequest?.status !== "APPROVED" && discovery.club.allowJoinRequests && !discovery.requiresJoinCode && (mode === "new" || (mode === "existing" && !!selectedPlayer));
  const footer = showFooter ? <div className="admission-action-footer">
    <div className="admission-action-summary" title={mode === "existing" ? selectedPlayer?.name : accountName}><strong>{mode === "existing" ? selectedPlayer?.name : accountName || "Your Player profile"}</strong><span>{mode === "existing" ? "Request to connect this Player" : "Request a new Player profile"}</span></div>
    <ErrorText error={error} />
    {accountReady && (!accountDetailsComplete || profileIncomplete)
      ? <button type="button" className="primary" disabled={busy} onClick={onCompleteAccountDetails}>Complete account details</button>
      : <button type="button" className="primary" disabled={busy || !accountReady} onClick={() => mode === "existing" && selection ? void submit("EXISTING_PLAYER", selection.id) : void submit("NEW_PLAYER")}>{busy ? "Sending…" : "Send request"}</button>}
  </div> : undefined;

  return <Sheet open={open} title="Join a club" busy={busy} footer={footer} onClose={() => { requestVersion.current += 1; setPassword(""); onClose(); }}>
    {!showFooter && <ErrorText error={error} />}
    {!discovery ? <>
      <p className="muted">Find your club by name, then request admin approval to join.</p>
      <div className="admission-club-search">
        <label className="field-label">Search clubs by name<input value={clubQuery} maxLength={64} onChange={event => setClubQuery(event.target.value)} placeholder="Enter at least 2 characters" autoComplete="off" /></label>
        <ErrorText error={clubSearchError} />
        {clubSearching && <p role="status">Searching clubs…</p>}
        {!clubSearching && clubQuery.trim().length >= 2 && !clubResults.length && !clubSearchError && <p className="admission-empty">No clubs found. Ask the admin for a club ID or invite link.</p>}
        {!!clubResults.length && <div className="admission-club-results">{clubResults.map(club => <button type="button" className="admission-club-result" key={club.id} disabled={busy} onClick={() => { setPassword(""); void loadClub(club.id); }}><Avatar name={club.name} url={club.avatarUrl} /><span><strong>{club.name}</strong><small>{club.isPasswordProtected ? "Club join code required" : "Admin approval required"}</small></span></button>)}</div>}
      </div>
      <p className="muted">Already have a club ID or invite link?</p>
      <form className="admission-form" onSubmit={event => { event.preventDefault(); const clubId = parseClubId(value); if (!clubId) { setError("Enter a valid club ID or invite link."); return; } void loadClub(clubId); }}>
        <label className="field-label">Invite link or club ID<input value={value} onChange={event => setValue(event.target.value)} placeholder="Paste an invite link" autoComplete="off" /></label>
        <button className="primary" disabled={busy || !value.trim()}>{busy ? "Finding club…" : "Find club"}</button>
      </form>
    </> : <>
      <div className="admission-club-heading"><Avatar name={discovery.club.name} url={discovery.club.avatarUrl} /><span className="eyebrow">CLUB</span><h3>{discovery.club.name}</h3></div>
      {isMember ? <div className="admission-status is-approved" role="status"><strong>You’re already a member.</strong><span>Your Player profile is connected to this club.</span><button className="primary" type="button" onClick={() => onOpenClub(discovery.club.id, discovery.club)}>Open club</button></div>
        : currentPending ? <div className="admission-status" role="status"><strong>Waiting for admin approval</strong><span>An admin will review your request to {discovery.club.name}.</span><small>Sent {formatProfileDate(currentPending.createdAt)}</small><button className="text-button" type="button" onClick={() => void loadClub(discovery.club.id)}>Refresh status</button><button className="text-button" type="button" onClick={() => void cancel(currentPending)}>Cancel request</button></div>
        : discovery.identityReviewRequired ? <div className="admission-status" role="status"><strong>Ask an admin to restore your Player profile.</strong><span>Your existing profile needs an admin review before you can join or open this club.</span></div>
        : mostRecentRequest?.status === "REJECTED" ? <div className="admission-status is-rejected" role="status"><strong>Your last request was declined.</strong><span>You can send a new request if your Player details have changed.</span></div>
        : mostRecentRequest?.status === "APPROVED" ? <div className="admission-status" role="status"><strong>Your request was approved.</strong><span>Ask an admin if your club access has changed.</span><button className="primary" type="button" onClick={() => onOpenClub(discovery.club.id, discovery.club)}>Open club</button></div>
        : null}

      {!isMember && !currentPending && !discovery.identityReviewRequired && hasActiveAccess && <div className="admission-status is-approved" role="status"><strong>Your account already has club access.</strong><span>Connect a Player profile to appear on the roster and keep the right match history.</span></div>}

      {!isMember && !currentPending && !discovery.identityReviewRequired && mostRecentRequest?.status !== "APPROVED" && <>
        {!discovery.club.allowJoinRequests ? <div className="admission-status"><strong>Requests are closed.</strong><span>{discovery.club.name} is not accepting new members right now.</span></div>
          : discovery.requiresJoinCode ? <form className="admission-entry-code admission-form" onSubmit={event => { event.preventDefault(); void verifyEntry(); }}>
            <h3>Enter the club join code</h3><p className="muted">Ask the club admin for this code. You’ll still need admin approval after entering it.</p>
            <label className="field-label">Club join code<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="off" maxLength={100} /></label>
            <button className="primary" disabled={busy || !password}>Continue</button>
          </form>
          : mode === "start" ? <>
            <h3 className="admission-question">Have you played with this club before?</h3>
            <div className="admission-choice-grid">
              <button type="button" className="admission-choice" onClick={openExisting}><strong>Yes, find my profile</strong></button>
              <button type="button" className="admission-choice" onClick={() => { setMode("new"); setSelection(null); setError(""); }}><strong>I’m new to this club</strong></button>
            </div>
          </> : mode === "existing" ? <>
            <button type="button" className="secondary admission-back" onClick={() => { setMode("start"); setError(""); }}><CaretLeft size={18} aria-hidden="true" />Back</button>
            <h3>Find your Player profile</h3>
            <form className="admission-search" onSubmit={event => { event.preventDefault(); void loadClub(discovery.club.id, query, "existing"); }}>
              <label className="field-label">Search by name<input value={query} maxLength={64} onChange={event => { setQuery(event.target.value); setSelection(null); requestVersion.current += 1; setBusy(false); }} placeholder="Player name" /></label>
              <button className="secondary" type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
            </form>
            {!!discovery.players.length && <div className="admission-player-list" aria-label="Unclaimed Player profiles in this club">{discovery.players.map(player => <PlayerChoice key={player.id} player={player} selected={selection?.id === player.id} detail={playerMeta(player)} onClick={() => setSelection({ id: player.id, kind: "EXISTING_PLAYER" })} />)}</div>}
            {!discovery.players.length && <p className="admission-empty">No unclaimed Player profiles match this search. If your profile is missing or already claimed, ask the admin to help connect it.</p>}
            {accountReady && (!accountDetailsComplete || profileIncomplete) && <p className="muted">Complete your saved account name and gender before sending this request.</p>}
            <details className="admission-note"><summary>Add note (optional)</summary><label className="field-label">Note for the admin<textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label></details>
          </> : <>
            <button type="button" className="secondary admission-back" onClick={() => { setMode("start"); setError(""); }}><CaretLeft size={18} aria-hidden="true" />Back</button>
            <h3>Request a new Player profile</h3>
            <p className="muted">The admin will review your request before a Player profile is created.</p>
            {!accountReady ? <p role="status">Loading your account details…</p> : <div className="admission-account-summary"><strong>{accountName || "Name needed"}</strong><span>{accountGender === "MALE" ? "Male" : accountGender === "FEMALE" ? "Female" : "Gender needed"} · Mixed pairing</span></div>}
            {accountReady && (!accountDetailsComplete || profileIncomplete) && <div className="admission-status"><strong>Complete your account details</strong><p>Add your name and gender in your account before requesting a new Player profile.</p></div>}
            {duplicateSearching && <p role="status">Checking matching profiles…</p>}
            <ErrorText error={duplicateError} />
            {!!duplicates.length && <section className="admission-duplicates"><h4>Could one of these profiles be yours?</h4><p className="muted">These unclaimed profiles match your account name. Connect yours to keep your match history, or continue with a new profile if none represents you.</p>{duplicates.map(player => <PlayerChoice key={player.id} player={player} selected={selection?.id === player.id} detail={playerMeta(player)} onClick={() => { setDiscovery(current => current ? { ...current, players: duplicates } : current); setMode("existing"); setSelection({ id: player.id, kind: "EXISTING_PLAYER" }); }} />)}</section>}
            <p className="muted">Your new Player profile uses your account name and gender. Match history stays separate for this club.</p>
            <details className="admission-note"><summary>Add note (optional)</summary><label className="field-label">Note for the admin<textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label></details>
          </>}
      </>}
      <button type="button" className="text-button admission-change-club" onClick={() => { requestVersion.current += 1; setPassword(""); setDiscovery(null); setLatestRequest(null); setSelection(null); setMode("start"); setError(""); }}>Find a different club</button>
    </>}
  </Sheet>;
}

function PlayerChoice({ player, selected, detail, onClick }: { player: AdmissionCandidate; selected: boolean; detail: string; onClick: () => void }) {
  return <button type="button" className="admission-player-choice" aria-pressed={selected} onClick={onClick}>
    <Avatar name={player.name} url={player.avatarUrl} />
    <span><strong>{player.name}</strong><small>{detail}{player.lastPlayedAt ? ` · last played ${formatProfileDate(player.lastPlayedAt)}` : ""}</small></span>
    <b>{selected ? "Selected" : "This is me"}</b>
  </button>;
}
