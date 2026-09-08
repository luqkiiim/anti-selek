"use client";
import { useState } from "react";
import { ModalFrame, FlashMessage } from "@/components/ui/chrome";
type Entry = { id: string; beforeElo: number; afterElo: number; reason: string; actorName: string; createdAt: string };
export function AdjustClubRating({ clubId, userId, name, onChanged }: { clubId: string; userId: string; name: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(0);
  const [rating, setRating] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const endpoint = `/api/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(userId)}/rating`;
  async function show() {
    setOpen(true); setReady(false); setLoading(true); setError(""); setReason(""); setSuccess("");
    try {
      const response = await fetch(endpoint);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load rating");
      setCurrent(data.rating); setRating(String(data.rating)); setHistory(data.history); setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load rating"); }
    finally { setLoading(false); }
  }
  async function save() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: Number(rating), expectedRating: current, reason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save rating");
      setOpen(false); setSuccess("Rating updated"); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save rating"); }
    finally { setSaving(false); }
  }
  const valid = rating.trim() !== "" && Number.isInteger(Number(rating)) && Number(rating) >= 0 && Number(rating) <= 5000 && Number(rating) !== current && reason.trim().length > 0;
  return <div className="space-y-2">
    <button type="button" className="app-button-secondary" onClick={() => void show()}>Adjust rating</button>
    {success ? <p role="status" className="text-sm text-teal-800">{success}</p> : null}
    {open ? <ModalFrame title="Adjust rating" subtitle={name} onClose={() => { if (!saving) setOpen(false); }} backdropClassName="app-modal-backdrop-above-sheet"
      footer={<div className="flex justify-end gap-2"><button type="button" className="app-button-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button><button type="button" className="app-button-primary" disabled={!ready || loading || saving || !valid} onClick={() => void save()}>{saving ? "Saving…" : "Save adjustment"}</button></div>}>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
        {loading ? <p role="status">Loading rating…</p> : <>
          <p className="text-sm text-gray-600">Current rating: <strong>{current}</strong></p>
          <label className="block space-y-2 text-sm font-medium">New rating<input className="field" type="number" min="0" max="5000" step="1" value={rating} disabled={saving} onChange={e => setRating(e.target.value)} /></label>
          <label className="block space-y-2 text-sm font-medium">Reason<textarea className="field" maxLength={300} rows={2} value={reason} disabled={saving} onChange={e => setReason(e.target.value)} /></label>
          {valid ? <p className="text-sm font-semibold">{current} → {Number(rating)}</p> : null}
          <details className="border-t border-gray-100 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-gray-500">Adjustment history</summary>
            {history.length ? <ul className="space-y-3">{history.map(entry => <li key={entry.id} className="space-y-1 border-b border-gray-100 pb-3"><p className="font-medium">{entry.beforeElo} → {entry.afterElo}</p><p>{entry.reason}</p><p className="text-xs text-gray-500">{entry.actorName} · {new Date(entry.createdAt).toLocaleString()}</p><button type="button" className="min-h-11 text-teal-800 hover:underline" disabled={saving} onClick={() => { setRating(String(entry.beforeElo)); setReason(`Restore previous rating from ${new Date(entry.createdAt).toLocaleDateString()}`); }}>Use previous rating</button></li>)}</ul> : <p className="pb-3 text-gray-500">No manual adjustments yet.</p>}
          </details>
        </>}
      </div>
    </ModalFrame> : null}
  </div>;
}
