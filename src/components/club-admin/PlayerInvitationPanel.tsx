"use client";

import { useState } from "react";
import { api, useAction, useResource } from "@/components/prototype/api";
import { playerInvitationQr } from "@/lib/playerInvitationQr";

type InvitationSummary = { id: string; status: string; createdAt: string; expiresAt: string };
type InvitationResponse = { invitation: InvitationSummary | null; secret?: string };
export function PlayerInvitationPanel({ clubId, playerId, playerName, rating, matchesPlayed, connected }: {
  clubId: string; playerId: string; playerName: string; rating: number; matchesPlayed?: number; connected: boolean;
}) {
  const endpoint = `/api/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(playerId)}/invitations`;
  const resource = useResource<InvitationResponse>(connected ? null : endpoint);
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const action = useAction(resource.refresh);
  const invitation = resource.data?.invitation;
  const url = invitation?.id === created?.id ? created?.url : null;
  const qr = showQr && url ? playerInvitationQr(url) : null;
  async function manage(operation: "CREATE" | "REPLACE" | "REVOKE") {
    const result = await api<InvitationResponse>(endpoint, "POST", { action: operation, ...(invitation ? { invitationId: invitation.id } : {}) });
    setCreated(result.secret && result.invitation ? { id: result.invitation.id, url: `${location.origin}/player-invites/${encodeURIComponent(result.invitation.id)}#${result.secret}` } : null);
    setShowQr(false);
    setCopied(false);
  }
  return <section className="app-panel-muted space-y-3 p-4" aria-label="Player account connection">
    <strong>Account: {connected ? "Connected" : "Not connected"}</strong>
    {!connected && <>
      <p>{playerName} · Rating {rating}{matchesPlayed !== undefined ? ` · ${matchesPlayed} matches` : ""}</p>
      {(action.error || resource.error) && <p role="alert">{action.error || resource.error}</p>}
      {invitation ? <>
        <h3>Invite {playerName}</h3>
        <p>Active invitation · Created {new Date(invitation.createdAt).toLocaleString()}</p>
        <p>Expires {new Date(invitation.expiresAt).toLocaleString()}</p>
        {url ? <>
          <button className="app-button-secondary px-4 py-2" type="button" disabled={action.busy} onClick={() => void action.run(async () => { await navigator.clipboard.writeText(url); setCopied(true); })}>{copied ? "Link copied" : "Copy link"}</button>
          <button className="app-button-secondary px-4 py-2" type="button" onClick={() => setShowQr(!showQr)}>{showQr ? "Hide QR" : "Show QR"}</button>
          {qr && <svg role="img" aria-label={`Invitation QR for ${playerName}`} viewBox={`0 0 ${qr.size} ${qr.size}`} width="256" height="256" style={{ maxWidth: "100%", background: "white" }}><rect width={qr.size} height={qr.size} fill="white" /><path d={qr.path} fill="black" /></svg>}
          <p className="muted">Copy the link now. It cannot be retrieved after closing this page.</p>
        </> : <>
          <p>The original link is available only when created.</p>
          <button className="app-button-secondary px-4 py-2" type="button" disabled={action.busy} onClick={() => { if (window.confirm("Revoke the current link and create a replacement? The current link will stop working.")) void action.run(() => manage("REPLACE")); }}>Revoke and create replacement</button>
        </>}
        <button className="app-button-danger px-4 py-2" type="button" disabled={action.busy} onClick={() => void action.run(() => manage("REVOKE"))}>Revoke invite</button>
      </> : resource.data && <button className="app-button-secondary px-4 py-2" type="button" disabled={action.busy} onClick={() => void action.run(() => manage("CREATE"))}>Invite player</button>}
      <p className="muted">Share privately with this person. Anyone with the link can claim the profile.</p>
    </>}
  </section>;
}
