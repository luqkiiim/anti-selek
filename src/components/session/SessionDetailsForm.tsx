"use client";

import { useId, useState, type Dispatch, type SetStateAction } from "react";
import type { SessionDetails } from "@/lib/sessionDetails";
import { emptySessionDetails, localDateTime, parseSessionDetails, SessionDetailsError, utcDateTime } from "@/lib/sessionDetails";
import styles from "./SessionSharing.module.css";
import { LocationField } from "./LocationField";

type SessionDetailsDraft = Omit<SessionDetails, "endsAt"> & { durationHours: string };

export function sessionDetailsDraft(details = emptySessionDetails()): SessionDetailsDraft {
  const { endsAt, ...rest } = details;
  return {
    ...rest,
    startsAt: localDateTime(details.startsAt, details.timeZone),
    durationHours: details.startsAt && endsAt ? String((Date.parse(endsAt) - Date.parse(details.startsAt)) / 3_600_000) : "",
  };
}

export function sessionDetailsFromDraft(draft: SessionDetailsDraft, courtNumbers: number[]) {
  const { durationHours, ...details } = draft;
  const startsAt = utcDateTime(draft.startsAt ?? "", draft.timeZone);
  if (Boolean(startsAt) !== Boolean(durationHours.trim())) {
    throw new SessionDetailsError("Enter a start time and duration, or leave both blank.");
  }
  let endsAt: string | null = null;
  if (startsAt) {
    const hours = Number(durationHours);
    const end = new Date(Date.parse(startsAt) + Math.round(hours * 3_600_000));
    if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(end.getTime())) {
      throw new SessionDetailsError("Enter a valid duration greater than zero.");
    }
    endsAt = end.toISOString();
  }
  return parseSessionDetails({
    ...details, startsAt, endsAt,
    ...(draft.courtLabels ? { courtLabels: draft.courtLabels.filter(court => courtNumbers.includes(court.courtNumber)) } : {}),
    // Keep previously saved court bookings untouched; this editor uses the session range.
    courtBookings: draft.courtBookings.filter(court => courtNumbers.includes(court.courtNumber)),
  }, courtNumbers);
}

export function SessionDetailsForm({ value, onChange, clubId, courtNumbers = [], collapsible = true }: {
  value: SessionDetailsDraft;
  onChange: Dispatch<SetStateAction<SessionDetailsDraft>>;
  clubId?: string | null;
  courtNumbers?: number[];
  collapsible?: boolean;
}) {
  const id = useId();
  const [timeZones] = useState(() => Array.from(new Set(["Asia/Kuala_Lumpur", "UTC", ...Intl.supportedValuesOf("timeZone")])).sort());
  function field(key: keyof Pick<SessionDetailsDraft, "venue" | "venueMapUrl" | "startsAt" | "durationHours" | "fee" | "notes" | "timeZone">, text: string) {
    onChange(current => ({ ...current, [key]: text }));
  }
  const fields = <div className={styles.fields}>
    <LocationField venue={value.venue} venueMapUrl={value.venueMapUrl} clubId={clubId} onChange={location => onChange(current => ({ ...current, ...location }))} />
    {courtNumbers.length > 0 && <fieldset className={styles.courtLabels}>
      <legend>Court labels</legend>
      {courtNumbers.map(courtNumber => <label className={styles.field} key={courtNumber}>Court {courtNumber}
        <input aria-label={`Court ${courtNumber} label`} value={value.courtLabels?.find(court => court.courtNumber === courtNumber)?.label ?? ""} maxLength={24} placeholder={`Court ${courtNumber}`} onChange={e => {
          const label = e.target.value;
          onChange(current => ({ ...current, courtLabels: [...(current.courtLabels ?? []).filter(court => court.courtNumber !== courtNumber), { courtNumber, label }] }));
        }} />
      </label>)}
    </fieldset>}
    <label className={styles.field}>Starts<input type="datetime-local" value={value.startsAt ?? ""} onChange={e => field("startsAt", e.target.value)} /></label>
    <label className={styles.field}>Duration (hours)<input type="number" inputMode="decimal" min="0" step="any" value={value.durationHours} onChange={e => field("durationHours", e.target.value)} /></label>
    <label className={styles.field}>Time zone<select value={value.timeZone} onChange={e => field("timeZone", e.target.value)}>{timeZones.map(zone => <option value={zone} key={zone}>{zone.replaceAll("_", " ")}</option>)}</select></label>
    <label className={styles.field}>Fee<input value={value.fee ?? ""} maxLength={160} onChange={e => field("fee", e.target.value)} placeholder="e.g. RM20 per person" /></label>
    <label className={styles.field}>Notes<textarea rows={3} value={value.notes ?? ""} maxLength={2000} onChange={e => field("notes", e.target.value)} /></label>
  </div>;
  return collapsible ? <details className={styles.details}><summary>Session details</summary>{fields}</details> : <section className={styles.editor} aria-labelledby={id}><h3 id={id} className={styles.editorTitle}>Session details</h3>{fields}</section>;
}
