import type { SessionData } from "./sessionTypes";
import { formatBooking } from "@/lib/sessionDetails";
import styles from "./SessionSharing.module.css";

export function SessionDetailsSummary({ session }: { session: SessionData }) {
  const details = session.details;
  if (!details) return null;
  const booking = formatBooking(details.startsAt, details.endsAt, details.timeZone);
  if (!booking && !details.venue && !details.venueMapUrl && !details.fee && !details.notes) return null;
  return <div className={styles.summary} aria-label="Session details">
    {booking && <p>{booking} <span className={styles.hint}>({details.timeZone})</span></p>}
    {(details.venue || details.venueMapUrl) && <p>{details.venueMapUrl
      ? <a href={details.venueMapUrl} target="_blank" rel="noopener noreferrer">{details.venue || "View venue map"}</a> : details.venue}</p>}
    {details.fee && <p>Fee: {details.fee}</p>}
    {details.notes && <details><summary>Notes</summary><p className={styles.notes}>{details.notes}</p></details>}
  </div>;
}
