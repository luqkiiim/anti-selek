"use client";
import { useState } from "react";
import { api, useAction, useResource } from "@/components/prototype/api";
export function RemovedPlayerAccounts({ clubId, onChanged }: { clubId: string; onChanged: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const endpoint = `/api/clubs/${encodeURIComponent(clubId)}`;
  const resource = useResource<{ players: Array<{ id: string; name: string }> }>(open ? `${endpoint}/removed-players` : null);
  const action = useAction(async () => { await resource.refresh(); await onChanged(); });
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  return <section className="app-panel-muted space-y-3 p-4">
    <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>Removed players</button>
    {open && <>
      <p>Disconnect an account from a removed Player, then invite them to their original profile. All Player history stays intact.</p>
      {(resource.error || action.error) && <p role="alert">{resource.error || action.error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!resource.data && !resource.error && <p>Loading removed players…</p>}
      {resource.data?.players.length === 0 && <p>No removed Players have a connected account.</p>}
      {resource.data?.players.map(player => <div key={player.id} className="flex flex-wrap items-center justify-between gap-3">
        <strong>{player.name}</strong>
        <button type="button" className="app-button-secondary px-4 py-2" disabled={action.busy} onClick={() => setPending(player)}>Disconnect account</button>
      </div>)}
      {pending && <div role="group" aria-label="Confirm account disconnect" className="space-y-3">
        <p>Disconnect the account from <strong>{pending.name}</strong>? This Player becomes unclaimed and keeps its history and rating. You must administer every club this Player belongs to.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="app-button-danger px-4 py-2" disabled={action.busy} onClick={() => void action.run(async () => {
            await api(`${endpoint}/members/${encodeURIComponent(pending.id)}/ownership-release`, "POST", { confirm: true });
            setPending(null);
            setNotice("Account disconnected. Open the original Player and choose Invite player.");
          })}>Confirm disconnect</button>
          <button type="button" className="app-button-secondary px-4 py-2" disabled={action.busy} onClick={() => setPending(null)}>Cancel</button>
        </div>
      </div>}
    </>}
  </section>;
}
