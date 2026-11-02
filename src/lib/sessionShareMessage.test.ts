import { expect, it } from "vitest";
import type { SessionData } from "@/components/session/sessionTypes";
import { buildSessionShareMessage } from "./sessionShareMessage";
import { emptySessionDetails } from "./sessionDetails";

it("includes guests and paused players, keeps same-named players separate and omits ratings", () => {
  const session = {
    name: "Friday games", status: "WAITING", clubs: [{ name: "Home", status: "ACCEPTED" }, { name: "Pending club", status: "PENDING" }],
    courts: [{ courtNumber: 2, label: "East" }, { courtNumber: 1, label: null }],
    players: [{ userId: "1", isPaused: true, user: { name: "Zoe", elo: 1200 } }, { userId: "2", isGuest: true, user: { name: "Amir" } }, { userId: "3", user: { name: "Amir" } }],
    details: { ...emptySessionDetails(), venue: "Hall", startsAt: "2026-11-04T12:00:00.000Z", endsAt: "2026-11-04T14:00:00.000Z", courtBookings: [{ courtNumber: 2, startsAt: "2026-11-04T11:00:00.000Z", endsAt: "2026-11-04T14:00:00.000Z" }] },
  } as unknown as SessionData;
  const message = buildSessionShareMessage(session, "https://example.test/session/code");
  expect(message).toContain("Players\n1. Amir\n2. Amir\n3. Zoe");
  expect(message).toContain("Courts: Court 1, East");
  expect(message).toContain("\nWed, 4 Nov 2026, 8:00 pm–10:00 pm\n");
  expect(message).not.toMatch(/When:|Asia\/Kuala_Lumpur|Players \(|East:|7:00 pm/);
  expect(message).toContain("Session: https://example.test/session/code");
  expect(message).not.toMatch(/undefined|null|1200|Pending club|Fee:|Map:/);
});
