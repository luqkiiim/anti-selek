import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_MAX_FILE_BYTES } from "@/lib/avatar";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  playerFindUnique: vi.fn(),
  playerUpdate: vi.fn(),
  clubAccessFindUnique: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  uploadAvatarObject: vi.fn(),
  cleanupSupersededAvatar: vi.fn(),
  rollbackUploadedAvatar: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    player: { findUnique: mocks.playerFindUnique, update: mocks.playerUpdate },
    clubAccess: { findUnique: mocks.clubAccessFindUnique },
    clubMember: { findUnique: mocks.clubMemberFindUnique },
  },
}));
vi.mock("@/lib/avatarStorage", () => ({
  uploadAvatarObject: mocks.uploadAvatarObject,
  cleanupSupersededAvatar: mocks.cleanupSupersededAvatar,
  rollbackUploadedAvatar: mocks.rollbackUploadedAvatar,
}));
vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 403 })),
  rateLimit: vi.fn(async () => null),
}));
import { DELETE, POST } from "./route";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function createAvatarRequest({
  url = "http://localhost/api/users/player-1/avatar",
  file = new File([PNG_BYTES], "avatar.png", { type: "image/png" }),
}: { url?: string; file?: File } = {}) {
  const formData = new FormData();
  formData.append("avatar", file);
  return new Request(url, { method: "POST", body: formData });
}
function setOwnerRequest() {
  mocks.auth.mockResolvedValue({ user: { id: "account-1", isAdmin: false, isQuickAccess: false } });
  mocks.playerFindUnique.mockResolvedValue({
    id: "player-1", ownerUserId: "account-1", avatarKey: "https://blob.vercel-storage.com/avatars/player-1/old.jpg", name: "Owner",
  });
}

describe("user avatar route", () => {
  const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_token";
    mocks.uploadAvatarObject.mockResolvedValue("https://blob.vercel-storage.com/avatars/player-1/123-avatar.png");
    mocks.playerUpdate.mockImplementation(async ({ data }: { data: { avatarKey?: string | null } }) => ({ avatarKey: data.avatarKey ?? null }));
    mocks.clubAccessFindUnique.mockResolvedValue(null);
    mocks.clubMemberFindUnique.mockResolvedValue(null);
  });
  afterAll(() => { process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken; });

  it("uploads an avatar for an owner using distinct Account and Player IDs", async () => {
    setOwnerRequest();
    const response = await POST(createAvatarRequest(), { params: Promise.resolve({ id: "player-1" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.playerFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "player-1" } }));
    expect(mocks.uploadAvatarObject).toHaveBeenCalledWith(expect.objectContaining({ avatarPathname: expect.stringMatching(/^avatars\/player-1\//) }));
    expect(mocks.playerUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "player-1" } }));
    expect(body.avatarUrl).toBe("https://blob.vercel-storage.com/avatars/player-1/123-avatar.png");
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({
      previousAvatarKey: "https://blob.vercel-storage.com/avatars/player-1/old.jpg",
      nextAvatarKey: "https://blob.vercel-storage.com/avatars/player-1/123-avatar.png",
    });
  });

  it("rejects avatars above the 4MB limit", async () => {
    setOwnerRequest();
    const response = await POST(createAvatarRequest({ file: new File([new Uint8Array(AVATAR_MAX_FILE_BYTES + 1)], "big.png", { type: "image/png" }) }), { params: Promise.resolve({ id: "player-1" }) });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Avatar images must be 4MB or smaller after cropping.");
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("rejects files whose bytes do not match the declared image type", async () => {
    setOwnerRequest();
    const response = await POST(createAvatarRequest({ file: new File([new Uint8Array([0x3c, 0x73, 0x76, 0x67])], "avatar.png", { type: "image/png" }) }), { params: Promise.resolve({ id: "player-1" }) });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("The prepared avatar does not contain valid PNG image data. Try selecting the image again, or export it as JPG, PNG, or WebP.");
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("returns 503 when blob storage is not configured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "";
    setOwnerRequest();
    const response = await POST(createAvatarRequest(), { params: Promise.resolve({ id: "player-1" }) });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("Avatar storage is not configured");
  });

  it("rejects quick-access self-management", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "player-1", isAdmin: false, isQuickAccess: true } });
    mocks.playerFindUnique.mockResolvedValue({ id: "player-1", ownerUserId: "account-1", avatarKey: null, name: "Quick User" });
    const response = await POST(createAvatarRequest(), { params: Promise.resolve({ id: "player-1" }) });
    expect(response.status).toBe(403);
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("allows an active club admin to manage a guest Player avatar", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-admin", isAdmin: false, isQuickAccess: false } });
    mocks.playerFindUnique.mockResolvedValue({ id: "player-guest", ownerUserId: null, avatarKey: null, name: "Guest" });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    mocks.clubMemberFindUnique.mockResolvedValue({ id: "club-player-guest" });
    const response = await POST(createAvatarRequest({ url: "http://localhost/api/users/player-guest/avatar?clubId=club-1" }), { params: Promise.resolve({ id: "player-guest" }) });
    expect(response.status).toBe(200);
    expect(mocks.clubAccessFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { clubId_userId: { clubId: "club-1", userId: "account-admin" } } }));
    expect(mocks.clubMemberFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { clubId_playerId: { clubId: "club-1", playerId: "player-guest" } } }));
  });

  it("allows an active OWNER Account to manage a different Player avatar", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-owner", isAdmin: false, isQuickAccess: false } });
    mocks.playerFindUnique.mockResolvedValue({ id: "historical-player-789", ownerUserId: null, avatarKey: null, name: "Historical Player" });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    mocks.clubMemberFindUnique.mockResolvedValue({ id: "club-player-789" });

    const response = await POST(
      createAvatarRequest({ url: "http://localhost/api/users/historical-player-789/avatar?clubId=club-1" }),
      { params: Promise.resolve({ id: "historical-player-789" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.clubAccessFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { clubId_userId: { clubId: "club-1", userId: "account-owner" } } }));
    expect(mocks.clubMemberFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { clubId_playerId: { clubId: "club-1", playerId: "historical-player-789" } } }));
  });

  it("does not allow a revoked OWNER grant to manage a Player avatar", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-owner", isAdmin: false, isQuickAccess: false } });
    mocks.playerFindUnique.mockResolvedValue({ id: "historical-player-789", ownerUserId: null, avatarKey: null, name: "Historical Player" });
    mocks.clubAccessFindUnique.mockResolvedValue({ role: "OWNER", status: "REVOKED" });
    mocks.clubMemberFindUnique.mockResolvedValue({ id: "club-player-789" });

    const response = await POST(
      createAvatarRequest({ url: "http://localhost/api/users/historical-player-789/avatar?clubId=club-1" }),
      { params: Promise.resolve({ id: "historical-player-789" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("clears a managed Player avatar key", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-admin", isAdmin: true, isQuickAccess: false } });
    mocks.playerFindUnique.mockResolvedValue({ id: "player-9", ownerUserId: null, avatarKey: "https://blob.vercel-storage.com/avatars/player-9/avatar.jpg", name: "Managed Player" });
    const response = await DELETE(new Request("http://localhost/api/users/player-9/avatar", { method: "DELETE" }), { params: Promise.resolve({ id: "player-9" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ avatarUrl: null });
    expect(mocks.playerUpdate).toHaveBeenCalledWith({ where: { id: "player-9" }, data: { avatarKey: null } });
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({ previousAvatarKey: "https://blob.vercel-storage.com/avatars/player-9/avatar.jpg", nextAvatarKey: null });
  });
});
