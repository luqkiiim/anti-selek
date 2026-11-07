"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import "./session-refresh.css";

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function SessionRefreshControl({ checkedAt, refreshing, failed, onRefresh }: {
  checkedAt?: number | null;
  refreshing: boolean;
  failed?: boolean;
  onRefresh: () => void;
}) {
  return <div className="session-refresh">
    <button type="button" disabled={refreshing} aria-busy={refreshing} onClick={onRefresh}>
      <ArrowsClockwise aria-hidden="true" size={15} />Refresh
    </button>
    {checkedAt != null && <small>Updated at {timeFormat.format(checkedAt)}</small>}
    {failed && <span className="session-refresh-error" role="status">Couldn’t refresh. Try again.</span>}
  </div>;
}
