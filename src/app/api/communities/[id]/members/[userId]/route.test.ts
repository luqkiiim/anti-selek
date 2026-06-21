import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommunityPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isQuickAccessSession: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  invalidTargetResponse: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  communityMemberFindMany: vi.fn(),
  communityMemberUpdate: vi.fn(),
  communityMemberDelete: vi.fn(),
  communityFindUnique: vi.fn(),
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
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
      findMany: mocks.communityMemberFindMany,
      update: mocks.communityMemberUpdate,
      delete: mocks.communityMemberDelete,
    },
    community: {
      findUnique: mocks.communityFindUnique,
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
    new Request(`http://localhost/api/communities/community-1/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "community-1", userId }) }
  );
}

function deleteMember(userId = "user-1") {
  return DELETE(
    new Request(`http://localhost/api/communities/community-1/members/${userId}`, {
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
    mocks.communityFindUnique.mockResolvedValue({
      createdById: "owner-1",
    });
    mocks.sessionFindMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        sessionPlayer: {
          deleteMany: mocks.sessionPlayerDeleteMany,
        },
        communityMember: {
          delete: mocks.communityMemberDelete,
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
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
      })
      .mockResolvedValueOnce({
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberFindMany.mockResolvedValue([]);
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

  it("allows admins to grant staff to claimed members", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "MEMBER",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberUpdate.mockResolvedValue({
      role: "STAFF",
      elo: 1000,
      status: CommunityPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "STAFF" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.communityMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "STAFF" }),
      })
    );
    expect(body.role).toBe("STAFF");
  });

  it("allows admins to revoke staff back to member", async () => {
    const createdAt = new Date("2026-05-19T00:00:00.000Z");
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "STAFF",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberUpdate.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: CommunityPlayerStatus.CORE,
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
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberUpdate.mockResolvedValue({
      role: "STAFF",
      elo: 1000,
      status: CommunityPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "STAFF" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.communityMemberUpdate).toHaveBeenCalledWith(
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
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberUpdate.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: CommunityPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "MEMBER" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.communityMemberUpdate).toHaveBeenCalledWith(
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
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
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
    mocks.communityMemberUpdate.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: CommunityPlayerStatus.CORE,
    });

    const response = await patchMember({ role: "MEMBER" });

    expect(response.status).toBe(200);
    expect(mocks.communityMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "MEMBER" }),
      })
    );
  });

  it("rejects regular admin attempts to demote another admin", async () => {
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
      });

    const response = await patchMember({ role: "STAFF" });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only the club owner can demote admins");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.communityMemberUpdate).not.toHaveBeenCalled();
  });

  it("rejects attempts to demote the club owner", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "global-1", isAdmin: true },
    });
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
      });

    const response = await patchMember({ role: "STAFF" }, "owner-1");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("The club owner role cannot be changed");
    expect(mocks.communityMemberUpdate).not.toHaveBeenCalled();
  });

  it("rejects self-demotion", async () => {
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
        elo: 1000,
        status: CommunityPlayerStatus.CORE,
      });

    const response = await patchMember({ role: "MEMBER" }, "admin-1");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot change your own club role");
    expect(mocks.communityMemberUpdate).not.toHaveBeenCalled();
  });

  it("rejects direct removal of admins and owners", async () => {
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
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
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
      });
    mocks.communityMemberFindMany.mockResolvedValueOnce([
      { id: "other-admin-membership" },
    ]);
    mocks.sessionFindMany.mockResolvedValueOnce([{ id: "session-1" }]);

    const response = await deleteMember("admin-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mocks.communityMemberFindMany).toHaveBeenCalledWith({
      where: {
        communityId: "community-1",
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
    expect(mocks.communityMemberDelete).toHaveBeenCalledWith({
      where: {
        communityId_userId: {
          communityId: "community-1",
          userId: "admin-1",
        },
      },
    });
  });

  it("blocks an admin from leaving when no other admin remains", async () => {
    mocks.communityFindUnique.mockResolvedValue({ createdById: "owner-1" });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({
        id: "membership-1",
        role: "ADMIN",
      });
    mocks.communityMemberFindMany.mockResolvedValueOnce([]);

    const response = await deleteMember("admin-1");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Make another member an admin before leaving this club"
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects staff attempts to edit player profiles", async () => {
    mocks.communityMemberFindUnique.mockResolvedValueOnce({ role: "STAFF" });

    const response = await patchMember({ name: "Nope" });

    expect(response.status).toBe(403);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.communityMemberUpdate).not.toHaveBeenCalled();
  });
});
