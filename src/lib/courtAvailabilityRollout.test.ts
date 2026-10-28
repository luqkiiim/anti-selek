import { afterEach, describe, expect, it, vi } from "vitest";
import { setSessionCourtCount } from "./sessionCourts";
import type { Prisma } from "@prisma/client";

function writer() {
  return {
    session: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", courts: [
      { courtNumber: 1, isActive: true, currentMatchId: "playing", matches: [{ id: "playing" }] },
      { courtNumber: 2, isActive: true, currentMatchId: null, matches: [] },
    ] }) },
    court: { updateMany: vi.fn(), createMany: vi.fn() },
  };
}

describe("online court availability activation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("holds reductions while older writers may still be serving requests", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("COURT_AVAILABILITY_ENABLED", "false");
    const tx = writer();
    await expect(setSessionCourtCount(tx as unknown as Prisma.TransactionClient, "session", 1)).rejects.toThrow("Court reductions are not available yet");
    expect(tx.court.updateMany).not.toHaveBeenCalled();
    expect(tx.court.createMany).not.toHaveBeenCalled();
  });

  it("keeps additions and same-count settings saves compatible during rollout", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("COURT_AVAILABILITY_ENABLED", "false");
    const tx = writer();
    await setSessionCourtCount(tx as unknown as Prisma.TransactionClient, "session", 2);
    await setSessionCourtCount(tx as unknown as Prisma.TransactionClient, "session", 3);
    expect(tx.court.createMany).toHaveBeenCalledWith({ data: [{ sessionId: "session", courtNumber: 3 }] });
  });

  it("permits reductions only after activation, retaining every court row", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("COURT_AVAILABILITY_ENABLED", "true");
    const tx = writer();
    await setSessionCourtCount(tx as unknown as Prisma.TransactionClient, "session", 1);
    expect(tx.court.updateMany).toHaveBeenCalledWith({ where: { sessionId: "session", courtNumber: { gt: 1 } }, data: { isActive: false } });
  });
});
