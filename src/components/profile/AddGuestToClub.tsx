"use client";

import { useState } from "react";
import { useAdminAction } from "@/components/club-admin/useAdminAction";
import { adminApi } from "@/lib/adminClient";
import { ErrorText, Sheet } from "@/components/product/Primitives";

export function AddGuestToClub({ clubId, userId, name }: { clubId: string; userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const action = useAdminAction(async () => {
    const members = await adminApi<Array<{ id: string }>>(`/api/clubs/${encodeURIComponent(clubId)}/members`);
    if (members.some(member => member.id === userId)) { setAdded(true); setOpen(false); }
  });
  return <div className="profile-guest-promotion">
    {added ? <p role="status">Added to club</p> : <button className="secondary" type="button" onClick={() => setOpen(true)}>Add to club</button>}
    <Sheet open={open} title="Add to club" busy={action.busy} onClose={() => setOpen(false)}>
      <p>Add {name} as an occasional player with this profile’s rating and match history.</p>
      <ErrorText error={action.error} />
      <button className="primary full" disabled={action.busy || action.uncertain} onClick={() => void action.run(signal => adminApi(`/api/clubs/${encodeURIComponent(clubId)}/guests/${encodeURIComponent(userId)}`, "POST", undefined, { signal }), () => { setAdded(true); setOpen(false); })}>Add player</button>
      <button className="text-button" onClick={() => setOpen(false)}>Cancel</button>
      {action.uncertain && <button className="text-button" disabled={action.refreshing} onClick={() => void action.retryRefresh()}>Refresh to check</button>}
    </Sheet>
    {action.refreshWarning && <p role="status">{action.refreshWarning}<button className="text-button" onClick={() => void action.retryRefresh()}>Refresh details</button></p>}
  </div>;
}
