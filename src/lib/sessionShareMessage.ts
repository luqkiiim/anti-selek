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
    booking,
    details.venue ? `Venue: ${details.venue}` : "",
    details.venueMapUrl ? `Map: ${details.venueMapUrl}` : "",
  ].filter(Boolean);
  const courts = [...session.courts].sort((a, b) => a.courtNumber - b.courtNumber);
  if (courts.length) {
    logistics.push(`Courts: ${courts.map(court => line(getCourtDisplayLabel(court))).join(", ")}`);
  }
  if (details.fee) logistics.push(`Fee: ${details.fee}`);
  if (logistics.length) lines.push("", ...logistics);
  const players = [...session.players].sort((a, b) => a.user.name.localeCompare(b.user.name, "en", { sensitivity: "base" }) || a.userId.localeCompare(b.userId));
  lines.push("", "Players", ...players.map((player, index) => `${index + 1}. ${line(player.user.name)}`));
  if (details.notes) lines.push("", details.notes);
  lines.push("", `Session: ${sessionUrl}`);
  return lines.join("\n");
}
