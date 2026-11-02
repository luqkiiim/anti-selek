export const DEFAULT_SESSION_TIME_ZONE = "Asia/Kuala_Lumpur";

export interface CourtBooking {
  courtNumber: number;
  startsAt: string | null;
  endsAt: string | null;
}

export interface SessionDetails {
  venue: string | null;
  venueMapUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  fee: string | null;
  notes: string | null;
  courtBookings: CourtBooking[];
}

export class SessionDetailsError extends Error {}

export function emptySessionDetails(): SessionDetails {
  return { venue: null, venueMapUrl: null, startsAt: null, endsAt: null, timeZone: DEFAULT_SESSION_TIME_ZONE, fee: null, notes: null, courtBookings: [] };
}

function optionalText(value: unknown, label: string, max: number, multiline = false): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new SessionDetailsError(`${label} must be text.`);
  const text = value.trim();
  if (text.length > max) throw new SessionDetailsError(`${label} must be ${max} characters or fewer.`);
  if ((!multiline && /[\r\n]/.test(text)) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) {
    throw new SessionDetailsError(`${label} contains invalid characters.`);
  }
  return text || null;
}

function timestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new SessionDetailsError("Use a valid date and time.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new SessionDetailsError("Use a valid date and time.");
  }
  return date.toISOString();
}

function timeRange(startsAt: unknown, endsAt: unknown) {
  const start = timestamp(startsAt), end = timestamp(endsAt);
  if (Boolean(start) !== Boolean(end)) throw new SessionDetailsError("Enter both a start and end time, or leave both blank.");
  if (start && end && end <= start) throw new SessionDetailsError("End time must be after start time. For overnight bookings, choose the next date.");
  return { startsAt: start, endsAt: end };
}

export function parseSessionDetails(value: unknown, courtNumbers: readonly number[]): SessionDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SessionDetailsError("Invalid session details.");
  const input = value as Record<string, unknown>;
  const timeZone = optionalText(input.timeZone, "Time zone", 100) ?? DEFAULT_SESSION_TIME_ZONE;
  try { new Intl.DateTimeFormat("en", { timeZone }); }
  catch { throw new SessionDetailsError("Choose a valid time zone."); }
  const venueMapUrl = optionalText(input.venueMapUrl, "Map link", 1000);
  if (venueMapUrl) {
    let url: URL;
    try { url = new URL(venueMapUrl); }
    catch { throw new SessionDetailsError("Use a complete map link starting with https:// or http://."); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new SessionDetailsError("Use a map link starting with https:// or http://.");
  }
  const bookings = input.courtBookings ?? [];
  if (!Array.isArray(bookings) || bookings.length > courtNumbers.length) throw new SessionDetailsError("Invalid court bookings.");
  const seen = new Set<number>();
  const courtBookings = bookings.map((booking): CourtBooking => {
    if (!booking || typeof booking !== "object" || !Number.isInteger(booking.courtNumber) || !courtNumbers.includes(booking.courtNumber) || seen.has(booking.courtNumber)) {
      throw new SessionDetailsError("Court bookings must refer to different available courts.");
    }
    seen.add(booking.courtNumber);
    return { courtNumber: booking.courtNumber, ...timeRange(booking.startsAt, booking.endsAt) };
  });
  return {
    venue: optionalText(input.venue, "Venue", 160), venueMapUrl,
    ...timeRange(input.startsAt, input.endsAt), timeZone,
    fee: optionalText(input.fee, "Fee", 160), notes: optionalText(input.notes, "Notes", 2000, true), courtBookings,
  };
}

export function sessionDetailsData(details: SessionDetails) {
  return {
    venue: details.venue, venueMapUrl: details.venueMapUrl,
    scheduledStartAt: details.startsAt ? new Date(details.startsAt) : null,
    scheduledEndAt: details.endsAt ? new Date(details.endsAt) : null,
    timeZone: details.timeZone, feeText: details.fee, notes: details.notes,
  };
}

type StoredDetails = Partial<Omit<ReturnType<typeof sessionDetailsData>, "timeZone">> & {
  timeZone?: string | null;
  courts?: Array<{ courtNumber: number; bookingStartAt?: Date | string | null; bookingEndAt?: Date | string | null }>;
};
function iso(value: Date | string | null | undefined) { return value ? new Date(value).toISOString() : null; }

export function serializeSessionDetails(session: StoredDetails): SessionDetails {
  return {
    venue: session.venue ?? null, venueMapUrl: session.venueMapUrl ?? null,
    startsAt: iso(session.scheduledStartAt), endsAt: iso(session.scheduledEndAt),
    timeZone: session.timeZone ?? DEFAULT_SESSION_TIME_ZONE, fee: session.feeText ?? null, notes: session.notes ?? null,
    courtBookings: (session.courts ?? []).filter(court => court.bookingStartAt || court.bookingEndAt).map(court => ({ courtNumber: court.courtNumber, startsAt: iso(court.bookingStartAt), endsAt: iso(court.bookingEndAt) })),
  };
}

/** datetime-local values always describe the chosen session zone, never the device zone. */
export function localDateTime(value: string | null, timeZone: string): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function utcDateTime(local: string, timeZone: string): string | null {
  if (!local) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new SessionDetailsError("Use a valid date and time.");
  const wallTime = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, 16) !== local) throw new SessionDetailsError("Use a valid date and time.");
  let guess = wallTime;
  // Correct the zone offset, including offsets that change at a daylight-saving boundary.
  for (let attempt = 0; attempt < 4; attempt++) {
    const displayed = localDateTime(new Date(guess).toISOString(), timeZone);
    const difference = wallTime - Date.parse(`${displayed}:00Z`);
    if (!difference) return new Date(guess).toISOString();
    guess += difference;
  }
  throw new SessionDetailsError("That time does not exist in this time zone. Choose another time.");
}

export function formatBooking(startsAt: string | null, endsAt: string | null, timeZone: string) {
  if (!startsAt || !endsAt) return "";
  const start = new Date(startsAt), end = new Date(endsAt);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "2-digit", hour12: true });
  const sameDay = localDateTime(startsAt, timeZone).slice(0, 10) === localDateTime(endsAt, timeZone).slice(0, 10);
  return `${date.format(start)}, ${time.format(start)}–${sameDay ? "" : `${date.format(end)}, `}${time.format(end)}`;
}
