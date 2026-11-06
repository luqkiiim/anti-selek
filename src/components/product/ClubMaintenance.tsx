"use client";
import { useState } from "react";
import { useAdminAction } from "@/components/club-admin/useAdminAction";
import { adminApi } from "@/lib/adminClient";
import { ErrorText, Sheet } from "./Primitives";

export function ClubMaintenance({ clubId, name, tutorial, disabled, refresh, onReset }: { clubId: string; name: string; tutorial: boolean; disabled: boolean; refresh: () => Promise<unknown>; onReset?: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const action = useAdminAction(refresh);
  const title = tutorial ? "Reset playground" : "Reset club history";
  return <section className="club-settings-danger">
    <button id="admin-onboarding-reset-club" className="text-button danger" disabled={disabled} onClick={() => { setConfirmation(""); setOpen(true); }}>{title}</button>
    {notice && <p role="status">{notice}</p>}
    <Sheet open={open} title={`${title}?`} busy={action.busy} onClose={() => setOpen(false)}>
      <p>{tutorial ? `Restore ${name} to its original practice players, sessions, and tutorial progress?` : `Delete all sessions in ${name} and reset its player ratings to 1000? This cannot be undone.`}</p>
      <label className="field-label">Type RESET to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></label>
      <ErrorText error={action.error} />
      <button className="primary full" disabled={disabled || confirmation !== "RESET" || action.busy || action.uncertain} onClick={() => void action.run(signal => adminApi(`/api/clubs/${encodeURIComponent(clubId)}/reset`, "POST", { confirmation }, { signal }), () => { setOpen(false); onReset?.(); setNotice(tutorial ? "Playground reset." : "Club history reset."); })}>{title}</button>
      <button className="text-button" onClick={() => setOpen(false)}>Cancel</button>
      {action.uncertain && <button className="text-button" disabled={action.refreshing} onClick={() => void action.retryRefresh()}>Refresh to check</button>}
    </Sheet>
    {action.refreshWarning && <p role="status">{action.refreshWarning}<button className="text-button" disabled={action.refreshing} onClick={() => void action.retryRefresh()}>Refresh details</button></p>}
  </section>;
}
