"use client";

import { useState } from "react";
import { api, ApiError, useResource } from "@/components/prototype/api";
import type {
  AuthorizedAccessAction,
  CorrectionAccountCandidate,
  CreateAuthorizedInvitationResponse,
  IdentityAccessSnapshot,
  IdentityOptionsResponse,
} from "@/types/playerRecovery";

type CreatedLink = { purpose: "CORRECTION" | "ACCESS_RESTORE"; url: string; expiresAt: string };
type SelectedSource = { accountId: string; sourcePlayerId: string } | null;

function historyText(history: { matchesPlayed: number; lastPlayedAt: string | null }) {
  const matches = `${history.matchesPlayed} ${history.matchesPlayed === 1 ? "match" : "matches"}`;
  return `${matches}${history.lastPlayedAt ? ` · last played ${new Date(history.lastPlayedAt).toLocaleDateString()}` : ""}`;
}

function accessAction(snapshot: IdentityAccessSnapshot | null): AuthorizedAccessAction {
  if (snapshot?.status === "ACTIVE") return "PRESERVE_ACTIVE";
  if (snapshot?.status === "REVOKED") return "RESTORE_MEMBER";
  return "GRANT_MEMBER";
}

function accessDescription(snapshot: IdentityAccessSnapshot | null) {
  if (snapshot?.status === "ACTIVE") return `Existing ACTIVE ${snapshot.role ?? "member"} access will be preserved.`;
  if (snapshot?.status === "REVOKED") return "Revoked club access will be restored as MEMBER; any former elevated role will not be reinstated.";
  return "Club access will be granted as MEMBER.";
}

function candidateKey(candidate: CorrectionAccountCandidate) {
  return `${candidate.account.accountId}:${candidate.source.playerId}`;
}

