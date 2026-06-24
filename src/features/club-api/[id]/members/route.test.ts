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
  getClubAdminAccess: vi.fn(),
  clubMemberFindMany: vi.fn(),
  clubMemberUpsert: vi.fn(),
  userCreate: vi.fn(),
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
      findMany: mocks.clubMemberFindMany,
      upsert: mocks.clubMemberUpsert,
    },
    user: {
      create: mocks.userCreate,
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/lib/avatar", () => ({
  serializeAvatarEntity: mocks.serializeAvatarEntity,
}));

vi.mock("@/lib/clubAdminPermissions", () => ({
  getClubAdminAccess: mocks.getClubAdminAccess,
}));

vi.mock("@/lib/mixedSide", () => ({
  isValidMixedSide: (value: unknown) =>
    value === "UPPER" || value === "LOWER",
  isValidPartnerPreference: (value: unknown) =>
    value === PartnerPreference.OPEN,
  isValidPlayerGender: (value: unknown) =>
    value === PlayerGender.MALE ||
    value === PlayerGender.FEMALE ||
    value === PlayerGender.UNSPECIFIED,
  resolveMixedSideState: mocks.resolveMixedSideState,
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

import { POST } from "./route";

function postMember(body: unknown) {
  return POST(
    new Request("http://localhost/api/clubs/community-1/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "community-1" }) }
  );
}

describe("club admin create member route", () => {
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
    mocks.getClubAdminAccess.mockResolvedValue({
      canAdmin: true,
      createdById: "owner-1",
    });
    mocks.resolveMixedSideState.mockReturnValue({
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.serializeAvatarEntity.mockReturnValue({ avatarUrl: null });
  });

  it("saves and returns the more-rest default for new placeholders", async () => {
    const createdAt = new Date("2026-06-24T00:00:00.000Z");
    mocks.clubMemberFindMany.mockResolvedValue([]);
    mocks.userCreate.mockResolvedValue({
      id: "player-1",
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
    mocks.clubMemberUpsert.mockResolvedValue({
      role: "MEMBER",
      elo: 1000,
      status: ClubPlayerStatus.CORE,
      needsMoreRest: true,
    });

    const response = await postMember({
      name: "Rest Player",
      gender: PlayerGender.MALE,
      needsMoreRest: true,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubMemberUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clubId: "community-1",
          userId: "player-1",
          needsMoreRest: true,
        }),
        select: {
          role: true,
          elo: true,
          status: true,
          needsMoreRest: true,
        },
      })
    );
    expect(body.needsMoreRest).toBe(true);
  });
});
