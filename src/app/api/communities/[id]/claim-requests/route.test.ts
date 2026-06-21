import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimRequestStatus } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isQuickAccessSession: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  clubFindUnique: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  txUserFindUnique: vi.fn(),
  txClubMemberFindUnique: vi.fn(),
  txClaimRequestFindFirst: vi.fn(),
  txSessionPlayerFindFirst: vi.fn(),
  txClaimRequestCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/quickAccess", () => ({
  isQuickAccessSession: mocks.isQuickAccessSession,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      findUnique: mocks.clubFindUnique,
    },
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
    },
    $transaction: async (
      callback: (tx: {
        user: { findUnique: typeof mocks.txUserFindUnique };
        clubMember: { findUnique: typeof mocks.txClubMemberFindUnique };
        claimRequest: {
          findFirst: typeof mocks.txClaimRequestFindFirst;
          create: typeof mocks.txClaimRequestCreate;
        };
        sessionPlayer: { findFirst: typeof mocks.txSessionPlayerFindFirst };
      }) => Promise<unknown>
    ) =>
      callback({
        user: {
          findUnique: mocks.txUserFindUnique,
        },
        clubMember: {
          findUnique: mocks.txClubMemberFindUnique,
        },
        claimRequest: {
          findFirst: mocks.txClaimRequestFindFirst,
          create: mocks.txClaimRequestCreate,
        },
        sessionPlayer: {
          findFirst: mocks.txSessionPlayerFindFirst,
        },
      }),
  },
}));

import { POST } from "./route";

function queuePendingRequestChecks({
  requesterPending = null,
  targetPending = null,
}: {
  requesterPending?: { id: string } | null;
  targetPending?: { id: string } | null;
}) {
  mocks.txClaimRequestFindFirst
    .mockResolvedValueOnce(requesterPending)
    .mockResolvedValueOnce(targetPending);
}

function postClaim(body: unknown) {
  return POST(
    new Request("http://localhost/api/clubs/community-1/claim-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "community-1" }) }
  );
}

describe("club claim request route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());

    mocks.auth.mockResolvedValue({
      user: { id: "requester-1", isAdmin: false },
    });
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.clubFindUnique.mockResolvedValue({ isTutorial: false });

    mocks.clubMemberFindUnique.mockResolvedValue({
      userId: "requester-1",
      elo: 1000,
    });

    mocks.txUserFindUnique.mockResolvedValue({
      id: "requester-1",
      name: "New Signup",
      isClaimed: true,
    });

    mocks.txClubMemberFindUnique.mockResolvedValue({
      user: {
        id: "placeholder-1",
        name: "Old Member",
        email: null,
        isClaimed: false,
      },
    });

    mocks.txSessionPlayerFindFirst.mockResolvedValue(null);

    mocks.txClaimRequestCreate.mockResolvedValue({
      id: "claim-1",
      clubId: "community-1",
      requesterUserId: "requester-1",
      targetUserId: "placeholder-1",
      status: ClaimRequestStatus.PENDING,
      note: null,
      createdAt: new Date("2026-05-19T00:00:00.000Z"),
      reviewedAt: null,
      requester: {
        id: "requester-1",
        name: "New Signup",
        email: "new@example.com",
      },
      target: {
        id: "placeholder-1",
        name: "Old Member",
        email: null,
      },
    });
  });

  it("allows an eligible mismatched-name claim request", async () => {
    queuePendingRequestChecks({});

    const response = await postClaim({ targetUserId: "placeholder-1" });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.txClaimRequestCreate).toHaveBeenCalledWith({
      data: {
        clubId: "community-1",
        requesterUserId: "requester-1",
        targetUserId: "placeholder-1",
        note: null,
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        target: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    expect(body).toMatchObject({
      requesterName: "New Signup",
      targetName: "Old Member",
      status: ClaimRequestStatus.PENDING,
    });
  });

  it("rejects requesters who are not yet in the club", async () => {
    mocks.clubMemberFindUnique.mockResolvedValue(null);

    const response = await postClaim({ targetUserId: "placeholder-1" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Join the club before requesting a profile claim");
    expect(mocks.txClaimRequestCreate).not.toHaveBeenCalled();
  });

  it("rejects unclaimed requesters", async () => {
    queuePendingRequestChecks({});
    mocks.txUserFindUnique.mockResolvedValue({
      id: "requester-1",
      name: "New Signup",
      isClaimed: false,
    });

    const response = await postClaim({ targetUserId: "placeholder-1" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Only claimed accounts can request a profile merge.");
  });

  it("rejects requesters with club rating history", async () => {
    queuePendingRequestChecks({});
    mocks.clubMemberFindUnique.mockResolvedValue({
      userId: "requester-1",
      elo: 1016,
    });

    const response = await postClaim({ targetUserId: "placeholder-1" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "This account already has club rating history. Manual merge required."
    );
  });

  it("rejects requesters with club tournament history", async () => {
    queuePendingRequestChecks({});
    mocks.txSessionPlayerFindFirst.mockResolvedValue({ id: "session-player-1" });

    const response = await postClaim({ targetUserId: "placeholder-1" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "This account already has tournament history in this club. Manual merge required."
    );
  });

  it("rejects targets that are not claimable placeholders", async () => {
    queuePendingRequestChecks({});
    mocks.txClubMemberFindUnique.mockResolvedValue({
      user: {
        id: "placeholder-1",
        name: "Claimed Profile",
        email: "claimed@example.com",
        isClaimed: false,
      },
    });

    const response = await postClaim({ targetUserId: "placeholder-1" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Only unclaimed placeholder profiles without email can be claimed"
    );
  });

  it("rejects self-claims", async () => {
    const response = await postClaim({ targetUserId: "requester-1" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("You cannot claim your own account");
  });

  it("rejects duplicate pending requests by the same requester", async () => {
    queuePendingRequestChecks({
      requesterPending: { id: "claim-2" },
    });

    const response = await postClaim({ targetUserId: "placeholder-1" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("You already have a pending claim request in this club");
  });

  it("rejects targets that already have a pending claim request", async () => {
    queuePendingRequestChecks({
      targetPending: { id: "claim-3" },
    });

    const response = await postClaim({ targetUserId: "placeholder-1" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("This profile already has a pending claim request");
  });
});
