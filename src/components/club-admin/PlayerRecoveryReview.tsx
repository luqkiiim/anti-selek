"use client";

import { useState } from "react";
import type { RecoveryEligibility } from "@/types/playerRecovery";

export type RecoveryReviewDecision = {
  action: "APPROVE" | "REJECT";
  confirmRestoreAccess?: boolean;
  retireEmptyPlayerId?: string;
  reason?: string;
};

/** Shared by both existing admin interfaces; neither can retarget a bound request. */
export function PlayerRecoveryReview({ recovery, busy, selfApproval, authorized = true, onReview }: {
  recovery: RecoveryEligibility; busy: boolean; selfApproval: boolean;
  authorized?: boolean;
  onReview: (decision: RecoveryReviewDecision) => void;
}) {
  const [restore, setRestore] = useState(false);
  const [retire, setRetire] = useState(false);
  const [reason, setReason] = useState("");
  const duplicate = recovery.duplicate;
  const confirmed = (!recovery.needsAccessRestore || restore) && (!duplicate || (retire && !!reason.trim()));
  return <section className="admission-recovery-review" aria-label="Player recovery review">
    <p><strong>Invitation recovery</strong> · invitation {recovery.invitationAvailability.toLowerCase()}</p>
    {duplicate && <p>Conflicting Player: <strong>{duplicate.name}</strong>. {duplicate.eligible ? "The removed duplicate has no sporting records." : "This duplicate cannot be safely retired."}</p>}
    {recovery.blockers.length > 0 && <ul role="alert">{recovery.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
    {selfApproval && <p>Another admin must approve your recovery.</p>}
    {!authorized && <p>Active ADMIN or OWNER access in this club is required to review recovery.</p>}
    {recovery.needsAccessRestore && <label className="field-label"><span><input type="checkbox" checked={restore} disabled={busy || !authorized || !recovery.canApprove || selfApproval} onChange={e => setRestore(e.target.checked)} /> Restore club access as MEMBER</span></label>}
    {duplicate && <label className="field-label"><span><input type="checkbox" checked={retire} disabled={busy || !authorized || !recovery.canApprove || selfApproval} onChange={e => setRetire(e.target.checked)} /> Retire empty duplicate {duplicate.name}</span></label>}
    <label className="field-label">{duplicate ? "Retirement reason (required for approval)" : "Review note (optional)"}<textarea rows={2} maxLength={1000} value={reason} disabled={busy || !authorized} onChange={e => setReason(e.target.value)} /></label>
    <div className="admission-review-actions">
      <button type="button" className="primary app-button-primary" disabled={busy || !authorized || selfApproval || !recovery.canApprove || !confirmed} onClick={() => onReview({ action: "APPROVE", ...(recovery.needsAccessRestore ? { confirmRestoreAccess: true } : {}), ...(duplicate ? { retireEmptyPlayerId: duplicate.id } : {}), reason: reason.trim() || undefined })}>Approve recovery</button>
      <button type="button" className="secondary app-button-secondary" disabled={busy || !authorized} onClick={() => onReview({ action: "REJECT", reason: reason.trim() || undefined })}>Reject request</button>
    </div>
  </section>;
}