export function PlayerIdentityInvitationActions({
  clubId,
  playerId,
  connected,
  onInvitationCreated,
}: {
  clubId: string;
  playerId: string;
  connected: boolean;
  onInvitationCreated?: () => void | Promise<void>;
}) {
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [selected, setSelected] = useState<SelectedSource>(null);
  const [reason, setReason] = useState("");
  const [retireConfirmed, setRetireConfirmed] = useState(false);
  const [accessConfirmed, setAccessConfirmed] = useState(false);
  const [rosterConfirmed, setRosterConfirmed] = useState(false);
  const [replacementConfirmed, setReplacementConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const identityOptionsPath = `/api/clubs/${encodeURIComponent(clubId)}/players/${encodeURIComponent(playerId)}/identity-options`;
  const shouldLoadOptions = connected || correctionOpen;
  const purpose = connected ? "ACCESS_RESTORE" : "CORRECTION";
  const optionsParams = new URLSearchParams({ purpose });
  if (!connected && searchedQuery) optionsParams.set("q", searchedQuery);
  const optionsUrl = shouldLoadOptions ? `${identityOptionsPath}?${optionsParams}` : null;
  const options = useResource<IdentityOptionsResponse>(optionsUrl);
  const target = options.data?.target;
  const selectedCandidate = selected
    ? options.data?.correctionCandidates.find(candidate => candidate.account.accountId === selected.accountId && candidate.source.playerId === selected.sourcePlayerId) ?? null
    : null;
  const invitationExpiry = target?.activeInvitation ? Date.parse(target.activeInvitation.expiresAt) : Number.NaN;
  const activeInvitation = target?.activeInvitation?.status === "ACTIVE" && (Number.isNaN(invitationExpiry) || invitationExpiry > Date.now()) ? target.activeInvitation : null;
  const expiredActiveInvitation = target?.activeInvitation?.status === "ACTIVE" && !Number.isNaN(invitationExpiry) && invitationExpiry <= Date.now() ? target.activeInvitation : null;
  const activeClaimInvitation = target?.activeInvitation?.status === "ACTIVE" && target.activeInvitation.purpose === "CLAIM" ? target.activeInvitation : null;
  const activeClaimInvitationExpired = activeClaimInvitation ? Date.parse(activeClaimInvitation.expiresAt) <= Date.now() : false;
  const accessConsentRequired = (snapshot: IdentityAccessSnapshot | null) => snapshot?.status !== "ACTIVE";
  const targetMembershipArchived = !!target?.member?.archivedAt;
  const accessRestoreNeeded = !!target && (target.clubAccess?.status !== "ACTIVE" || targetMembershipArchived);

  // The route is the authority for exact local ADMIN/OWNER scope; platform
  // administrators and other viewers must not receive a fallback affordance.
  if (options.errorStatus === 403) return null;

  function chooseCandidate(candidate: CorrectionAccountCandidate) {
    setSelected({ accountId: candidate.account.accountId, sourcePlayerId: candidate.source.playerId });
    setReason("");
    setRetireConfirmed(false);
    setAccessConfirmed(false);
    setRosterConfirmed(false);
    setReplacementConfirmed(false);
    setReviewConfirmed(false);
    setCreated(null);
    setCopied(false);
    setError("");
  }

  function openCorrection() {
    setCorrectionOpen(true);
    setSelected(null);
    setCreated(null);
    setError("");
  }

  async function refreshAfterReplacementRequired() {
    try { await options.refresh(); } catch { /* The resource error is shown below. */ }
    setReplacementConfirmed(false);
    setReviewConfirmed(false);
    setError("An active invitation is already in place. Review its account, purpose, and expiry before confirming replacement.");
  }

  async function createCorrection() {
    if (!target || !selectedCandidate) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<CreateAuthorizedInvitationResponse>(
        `${identityOptionsPath.replace(/\/identity-options$/, "")}/correction-invitations`,
        "POST",
        {
          recipientAccountId: selectedCandidate.account.accountId,
          sourcePlayerId: selectedCandidate.source.playerId,
          sourceMemberId: selectedCandidate.source.memberId,
          retireSourcePlayerId: selectedCandidate.source.playerId,
          reason: reason.trim(),
          authorizedAccessAction: accessAction(selectedCandidate.source.clubAccess),
          restoreArchivedRoster: false,
          ...(activeInvitation && replacementConfirmed ? { replaceInvitationId: activeInvitation.id } : {}),
        },
      );
      if (!result.invitation?.id || !result.secret) throw new Error("The invitation was created, but its secure link was not returned. Refresh identity options before continuing.");
      setCreated({ purpose: "CORRECTION", url: `${window.location.origin}/player-invites/${encodeURIComponent(result.invitation.id)}#${result.secret}`, expiresAt: result.invitation.expiresAt });
      setCopied(false);
      setReplacementConfirmed(false);
      setReviewConfirmed(false);
      await Promise.all([options.refresh(), onInvitationCreated?.()]);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "INVITATION_REPLACEMENT_REQUIRED") await refreshAfterReplacementRequired();
      else setError(reason instanceof Error ? reason.message : "Unable to create the correction invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function createAccessRestore() {
    if (!target?.ownerAccount) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<CreateAuthorizedInvitationResponse>(
        `${identityOptionsPath.replace(/\/identity-options$/, "")}/access-restore-invitations`,
        "POST",
        {
          recipientAccountId: target.ownerAccount.accountId,
          authorizedAccessAction: accessAction(target.clubAccess),
          restoreArchivedRoster: targetMembershipArchived,
          reason: reason.trim(),
          ...(activeInvitation && replacementConfirmed ? { replaceInvitationId: activeInvitation.id } : {}),
        },
      );
      if (!result.invitation?.id || !result.secret) throw new Error("The invitation was created, but its secure link was not returned. Refresh identity options before continuing.");
      setCreated({ purpose: "ACCESS_RESTORE", url: `${window.location.origin}/player-invites/${encodeURIComponent(result.invitation.id)}#${result.secret}`, expiresAt: result.invitation.expiresAt });
      setCopied(false);
      setReplacementConfirmed(false);
      setReviewConfirmed(false);
      await options.refresh();
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "INVITATION_REPLACEMENT_REQUIRED") await refreshAfterReplacementRequired();
      else setError(reason instanceof Error ? reason.message : "Unable to create the access restoration invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeOwnedPlayerClaimInvitation() {
    if (!activeClaimInvitation) return;
    const expired = Date.parse(activeClaimInvitation.expiresAt) <= Date.now();
    if (!window.confirm(`${expired ? "Close expired" : "Revoke"} profile invitation ${activeClaimInvitation.id}? Its link will stop working.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(playerId)}/invitations`, "POST", {
        action: "REVOKE",
        invitationId: activeClaimInvitation.id,
      });
      setNotice(`The profile invitation was ${expired ? "closed as expired" : "revoked"}; its link can no longer be used.`);
      await Promise.all([options.refresh(), onInvitationCreated?.()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to revoke this invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch { setError("Unable to copy the invitation link. Select and copy it manually."); }
  }

  if (connected) {
    const owner = target?.ownerAccount ?? null;
    const blocked = !target || !owner || !target.member || !target.isActive || !!target.member.retiredByAdmissionEventId || !owner.isActive;
    const accessRestoreBlocked = (target?.accessRestoreBlockers.length ?? 0) > 0;
    const accessNeeded = accessRestoreNeeded;
    const action = accessAction(target?.clubAccess ?? null);
    const needsAccessConfirmation = accessConsentRequired(target?.clubAccess ?? null);
    const canIssue = !blocked && !accessRestoreBlocked && accessNeeded && !!reason.trim() && (!needsAccessConfirmation || accessConfirmed) && (!targetMembershipArchived || rosterConfirmed) && (!activeInvitation || replacementConfirmed) && reviewConfirmed && !busy;

    return <section className="app-panel-muted mt-4 space-y-3 p-4" aria-label="Restore access to an owned Player">
      <h3 className="font-semibold">Access restoration</h3>
      {options.error && <p role="alert">{options.error}</p>}
      {!target && !options.error && <p role="status">Loading this Player’s account and club access…</p>}
      {target && !owner && <p>This Player has no linked Account, so access restoration is unavailable.</p>}
      {target && owner && <>
        <div className="space-y-1">
          <p><strong>Exact Account:</strong> {owner.displayName} · {owner.accountRef} · ID {owner.accountId}</p>
          <p>Stored email: {owner.maskedEmail ?? "none on file"} <span className="muted">(not verified by this display)</span></p>
          <p>Account status: {owner.isActive ? "Active" : "Inactive"}</p>
          <p><strong>Player:</strong> {target.name} · ID {target.playerId} · rating {target.rating} · {historyText(target.history)}</p>
          <p>Roster membership: {target.member ? `ID ${target.member.memberId} · ${target.member.archivedAt ? `archived ${new Date(target.member.archivedAt).toLocaleDateString()}` : "active"}` : "No existing membership"}</p>
          <p>Club access: {target.clubAccess ? `${target.clubAccess.status}${target.clubAccess.role ? ` · ${target.clubAccess.role}` : ""}` : "NONE"}</p>
        </div>
        {target.member?.retiredByAdmissionEventId && <p role="alert">This Player has been retired and cannot receive restored access.</p>}
        {accessRestoreBlocked && <ul role="alert" className="list-disc pl-5">{target.accessRestoreBlockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
        {target && owner && !owner.isActive && <p role="alert">This Account is inactive. An active account must receive the invitation.</p>}
      {target && owner && !target.isActive && <p role="alert">This Player is inactive and cannot be restored by an invitation.</p>}
      {target && owner && !target.member && <p role="alert">Access restoration preserves an existing roster row; it cannot create a new Player membership.</p>}
      {expiredActiveInvitation && <p role="status">The previous invitation expired {new Date(expiredActiveInvitation.expiresAt).toLocaleString()}; it will be cleared before a new invitation is issued.</p>}
      {activeClaimInvitation && <div className="space-y-2 rounded border border-amber-200 p-3">
        <p>{activeClaimInvitationExpired ? `This profile invitation expired ${new Date(activeClaimInvitation.expiresAt).toLocaleString()}. Close this expired invitation entry.` : `Profile invitation ID ${activeClaimInvitation.id} expires ${new Date(activeClaimInvitation.expiresAt).toLocaleString()}. It cannot be used to claim an already-owned Player and may block an identity correction until it is revoked or expires.`}</p>
        <button type="button" className="app-button-danger px-4 py-2" disabled={busy} onClick={() => void revokeOwnedPlayerClaimInvitation()}>{busy ? "Updating invitation…" : activeClaimInvitationExpired ? "Close expired profile invitation" : "Revoke this profile invitation"}</button>
      </div>}
      {notice && <p role="status">{notice}</p>}
      {!accessNeeded && !blocked && <p role="status">This Account already has active club access and an active roster row. No restoration invitation is needed.</p>}
        {accessNeeded && !blocked && <>
          <p>{accessDescription(target.clubAccess)}</p>
          <label className="field-label">Reason for access restoration<textarea rows={3} maxLength={1000} value={reason} onChange={event => { setReason(event.target.value); setReviewConfirmed(false); }} /></label>
          {needsAccessConfirmation && <label className="field-label"><span><input type="checkbox" checked={accessConfirmed} disabled={busy} onChange={event => { setAccessConfirmed(event.target.checked); setReviewConfirmed(false); }} /> I explicitly authorize {action === "RESTORE_MEMBER" ? "restoring this Account’s access as MEMBER" : "granting this Account MEMBER access"}.</span></label>}
          {targetMembershipArchived && <label className="field-label"><span><input type="checkbox" checked={rosterConfirmed} disabled={busy} onChange={event => { setRosterConfirmed(event.target.checked); setReviewConfirmed(false); }} /> I explicitly authorize unarchiving this existing roster membership.</span></label>}
          {activeInvitation && <label className="field-label"><span><input type="checkbox" checked={replacementConfirmed} disabled={busy} onChange={event => { setReplacementConfirmed(event.target.checked); setReviewConfirmed(false); }} /> Replace the active {activeInvitation.purpose} invitation (ID {activeInvitation.id}, expires {new Date(activeInvitation.expiresAt).toLocaleString()}); its current link will stop working.</span></label>}
          <div className="rounded border border-gray-200 p-3">
            <strong>Review the access change</strong>
            <p>Account {owner.accountRef} (ID {owner.accountId}) will keep Player {target.playerId} and its history. No Player will be created, reassigned, merged, or retired.</p>
            <p>{accessDescription(target.clubAccess)} {targetMembershipArchived ? `The same roster row ${target.member?.memberId} will be unarchived.` : "The existing roster row stays in place."}</p>
          </div>
          <label className="field-label"><span><input type="checkbox" checked={reviewConfirmed} disabled={busy || !reason.trim() || (needsAccessConfirmation && !accessConfirmed) || (targetMembershipArchived && !rosterConfirmed) || (!!activeInvitation && !replacementConfirmed)} onChange={event => setReviewConfirmed(event.target.checked)} /> I reviewed the exact Account, Player ID, reason, and access/roster changes.</span></label>
          <button type="button" className="app-button-primary px-4 py-2" disabled={!canIssue} onClick={() => void createAccessRestore()}>{busy ? "Creating invitation…" : "Create access restoration invitation"}</button>
        </>}
      </>}
      {created?.purpose === "ACCESS_RESTORE" && <CreatedInvitationLink created={created} copied={copied} onCopy={() => void copyLink()} />}
      {error && <p role="alert">{error}</p>}
    </section>;
  }

  return <section className="mt-4 space-y-3">
    {!correctionOpen && <button type="button" className="app-button-secondary px-4 py-2" onClick={openCorrection}>Correct existing account connection</button>}
    {correctionOpen && <div className="app-panel-muted space-y-3 p-4" aria-label="Correct existing account connection">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Correct existing account connection</h3>
        <button type="button" className="text-button" disabled={busy} onClick={() => { setCorrectionOpen(false); setSelected(null); setCreated(null); setError(""); }}>Close</button>
      </div>
      {options.error && <p role="alert">{options.error}</p>}
      {!target && !options.error && <p role="status">Loading the original Player and scoped Account options…</p>}
      {target && <>
        <div className="space-y-1">
          <p><strong>Original Player:</strong> {target.name} · ID {target.playerId} · rating {target.rating} · {historyText(target.history)}</p>
          <p>Roster membership: {target.member ? `ID ${target.member.memberId} · ${target.member.archivedAt ? `archived ${new Date(target.member.archivedAt).toLocaleDateString()}` : "active"}` : "none"}</p>
        </div>
        {target.ownerAccount && <p role="alert">This original Player is already owned by Account {target.ownerAccount.accountRef} (ID {target.ownerAccount.accountId}); correction is unavailable.</p>}
        {!target.isActive && <p role="alert">This original Player is inactive and cannot be claimed by a correction invitation.</p>}
        {target.member?.retiredByAdmissionEventId && <p role="alert">This original Player has already been retired.</p>}
        {targetMembershipArchived && <p role="alert">This original Player membership is archived. Correction invitations cannot restore archived target memberships; use access restoration only for a Player already owned by the intended Account.</p>}
        {expiredActiveInvitation && <p role="status">The previous invitation expired {new Date(expiredActiveInvitation.expiresAt).toLocaleString()}; it will be cleared before a new correction invitation is issued.</p>}
        {activeInvitation && <p>The active {activeInvitation.purpose} invitation expires {new Date(activeInvitation.expiresAt).toLocaleString()}. Replacement requires explicit confirmation below.</p>}
        {target.ownerAccount === null && target.isActive && target.member && !target.member.retiredByAdmissionEventId && !targetMembershipArchived && <form className="space-y-3" onSubmit={event => { event.preventDefault(); setSearchedQuery(query.trim()); setSelected(null); setCreated(null); setError(""); }}>
          <label className="field-label">Find a relevant Account<input value={query} maxLength={64} onChange={event => setQuery(event.target.value)} placeholder="Account name or stored email" /></label>
          <button type="submit" className="app-button-secondary px-4 py-2" disabled={busy}>{busy ? "Searching…" : "Search Accounts"}</button>
        </form>}
        {target.ownerAccount === null && target.isActive && target.member && !target.member.retiredByAdmissionEventId && !targetMembershipArchived && options.data && <>
          <p className="muted">Only Accounts associated with this club appear. Choose by immutable Account ID and the exact source Player; names and stored email are hints only. Stored email is not verified.</p>
          <div className="space-y-3" aria-label="Scoped Account options">
            {options.data.correctionCandidates.length === 0 ? <p>No matching Account and source Player pair was found.</p> : options.data.correctionCandidates.map(candidate => {
              const key = candidateKey(candidate);
              const checked = selected?.accountId === candidate.account.accountId && selected.sourcePlayerId === candidate.source.playerId;
              const active = candidate.account.isActive;
              const historyBlockers = candidate.source.history.blockers;
              const blockers = [...new Set([...candidate.blockers, ...historyBlockers])];
              return <label key={key} className={`block rounded border p-3 ${checked ? "border-violet-500" : "border-gray-200"}`}>
                <span className="flex items-start gap-3">
                  <input type="radio" name={`identity-${playerId}`} checked={checked} disabled={!candidate.eligible || !active || busy} onChange={() => chooseCandidate(candidate)} />
                  <span className="space-y-1">
                    <strong>{candidate.account.displayName} · {candidate.account.accountRef}</strong>
                    <span className="block text-sm">Account ID {candidate.account.accountId} · {active ? "Active Account" : "Inactive Account"}</span>
                    <span className="block text-sm">Stored email: {candidate.account.maskedEmail ?? "none on file"} (not verified)</span>
                    <span className="block text-sm"><strong>Source Player:</strong> {candidate.source.name} · ID {candidate.source.playerId} · rating {candidate.source.rating} · {historyText(candidate.source.history)}</span>
                    <span className="block text-sm">Source Player status: {candidate.source.isActive ? "active" : "inactive"}; membership ID {candidate.source.memberId}{candidate.source.archivedAt ? ` · archived ${new Date(candidate.source.archivedAt).toLocaleDateString()}` : " · not archived"}</span>
                    <span className="block text-sm">Club access: {candidate.source.clubAccess.status}{candidate.source.clubAccess.role ? ` · ${candidate.source.clubAccess.role}` : ""}{candidate.source.clubAccess.revision !== null ? ` · revision ${candidate.source.clubAccess.revision}` : ""}</span>
                    {!candidate.eligible && <span className="block text-sm font-medium text-red-700">Not eligible</span>}
                    {blockers.length > 0 && <ul className="list-disc pl-5 text-sm" aria-label={`Eligibility details for ${candidate.account.accountRef}`}>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
                  </span>
                </span>
              </label>;
            })}
          </div>
        </>}
        {selectedCandidate && <>
          <div className="space-y-3 rounded border border-violet-200 p-3" aria-label="Correction authorization review">
            <strong>Review the exact correction</strong>
            <p>Recipient Account {selectedCandidate.account.accountRef} · ID {selectedCandidate.account.accountId} · {selectedCandidate.account.displayName}. Stored email {selectedCandidate.account.maskedEmail ?? "none on file"} is not verified.</p>
            <p>Retire source Player {selectedCandidate.source.name} · ID {selectedCandidate.source.playerId} · membership {selectedCandidate.source.memberId}; preserve its permanent Account ownership and sporting history. The original Player {target.name} · ID {target.playerId} will be assigned to this Account. No records will be merged.</p>
            <p>{accessDescription(selectedCandidate.source.clubAccess)} The original roster row {target.member?.memberId} is active.</p>
            <p>Original history: rating {target.rating} · {historyText(target.history)}. Source history: rating {selectedCandidate.source.rating} · {historyText(selectedCandidate.source.history)}.</p>
          </div>
          <label className="field-label">Correction reason<textarea rows={3} maxLength={1000} value={reason} onChange={event => { setReason(event.target.value); setReviewConfirmed(false); }} /></label>
          <label className="field-label"><span><input type="checkbox" checked={retireConfirmed} disabled={busy || !selectedCandidate.eligible} onChange={event => { setRetireConfirmed(event.target.checked); setReviewConfirmed(false); }} /> I explicitly authorize retiring source Player {selectedCandidate.source.playerId} after the recipient confirms.</span></label>
          {accessConsentRequired(selectedCandidate.source.clubAccess) && <label className="field-label"><span><input type="checkbox" checked={accessConfirmed} disabled={busy} onChange={event => { setAccessConfirmed(event.target.checked); setReviewConfirmed(false); }} /> I explicitly authorize {accessAction(selectedCandidate.source.clubAccess) === "RESTORE_MEMBER" ? "restoring revoked club access as MEMBER" : "granting club access as MEMBER"}.</span></label>}
          {activeInvitation && <label className="field-label"><span><input type="checkbox" checked={replacementConfirmed} disabled={busy} onChange={event => { setReplacementConfirmed(event.target.checked); setReviewConfirmed(false); }} /> Replace active {activeInvitation.purpose} invitation ID {activeInvitation.id}; its link will be revoked and a new invitation ID/secret will be created.</span></label>}
          <label className="field-label"><span><input type="checkbox" checked={reviewConfirmed} disabled={busy || !retireConfirmed || !reason.trim() || (accessConsentRequired(selectedCandidate.source.clubAccess) && !accessConfirmed) || (!!activeInvitation && !replacementConfirmed)} onChange={event => setReviewConfirmed(event.target.checked)} /> I reviewed the exact Account, source and original Player IDs, eligibility, reason, retirement, and access effects.</span></label>
          <button type="button" className="app-button-primary px-4 py-2" disabled={busy || !selectedCandidate.eligible || !selectedCandidate.account.isActive || !target.isActive || !!target.ownerAccount || targetMembershipArchived || !retireConfirmed || !reason.trim() || (accessConsentRequired(selectedCandidate.source.clubAccess) && !accessConfirmed) || (!!activeInvitation && !replacementConfirmed) || !reviewConfirmed} onClick={() => void createCorrection()}>{busy ? "Creating invitation…" : "Create correction invitation"}</button>
        </>}
      </>}
      {created?.purpose === "CORRECTION" && <CreatedInvitationLink created={created} copied={copied} onCopy={() => void copyLink()} />}
      {error && <p role="alert">{error}</p>}
    </div>}
  </section>;
}

function CreatedInvitationLink({ created, copied, onCopy }: { created: CreatedLink; copied: boolean; onCopy: () => void }) {
  return <div className="space-y-2 rounded border border-green-200 p-3" role="status" aria-label="Secure invitation ready">
    <strong>{created.purpose === "CORRECTION" ? "Correction invitation ready" : "Access restoration invitation ready"}</strong>
    <p>Expires {new Date(created.expiresAt).toLocaleString()}. The secure link is shown only now; copy it before leaving this page.</p>
    <button type="button" className="app-button-secondary px-4 py-2" onClick={onCopy}>{copied ? "Link copied" : "Copy secure link"}</button>
    <p className="break-all text-sm">{created.url}</p>
  </div>;
}
