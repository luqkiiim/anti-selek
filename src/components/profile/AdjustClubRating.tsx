"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModalFrame, FlashMessage } from "@/components/ui/chrome";
import { useAdminAction } from "@/components/club-admin/useAdminAction";
import { adminApi } from "@/lib/adminClient";

type Entry = { id: string; beforeElo: number; afterElo: number; reason: string; actorName: string; createdAt: string };
type RatingSnapshot = { rating: number; history: Entry[] };
type RatingSave = { rating: number };

export function AdjustClubRating({ clubId, userId, name, onChanged }: { clubId: string; userId: string; name: string; onChanged?: (rating: number) => void }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [rating, setRating] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const readRevision = useRef(0);
  const activeRead = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const portalContainer = useRef<HTMLElement | null>(null);
  const endpoint = `/api/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(userId)}/rating`;

  const loadRating = useCallback(async () => {
    const revision = ++readRevision.current;
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    setLoading(true);
    try {
      const data = await adminApi<RatingSnapshot>(endpoint, "GET", undefined, { signal: controller.signal });
      if (!mounted.current || revision !== readRevision.current) return;
      setCurrent(data.rating);
      setRating(String(data.rating));
      setHistory(data.history);
      setReady(true);
      setError("");
      return data;
    } catch (failure) {
      if (!mounted.current || revision !== readRevision.current) return;
      setError(failure instanceof Error ? failure.message : "Could not load rating");
      throw failure;
    } finally {
      if (activeRead.current === controller) activeRead.current = null;
      if (mounted.current && revision === readRevision.current) setLoading(false);
    }
  }, [endpoint]);

  const action = useAdminAction(loadRating);

  useEffect(() => {
    const revisionRef = readRevision;
    const activeReadRef = activeRead;
    mounted.current = true;
    return () => {
      mounted.current = false;
      revisionRef.current++;
      activeReadRef.current?.abort();
      activeReadRef.current = null;
    };
  }, []);

  function show() {
    if (action.uncertain || action.busy) return;
    const nativeDialog = triggerRef.current?.closest("dialog[open]");
    portalContainer.current = nativeDialog instanceof HTMLElement ? nativeDialog : document.body;
    setOpen(true);
    setReady(false);
    setReason("");
    setSuccess("");
    setError("");
    action.setError("");
    void loadRating().catch(() => {});
  }

  function close() {
    // A recovery read must finish so the action hook can clear uncertainty only
    // after it has successfully checked the server state.
    if (!action.refreshing) {
      readRevision.current++;
      activeRead.current?.abort();
      activeRead.current = null;
      setLoading(false);
    }
    setOpen(false);
  }

  function save() {
    if (!valid || action.busy || action.uncertain) return;
    setError("");
    void action.run(
      signal => adminApi<RatingSave>(endpoint, "POST", { rating: Number(rating), expectedRating: current, reason }, { signal }),
      saved => {
        setCurrent(saved.rating);
        setRating(String(saved.rating));
        setOpen(false);
        setSuccess("Rating updated");
        onChanged?.(saved.rating);
      },
    );
  }

  const valid = rating.trim() !== "" && Number.isInteger(Number(rating)) && Number(rating) >= 0 && Number(rating) <= 5000 && Number(rating) !== current && reason.trim().length > 0;
  const saving = action.busy;
  const closeBlocked = saving;
  const recovery = action.uncertain || action.refreshWarning;

  return <div className="space-y-2">
    <button ref={triggerRef} type="button" className="app-button-secondary" disabled={saving || action.uncertain} onClick={show}>Adjust rating</button>
    {success ? <p role="status" className="text-sm text-teal-800">{success}</p> : null}
    {!open && recovery ? <div role="status" className="space-y-1 text-sm">
      {action.error ? <p>{action.error}</p> : null}
      {action.refreshWarning ? <p>{action.refreshWarning}</p> : null}
      <button type="button" className="text-teal-800 hover:underline" disabled={action.refreshing} onClick={() => void action.retryRefresh()}>{action.refreshing ? "Refreshing…" : action.uncertain ? "Refresh to check" : "Refresh details"}</button>
    </div> : null}
    {open ? <ModalFrame title="Adjust rating" subtitle={name} onClose={() => { if (!closeBlocked) close(); }} portalContainer={portalContainer.current} backdropClassName="app-modal-backdrop-above-sheet"
      footer={<div className="flex justify-end gap-2"><button type="button" className="app-button-secondary" disabled={closeBlocked} onClick={close}>Cancel</button><button type="button" className="app-button-primary" disabled={!ready || loading || saving || action.uncertain || !valid} onClick={save}>{saving ? "Saving…" : "Save adjustment"}</button></div>}>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {action.error || error ? <FlashMessage tone="error">{action.error || error}</FlashMessage> : null}
        {action.refreshWarning ? <p role="status" className="text-sm">{action.refreshWarning}</p> : null}
        {action.uncertain ? <div role="status"><button type="button" className="text-teal-800 hover:underline" disabled={action.refreshing} onClick={() => void action.retryRefresh()}>{action.refreshing ? "Refreshing…" : "Refresh to check"}</button></div> : null}
        {loading ? <p role="status">Loading rating…</p> : ready ? <>
          <p className="text-sm text-gray-600">Current rating: <strong>{current}</strong></p>
          <label className="block space-y-2 text-sm font-medium">New rating<input className="field" type="number" min="0" max="5000" step="1" value={rating} disabled={saving || action.uncertain} onChange={e => setRating(e.target.value)} /></label>
          <label className="block space-y-2 text-sm font-medium">Reason<textarea className="field" maxLength={300} rows={2} value={reason} disabled={saving || action.uncertain} onChange={e => setReason(e.target.value)} /></label>
          {valid ? <p className="text-sm font-semibold">{current} → {Number(rating)}</p> : null}
          <details className="border-t border-gray-100 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-gray-500">Adjustment history</summary>
            {history.length ? <ul className="space-y-3">{history.map(entry => <li key={entry.id} className="space-y-1 border-b border-gray-100 pb-3"><p className="font-medium">{entry.beforeElo} → {entry.afterElo}</p><p>{entry.reason}</p><p className="text-xs text-gray-500">{entry.actorName} · {new Date(entry.createdAt).toLocaleString()}</p><button type="button" className="min-h-11 text-teal-800 hover:underline" disabled={saving || action.uncertain} onClick={() => { setRating(String(entry.beforeElo)); setReason(`Restore previous rating from ${new Date(entry.createdAt).toLocaleDateString()}`); }}>Use previous rating</button></li>)}</ul> : <p className="pb-3 text-gray-500">No manual adjustments yet.</p>}
          </details>
        </> : null}
      </div>
    </ModalFrame> : null}
  </div>;
}
