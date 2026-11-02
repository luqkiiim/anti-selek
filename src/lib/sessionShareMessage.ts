import type { SessionData } from "@/components/session/sessionTypes";
import { emptySessionDetails, formatBooking } from "./sessionDetails";
import { getCourtDisplayLabel } from "./courtLabels";

function line(value: string) { return value.replace(/[\r\n\x00-\x1f\x7f]+/g, " ").trim(); }

export function buildSessionShareMessage(session: SessionData, sessionUrl: string) {
  const details = session.details ?? emptySessionDetails();
  const clubs = session.clubs?.filter(club => club.status === "ACCEPTED").map(club => line(club.name)) ?? [];
  const lines = [line(session.name), ...clubs.length ? [clubs.join(" · ")] : []];
  if (session.status === "COMPLETED") lines.push("Completed session");
  const booking = formatBooking(details.startsAt, details.endsAt, details.timeZone);
  const logistics = [
    booking ? `When: ${booking} (${details.timeZone})` : "",
    details.venue ? `Venue: ${details.venue}` : "",
    details.venueMapUrl ? `Map: ${details.venueMapUrl}` : "",
  ].filter(Boolean);
  const courts = [...session.courts].sort((a, b) => a.courtNumber - b.courtNumber);
  if (courts.length) {
    logistics.push(`Courts: ${courts.map(court => line(getCourtDisplayLabel(court))).join(", ")}`);
    for (const court of courts) {
      const override = details.courtBookings.find(item => item.courtNumber === court.courtNumber);
      if (override?.startsAt && override.endsAt && (override.startsAt !== details.startsAt || override.endsAt !== details.endsAt)) {
        logistics.push(`${line(getCourtDisplayLabel(court))}: ${formatBooking(override.startsAt, override.endsAt, details.timeZone)} (${details.timeZone})`);
      }
    }
  }
  if (details.fee) logistics.push(`Fee: ${details.fee}`);
  if (logistics.length) lines.push("", ...logistics);
  const players = [...session.players].sort((a, b) => a.user.name.localeCompare(b.user.name, "en", { sensitivity: "base" }) || a.userId.localeCompare(b.userId));
  lines.push("", `Players (${players.length})`, ...players.map((player, index) => `${index + 1}. ${line(player.user.name)}`));
  if (details.notes) lines.push("", details.notes);
  lines.push("", `Session: ${sessionUrl}`);
  return lines.join("\n");
}
