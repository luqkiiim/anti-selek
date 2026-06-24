import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isQuickAccessSession: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubMemberFindMany: vi.fn(),
  clubMemberUpdate: vi.fn(),
  clubMemberDelete: vi.fn(),
  clubFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionPlayerDeleteMany: vi.fn(),
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  resolveMixedSideState: vi.fn(),
  serializeAvatarEntity: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
      findMany: mocks.clubMemberFindMany,
      update: mocks.clubMemberUpdate,
      delete: mocks.clubMemberDelete,
    },
    club: {
      findUnique: mocks.clubFindUnique,
    },
    session: {
      findMany: mocks.sessionFindMany,
    },
    sessionPlayer: {
      deleteMany: mocks.sessionPlayerDeleteMany,
    },
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/mixedSide", () => ({
  isValidMixedSide: (value: unknown) =>
    value === "UPPER" || value === "LOWER",
  isValidPartnerPreference: (value: unknown) => value === PartnerPreference.OPEN,
  isValidPlayerGender: (value: unknown) =>
    value === PlayerGender.MALE ||
    value === PlayerGender.FEMALE ||
    value === PlayerGender.UNSPECIFIED,
  resolveMixedSideState: mocks.resolveMixedSideState,
}));

vi.mock("@/lib/avatar", () => ({
  serializeAvatarEntity: mocks.serializeAvatarEntity,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

vi.mock("@/lib/quickAccess", () => ({
  getQuickAccessDeniedMessage: () => "Quick access not allowed",
  isQuickAccessSession: mocks.isQuickAccessSession,
  normalizeNameLookupKey: (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " "),
}));

import { DELETE, PATCH } from "./route";

function patchMember(body: unknown, userId = "user-1") {
  return PATCH(
    new Request(`http://localhost/api/clubs/community-1/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "community-1", userId }) }
  );
}

function deleteMember(userId = "user-1") {
  return DELETE(
    new Request(`http://localhost/api/clubs/community-1/members/${userId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: "community-1", userId }) }
  );
}

describe("club admin update member route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());

    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false },
    });
    mocks.isQuickAccessSession.mockReturnValue(false);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.clubFindUnique.mockResolvedValue({
      createdById: "owner-1",
    });
    mocks.sessionFindMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        sessionPlayer: {
          deleteMany: mocks.sessionPlayerDeleteMany,
        },
        clubMember: {
          delete: mocks.clubMemberDelete,
        },
      })
    );
    mocks.resolveMixedSideState.mockReturnValue({
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.serializeAvatarEntity.mockImplementation((entity: { avatarKey?: string | null }) => ({
      avatarUrl: entity.avatarKey ?? null,
    }));
  });

  it("rejects renaming claimed members", async () => {
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Claimed Player",
      email: "claimed@example.com",
      avatarKey: null,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });

    const response = await patchMember({ name: "Renamed By Admin" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Claimed members manage their own account name");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects changing claimed member account emails", async () => {
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      name: "Claimed Player",
      email: "claimed@example.com",
      avatarKey: null,
      isActive: true,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });

    const response = await patchMember({ email: "attacker@example.com" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Claimed members manage their own account email");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects changing claimed member account status", async () => {
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Claimed Player",
      email: "claimed@example.com",
      avatarKey: null,
      isActive: true,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });

    const response = await patchMember({ isActive: false });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Claimed members manage their own account status");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("still allows renaming unclaimed placeholders", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      })
      .mockResolvedValueOnce({
        role: "MEMBER",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Placeholder",
      email: null,
      avatarKey: null,
      isClaimed: false,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.clubMemberFindMany.mockResolvedValue([]);
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Renamed Placeholder",
      email: null,
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: false,
      createdAt,
    });

    const response = await patchMember({ name: "Renamed Placeholder" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        name: "Renamed Placeholder",
        email: undefined,
        gender: undefined,
        partnerPreference: PartnerPreference.OPEN,
        mixedSideOverride: null,
        isActive: undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarKey: true,
        gender: true,
        partnerPreference: true,
        mixedSideOverride: true,
        isActive: true,
        isClaimed: true,
        createdAt: true,
      },
    });
    expect(body.name).toBe("Renamed Placeholder");
  });

  it("saves and returns the more-rest player default", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
        needsMoreRest: false,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Rest Player",
      email: null,
      avatarKey: null,
      isClaimed: false,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.clubMemberFindMany.mockResolvedValue([]);
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Rest Player",
      email: null,
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: false,
      createdAt,
    });
    mocks.clubMemberUpdate.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: ClubPlayerStatus.CORE,
      needsMoreRest: true,
    });

    const response = await patchMember({ needsMoreRest: true });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubMemberUpdate).toHaveBeenCalledWith({
      where: {
        clubId_userId: {
          clubId: "community-1",
          userId: "user-1",
        },
      },
      data: {
        needsMoreRest: true,
      },
      select: { role: true, elo: true, status: true, needsMoreRest: true },
    });
    expect(body.needsMoreRest).toBe(true);
  });

  it("allows admins to grant staff to claimed members", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique
      .mockResolvedValueOnce({ isClaimed: true })
      .mockResolvedValueOnce({
        name: "Claimed Player",
        email: "claimed@example.com",
        avatarKey: null,
        isClaimed: true,
        gender: PlayerGender.MALE,
        partnerPreference: PartnerPreference.OPEN,
        mixedSideOverride: null,
      });
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Claimed Player",
      email: "claimed@example.com",
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: true,
      createdAt,
    });
    mocks.clubMemberUpdate.mockResolvedValue({
      role: "STAFF",
      elo: 1000,
      status: ClubPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "STAFF" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "STAFF" }),
      })
    );
    expect(body.role).toBe("STAFF");
  });

  it("allows admins to revoke staff back to member", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "STAFF",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Staff Player",
      email: "staff@example.com",
      avatarKey: null,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Staff Player",
      email: "staff@example.com",
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: true,
      createdAt,
    });
    mocks.clubMemberUpdate.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: ClubPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "MEMBER" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.role).toBe("MEMBER");
  });

  it("allows the club owner to demote another admin to staff", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.auth.mockResolvedValue({
      user: { id: "owner-1", isAdmin: false },
    });
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Other Admin",
      email: "admin@example.com",
      avatarKey: null,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Other Admin",
      email: "admin@example.com",
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: true,
      createdAt,
    });
    mocks.clubMemberUpdate.mockResolvedValue({
      role: "STAFF",
      elo: 1000,
      status: ClubPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "STAFF" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "STAFF" }),
      })
    );
    expect(body.role).toBe("STAFF");
  });

  it("allows the club owner to demote another admin to member", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.auth.mockResolvedValue({
      user: { id: "owner-1", isAdmin: false },
    });
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Other Admin",
      email: "admin@example.com",
      avatarKey: null,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Other Admin",
      email: "admin@example.com",
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: true,
      createdAt,
    });
    mocks.clubMemberUpdate.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: ClubPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "MEMBER" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "MEMBER" }),
      })
    );
    expect(body.role).toBe("MEMBER");
  });

  it("allows global admins to demote club admins", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.auth.mockResolvedValue({
      user: { id: "global-1", isAdmin: true },
    });
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });
    mocks.userFindUnique.mockResolvedValue({
      name: "Other Admin",
      email: "admin@example.com",
      avatarKey: null,
      isClaimed: true,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.userUpdate.mockResolvedValue({
      id: "user-1",
      name: "Other Admin",
      email: "admin@example.com",
      avatarKey: null,
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
      isActive: true,
      isClaimed: true,
      createdAt,
    });
    mocks.clubMemberUpdate.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: ClubPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "MEMBER" });

    expect(response.status).toBe(200);
    expect(mocks.clubMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "MEMBER" }),
      })
    );
  });

  it("rejects regular admin attempts to demote another admin", async () => {
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });

    const response = await patchMember({ role: "STAFF" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only the club owner can demote admins");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.clubMemberUpdate).not.toHaveBeenCalled();
  });

  it("rejects attempts to demote the club owner", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "global-1", isAdmin: true },
    });
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });

    const response = await patchMember({ role: "STAFF" }, "owner-1");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("The club owner role cannot be changed");
    expect(mocks.clubMemberUpdate).not.toHaveBeenCalled();
  });

  it("rejects self-demotion", async () => {
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: ClubPlayerStatus.CORE,
      });

    const response = await patchMember({ role: "MEMBER" }, "admin-1");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot change your own club role");
    expect(mocks.clubMemberUpdate).not.toHaveBeenCalled();
  });

  it("rejects direct removal of admins and owners", async () => {
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
      })
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "owner-membership",
        role: "ADMIN",
      });

    const adminResponse = await deleteMember("user-1");
    const adminBody = await adminResponse.json();
    const ownerResponse = await deleteMember("owner-1");
    const ownerBody = await ownerResponse.json();

    expect(adminResponse.status).toBe(400);
    expect(adminBody.error).toBe("Demote admins before removing them");
    expect(ownerResponse.status).toBe(400);
    expect(ownerBody.error).toBe("The club owner cannot be removed");
  });

  it("allows an admin to leave when another admin remains", async () => {
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
      });
    mocks.clubMemberFindMany.mockResolvedValueOnce([
      { id: "other-admin-membership" },
    ]);
    mocks.sessionFindMany.mockResolvedValueOnce([{ id: "session-1" }]);

    const response = await deleteMember("admin-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mocks.clubMemberFindMany).toHaveBeenCalledWith({
      where: {
        clubId: "community-1",
        role: "ADMIN",
        userId: { not: "admin-1" },
      },
      select: { id: true },
      take: 1,
    });
    expect(mocks.sessionPlayerDeleteMany).toHaveBeenCalledWith({
      where: {
        sessionId: { in: ["session-1"] },
        userId: "admin-1",
      },
    });
    expect(mocks.clubMemberDelete).toHaveBeenCalledWith({
      where: {
        clubId_userId: {
          clubId: "community-1",
          userId: "admin-1",
        },
      },
    });
  });

  it("blocks an admin from leaving when no other admin remains", async () => {
    mocks.clubFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.clubMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
      });
    mocks.clubMemberFindMany.mockResolvedValueOnce([]);

    const response = await deleteMember("admin-1");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Make another member an admin before leaving this club"
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects staff attempts to edit player profiles", async () => {
    mocks.clubMemberFindUnique.mockResolvedValueOnce({ role: "STAFF" });

    const response = await patchMember({ name: "Nope" });

    expect(response.status).toBe(403);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.clubMemberUpdate).not.toHaveBeenCalled();
  });
});
