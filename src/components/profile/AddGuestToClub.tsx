"use client";

import { useState } from "react";
import { ModalFrame, FlashMessage } from "@/components/ui/chrome";

export function AddGuestToClub({ clubId, userId, name }: { clubId: string; userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");
  async function add() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/guests/${encodeURIComponent(userId)}`, { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not add player. Try again.");
      }
      setAdded(true);
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not add player. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return <div className="px-4 sm:px-0">
    {added ? <p role="status" className="text-sm text-teal-800">Added to club</p> :
      <button className="app-button-secondary" type="button" onClick={() => setOpen(true)}>Add to club</button>}
    {open ? <ModalFrame title="Add to club" subtitle={name} onClose={() => { if (!saving) setOpen(false); }}
      footer={<div className="flex justify-end gap-2">
        <button className="app-button-secondary" type="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
        <button className="app-button-primary" type="button" disabled={saving} onClick={() => void add()}>{saving ? "Adding…" : "Add player"}</button>
      </div>}>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        <p className="text-sm text-gray-600">Add as an occasional player with this profile’s match history.</p>
        {error ? <FlashMessage tone="error">{error}</FlashMessage> : null}
      </div>
    </ModalFrame> : null}
  </div>;
}
