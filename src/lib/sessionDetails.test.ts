import { describe, expect, it } from "vitest";
import { emptySessionDetails, formatBooking, localDateTime, parseSessionDetails, utcDateTime } from "./sessionDetails";

describe("session booking times", () => {
  it("uses the session zone rather than the device zone, including overnight bookings", () => {
    const start = utcDateTime("2026-11-04T23:00", "Asia/Kuala_Lumpur");
    const end = utcDateTime("2026-11-05T01:00", "Asia/Kuala_Lumpur");
    expect(start).toBe("2026-11-04T15:00:00.000Z");
    expect(localDateTime(end, "Asia/Kuala_Lumpur")).toBe("2026-11-05T01:00");
    expect(formatBooking(start, end, "Asia/Kuala_Lumpur")).toContain("5 Nov 2026");
    expect(() => parseSessionDetails({ ...emptySessionDetails(), startsAt: start, endsAt: end }, [])).not.toThrow();
  });
  it("rejects impossible calendar dates and daylight-saving gap times", () => {
    expect(() => utcDateTime("2026-02-30T12:00", "UTC")).toThrow();
    expect(() => utcDateTime("2026-03-08T02:30", "America/New_York")).toThrow(/does not exist/);
    expect(localDateTime(utcDateTime("2026-11-01T01:30", "America/New_York"), "America/New_York")).toBe("2026-11-01T01:30");
  });
  it.each([
    { startsAt: "2026-11-04T12:00:00Z" },
    { startsAt: "2026-11-04T12:00:00Z", endsAt: "2026-11-04T11:00:00Z" },
    { startsAt: "2026-02-30T12:00:00Z", endsAt: "2026-03-05T12:00:00Z" },
    { timeZone: "not/a-zone" },
    { venueMapUrl: "javascript:alert(1)" },
    { courtBookings: [{ courtNumber: 3 }] },
    { courtBookings: [{ courtNumber: 1 }, { courtNumber: 1 }] },
  ])("rejects invalid details %j", changes => {
    expect(() => parseSessionDetails({ ...emptySessionDetails(), ...changes }, [1, 2])).toThrow();
  });
});
