"use client";

import { useState } from "react";
import type { SessionData } from "@/components/session/sessionTypes";
import { useClubDataStore } from "@/components/app/ClubDataProvider";
import { adminApi } from "@/lib/adminClient";
import { ErrorText, Sheet } from "./Primitives";
import "./first-session.css";

export function SaveSessionGuests({ session }: { session: SessionData }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState("");
  const store = useClubDataStore();
  const guests = session.players.flatMap(player => {
    const clubId = player.representingClubId ?? session.clubId;
    return player.isGuest && clubId && session.viewerAdminClubIds?.includes(clubId)
      ? [{ ...player, clubId, key: `${clubId}:${player.userId}` }] : [];
  });
  if (session.status !== "COMPLETED" || session.isTest || !guests.length || session.viewerIsQuickAccess) return null;

  async function loadMemberships() {
    const memberships = await Promise.all([...new Set(guests.map(guest => guest.clubId))].map(async clubId => {
      const roster = await adminApi<Array<{ id: string }>>(`/api/clubs/${encodeURIComponent(clubId)}/members`);
      return roster.map(member => `${clubId}:${member.id}`);
    }));
    setAdded(memberships.flat());
    setLoaded(true);
  }
  async function refresh() {
    setBusy(true); setError("");
    try { await loadMemberships(); }
    catch (failure) { setLoaded(false); setError(failure instanceof Error ? failure.message : "Unable to load club players."); }
    finally { setBusy(false); }
  }
  async function save(guest: typeof guests[number]) {
    if (busy || added.includes(guest.key)) return;
    setBusy(true); setError("");
    try {
      await adminApi(`/api/clubs/${encodeURIComponent(guest.clubId)}/guests/${encodeURIComponent(guest.userId)}`, "POST");
      setAdded(current => [...current, guest.key]);
      void store?.refreshClub(guest.clubId).catch(() => {});
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save player.");
      // Check the existing membership before offering another write after a lost response.
      setLoaded(false);
      try { await loadMemberships(); } catch { /* The refresh action remains available. */ }
    } finally { setBusy(false); }
  }
  return <>
    <button className="secondary full" type="button" onClick={() => { setOpen(true); void refresh(); }}>Save guests to club</button>
    <Sheet open={open} title="Save guests to club" busy={busy} onClose={() => setOpen(false)}>
      <p className="muted">Keep their rating and match history for future sessions. No account needed.</p>
      <ErrorText error={error} />
      {!loaded && !busy && <button className="secondary" type="button" onClick={() => void refresh()}>Refresh to check</button>}
      {busy && !loaded && <p role="status">Loading club players…</p>}
      {guests.map(guest => <div className="guest-save-row" key={guest.key}>
        <span><strong>{guest.user.name}</strong>{new Set(guests.map(item => item.clubId)).size > 1 && <small> · {session.clubs?.find(club => club.id === guest.clubId)?.name}</small>}</span>
        {added.includes(guest.key) ? <span role="status">Added</span> : <button type="button" className="secondary" disabled={busy || !loaded} onClick={() => void save(guest)}>Add to club</button>}
      </div>)}
    </Sheet>
  </>;
}
