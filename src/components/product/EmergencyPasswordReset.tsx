"use client";
import { useState } from "react";
import { useAdminAction } from "@/components/club-admin/useAdminAction";
import { adminApi } from "@/lib/adminClient";
import { ErrorText, Sheet } from "./Primitives";

export function EmergencyPasswordReset({ clubId, playerId, name, disabled }: { clubId: string; playerId: string; name: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState("");
  const action = useAdminAction();
  return <>
    <button className="text-button" disabled={disabled} onClick={() => setOpen(true)}>Emergency password reset</button>
    {notice && <p role="status">{notice}</p>}
    <Sheet open={open} title="Emergency password reset" busy={action.busy} onClose={() => { setOpen(false); setPassword(""); setConfirm(""); }}>
      <p>Set a password for {name} when email recovery is unavailable.</p>
      <form onSubmit={event => { event.preventDefault(); if (password !== confirm) { action.setError("Passwords must match."); return; } const value = password; void action.run(signal => adminApi(`/api/clubs/${encodeURIComponent(clubId)}/members/${encodeURIComponent(playerId)}/password`, "POST", { password: value }, { signal }), () => { setPassword(""); setConfirm(""); setOpen(false); setNotice("Emergency password set."); }); }}>
        <label className="field-label">New password<input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
        <label className="field-label">Confirm password<input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
        <ErrorText error={action.error} />
        {action.uncertain && <p role="status">Check whether the new password works before trying another reset. This action will not be repeated automatically.</p>}
        <button className="primary full" disabled={disabled || action.busy || action.uncertain}>Set emergency password</button>
      </form>
    </Sheet>
  </>;
}
