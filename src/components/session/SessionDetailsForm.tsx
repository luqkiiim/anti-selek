"use client";

import { useId, useState } from "react";
import type { SessionDetails } from "@/lib/sessionDetails";
import { emptySessionDetails, localDateTime, parseSessionDetails, utcDateTime } from "@/lib/sessionDetails";
import styles from "./SessionSharing.module.css";

export function sessionDetailsDraft(details = emptySessionDetails()): SessionDetails {
  return {
    ...details,
    startsAt: localDateTime(details.startsAt, details.timeZone), endsAt: localDateTime(details.endsAt, details.timeZone),
    courtBookings: details.courtBookings.map(court => ({ ...court, startsAt: localDateTime(court.startsAt, details.timeZone), endsAt: localDateTime(court.endsAt, details.timeZone) })),
  };
}

export function sessionDetailsFromDraft(draft: SessionDetails, courtNumbers: number[]) {
  return parseSessionDetails({
    ...draft,
    startsAt: utcDateTime(draft.startsAt ?? "", draft.timeZone), endsAt: utcDateTime(draft.endsAt ?? "", draft.timeZone),
    courtBookings: draft.courtBookings.filter(court => courtNumbers.includes(court.courtNumber)).map(court => ({
      ...court, startsAt: utcDateTime(court.startsAt ?? "", draft.timeZone), endsAt: utcDateTime(court.endsAt ?? "", draft.timeZone),
    })),
  }, courtNumbers);
}

export function SessionDetailsForm({ value, onChange, courts, collapsible = true }: {
  value: SessionDetails;
  onChange: (value: SessionDetails) => void;
  courts: Array<{ courtNumber: number; label?: string | null }>;
  collapsible?: boolean;
}) {
  const id = useId();
  const [timeZones] = useState(() => Array.from(new Set(["Asia/Kuala_Lumpur", "UTC", ...Intl.supportedValuesOf("timeZone")])).sort());
  function field(key: keyof Pick<SessionDetails, "venue" | "venueMapUrl" | "startsAt" | "endsAt" | "fee" | "notes" | "timeZone">, text: string) {
    onChange({ ...value, [key]: text });
  }
  function courtField(courtNumber: number, key: "startsAt" | "endsAt", text: string) {
    const booking = value.courtBookings.find(court => court.courtNumber === courtNumber) ?? { courtNumber, startsAt: "", endsAt: "" };
    onChange({ ...value, courtBookings: [...value.courtBookings.filter(court => court.courtNumber !== courtNumber), { ...booking, [key]: text }] });
  }
  const fields = <div className={styles.fields}>
    <label className={styles.field}>Venue<input value={value.venue ?? ""} maxLength={160} onChange={e => field("venue", e.target.value)} autoComplete="off" /></label>
    <label className={styles.field}>Map link<input type="url" value={value.venueMapUrl ?? ""} maxLength={1000} onChange={e => field("venueMapUrl", e.target.value)} placeholder="https://" /></label>
    <div className={styles.timeFields}>
      <label className={styles.field}>Starts<input type="datetime-local" value={value.startsAt ?? ""} onChange={e => field("startsAt", e.target.value)} /></label>
      <label className={styles.field}>Ends<input type="datetime-local" value={value.endsAt ?? ""} onChange={e => field("endsAt", e.target.value)} /></label>
    </div>
    <label className={styles.field}>Time zone<select value={value.timeZone} onChange={e => field("timeZone", e.target.value)}>{timeZones.map(zone => <option value={zone} key={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>
    {courts.length > 0 && <details className={styles.courtTimes}>
      <summary>Individual court times</summary>
      <p className={styles.hint}>Leave blank to use the session time.</p>
      {courts.map(court => {
        const booking = value.courtBookings.find(item => item.courtNumber === court.courtNumber);
        const label = court.label || `Court ${court.courtNumber}`;
        return <fieldset className={styles.courtTime} key={court.courtNumber}>
          <legend>{label}</legend>
          <div className={styles.timeFields}>
            <label className={styles.field}>Starts<input aria-label={`${label} starts`} type="datetime-local" value={booking?.startsAt ?? ""} onChange={e => courtField(court.courtNumber, "startsAt", e.target.value)} /></label>
            <label className={styles.field}>Ends<input aria-label={`${label} ends`} type="datetime-local" value={booking?.endsAt ?? ""} onChange={e => courtField(court.courtNumber, "endsAt", e.target.value)} /></label>
          </div>
        </fieldset>;
      })}
    </details>}
    <label className={styles.field}>Fee<input value={value.fee ?? ""} maxLength={160} onChange={e => field("fee", e.target.value)} placeholder="e.g. RM20 per person" /></label>
    <label className={styles.field}>Notes<textarea rows={3} value={value.notes ?? ""} maxLength={2000} onChange={e => field("notes", e.target.value)} /></label>
  </div>;
  return collapsible ? <details className={styles.details}><summary>Session details</summary>{fields}</details> : <section aria-labelledby={id}><h3 id={id} className={styles.editorTitle}>Session details</h3>{fields}</section>;
}
