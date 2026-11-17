"use client";

import { useState, type ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { api, useAction, useResource } from "@/components/product/api";
import { Sheet } from "@/components/product/Primitives";
import { playerInvitationQr } from "@/lib/playerInvitationQr";

type InvitationSummary = { id: string; purpose?: string; status: string; createdAt: string; expiresAt: string };
type InvitationResponse = { invitation: InvitationSummary | null; secret?: string };
export function PlayerInvitationPanel({ clubId, playerId, playerName, connected, accountEmail, disabled = false, children }: {
  clubId: string; playerId: string; playerName: string; connected: boolean; accountEmail?: string | null;
  disabled?: boolean; children?: ReactNode;
}) {
  const endpoint = `/api/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(playerId)}/invitations`;
  const resource = useResource<InvitationResponse>(connected ? null : endpoint);
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const action = useAction();
  const invitation = resource.data?.invitation;
  const expired = !!invitation && new Date(invitation.expiresAt).getTime() <= checkedAt;
  const url = invitation?.id === created?.id ? created?.url : null;
  const qr = open && showQr && url ? playerInvitationQr(url) : null;
  function openDetails() {
    setCheckedAt(Date.now());
    setOpen(true);
  }
  async function manage(operation: "CREATE" | "REPLACE" | "REVOKE") {
    const result = await api<InvitationResponse>(endpoint, "POST", { action: operation, ...(invitation ? { invitationId: invitation.id } : {}) });
    resource.update(() => ({ invitation: result.invitation }));
    setCreated(result.secret && result.invitation ? { id: result.invitation.id, url: `${location.origin}/player-invites/${encodeURIComponent(result.invitation.id)}#${result.secret}` } : null);
    setShowQr(false);
    setCopied(false);
  }
  return <>
    <section className="manage-player-account" aria-label="Player account connection">
      <div className="manage-player-account-label"><small>Account</small><strong>{connected ? accountEmail || "Connected" : "Not connected"}</strong></div>
      {connected
        ? <button className="icon-button" type="button" aria-label="Account options" aria-haspopup="dialog" disabled={disabled} onClick={openDetails}><DotsThree size={24} weight="bold" /></button>
        : <button className="secondary" type="button" aria-haspopup="dialog" disabled={disabled} onClick={openDetails}>Invite player</button>}
    </section>
    <Sheet open={open} title={connected ? "Account connection" : `Invite ${playerName}`} busy={action.busy} onClose={() => setOpen(false)}>
      {connected ? <div className="player-account-options">
        <p>{accountEmail || "Account connected"}</p>
        <p className="muted">To change the connected account, remove this player from the club, then invite the correct profile.</p>
        {children}
      </div> : <div className="player-invitation-details">
        {(action.error || resource.error) && <p role="alert">{action.error || resource.error}</p>}
        {!resource.data && !resource.error && <p role="status">Loading invitation…</p>}
        {resource.error && <button className="secondary" type="button" disabled={action.busy} onClick={() => void action.run(resource.refresh)}>Try again</button>}
        {invitation ? <>
          <p className="muted">{expired ? "Invitation expired" : `Expires ${new Date(invitation.expiresAt).toLocaleString()}`}</p>
          {expired ? <button className="primary" type="button" disabled={disabled || action.busy} onClick={() => void action.run(() => manage("CREATE"))}>Create new invitation</button> : <>
            {url ? <>
              <input aria-label="Invitation link" readOnly value={url} onFocus={event => event.currentTarget.select()} />
              <div className="player-invitation-actions">
                <button className="secondary" type="button" disabled={action.busy} onClick={() => void action.run(async () => { await navigator.clipboard.writeText(url); setCopied(true); })}>{copied ? "Link copied" : "Copy link"}</button>
                <button className="secondary" type="button" onClick={() => setShowQr(!showQr)}>{showQr ? "Hide QR" : "Show QR"}</button>
              </div>
              {qr && <svg role="img" aria-label={`Invitation QR for ${playerName}`} viewBox={`0 0 ${qr.size} ${qr.size}`} width="256" height="256"><rect width={qr.size} height={qr.size} fill="white" /><path d={qr.path} fill="black" /></svg>}
              <p className="muted">Save this link now. It cannot be retrieved after closing the editor.</p>
            </> : <>
              <p>The original link is available only when created.</p>
              {(!invitation.purpose || invitation.purpose === "CLAIM")
                ? <button className="secondary" type="button" disabled={disabled || action.busy} onClick={() => { if (window.confirm("Revoke the current link and create a replacement? The current link will stop working.")) void action.run(() => manage("REPLACE")); }}>Replace invitation</button>
                : <p>Revoke this invitation to create a new profile invitation.</p>}
            </>}
            <button className="text-button danger-text" type="button" disabled={disabled || action.busy} onClick={() => void action.run(() => manage("REVOKE"))}>Revoke invite</button>
          </>}
        </> : resource.data && <button className="primary" type="button" disabled={disabled || action.busy} onClick={() => void action.run(() => manage("CREATE"))}>Create invitation</button>}
        <p className="muted">Share only with {playerName}. Anyone with the link can claim this profile.</p>
      </div>}
    </Sheet>
  </>;
}
