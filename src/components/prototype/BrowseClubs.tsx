"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Avatar, ErrorText, Sheet } from "./Primitives";

export type BrowsableClub = { id: string; name: string; avatarUrl: string | null; membersCount: number; sessionsCount: number };
type Page = { clubs: BrowsableClub[]; nextCursor: string | null };
export function BrowseClubs({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (club: BrowsableClub) => void }) {
  const [query, setQuery] = useState("");
  const [clubs, setClubs] = useState<BrowsableClub[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const version = useRef(0), lock = useRef(false);
  useEffect(() => {
    const request = ++version.current;
    if (!open) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setBusy(true); setError(""); setClubs([]); setNextCursor(null);
      try {
        const page = await api<Page>(`/api/admin/clubs?q=${encodeURIComponent(query)}`);
        if (!cancelled && request === version.current) { setClubs(page.clubs); setNextCursor(page.nextCursor); }
      } catch (e) { if (!cancelled && request === version.current) setError(e instanceof Error ? e.message : "Unable to load clubs."); }
      finally { if (!cancelled && request === version.current) setBusy(false); }
    });
    return () => { cancelled = true; };
  }, [open, query]);
  async function loadMore() {
    if (!nextCursor || busy || lock.current) return;
    lock.current = true; const request = version.current; setBusy(true); setError("");
    try {
      const page = await api<Page>(`/api/admin/clubs?q=${encodeURIComponent(query)}&cursor=${encodeURIComponent(nextCursor)}`);
      if (request === version.current) { setClubs(old => [...old, ...page.clubs.filter(c => !old.some(existing => existing.id === c.id))]); setNextCursor(page.nextCursor); }
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : "Unable to load clubs."); }
    finally { lock.current = false; if (request === version.current) setBusy(false); }
  }
  return <Sheet open={open} title="Browse clubs" onClose={onClose}>
    <label className="field-label">Club name<input aria-label="Search clubs" type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    {clubs.map(club => <button key={club.id} className="club-choice" onClick={() => onSelect(club)}><Avatar name={club.name} url={club.avatarUrl} /><span><strong>{club.name}</strong><small>{club.membersCount} players · {club.sessionsCount} sessions</small></span></button>)}
    {busy && <p role="status">Loading clubs…</p>}<ErrorText error={error} />
    {nextCursor && <button className="secondary" disabled={busy} onClick={() => void loadMore()}>Load more</button>}
  </Sheet>;
}
