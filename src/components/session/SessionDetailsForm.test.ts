import { expect, it } from "vitest";
import { emptySessionDetails } from "@/lib/sessionDetails";
import { sessionDetailsDraft, sessionDetailsFromDraft } from "./SessionDetailsForm";

it.each([
  { startsAt: "2026-03-08T01:30", endsAt: "2026-03-08T08:30:00.000Z" },
  { startsAt: "2026-11-01T00:30", endsAt: "2026-11-01T06:30:00.000Z" },
])("keeps elapsed duration across timezone clock changes at $startsAt", ({ startsAt, endsAt }) => {
  const draft = { ...sessionDetailsDraft(), timeZone: "America/New_York", startsAt, durationHours: "2" };
  const details = sessionDetailsFromDraft(draft, []);
  expect(details.endsAt).toBe(endsAt);
  expect(sessionDetailsFromDraft(sessionDetailsDraft(details), [])).toEqual(details);
});

it("requires a positive duration alongside the start time", () => {
  for (const durationHours of ["", "0", "-1", "Infinity"]) {
    expect(() => sessionDetailsFromDraft({ ...sessionDetailsDraft(), startsAt: "2026-11-04T23:00", durationHours }, [])).toThrow(/duration/);
  }
  expect(() => sessionDetailsFromDraft({ ...sessionDetailsDraft(), durationHours: "2" }, [])).toThrow(/start time/);
  expect(sessionDetailsFromDraft(sessionDetailsDraft(), [])).toEqual(emptySessionDetails());
});
