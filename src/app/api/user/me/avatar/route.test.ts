import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), sync: vi.fn(), upload: vi.fn(), cleanup: vi.fn(), rollback: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.find } } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/clubAdmissions", () => ({ admissionTransaction: async (_db: unknown, fn: (tx: object) => unknown) => fn({}) }));
vi.mock("@/lib/accountProfileSync", async original => ({ ...await original<typeof import("@/lib/accountProfileSync")>(), syncAccountProfile: mocks.sync }));
vi.mock("@/lib/avatarStorage", () => ({ uploadAvatarObject: mocks.upload, cleanupSupersededAvatar: mocks.cleanup, rollbackUploadedAvatar: mocks.rollback }));
import { AccountProfileSyncError } from "@/lib/accountProfileSync";
import { POST, DELETE } from "./route";
function request() {
  const body = new FormData(); body.append("avatar", new File([new Uint8Array([137,80,78,71,13,10,26,10])], "photo.png", { type: "image/png" }));
  return new Request("http://localhost/api/user/me/avatar", { method: "POST", body });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("BLOB_READ_WRITE_TOKEN", "local-token");
  mocks.auth.mockResolvedValue({ user: { id: "account" } }); mocks.find.mockResolvedValue({ id: "account", isActive: true, avatarKey: "old" });
  mocks.upload.mockResolvedValue("https://blob.vercel-storage.com/avatars/new.png"); mocks.sync.mockResolvedValue({ previousAvatarKeys: ["old", "archived-old"] });
});
afterEach(() => vi.unstubAllEnvs());
describe("canonical account avatar", () => {
  it("uploads before synchronization and cleans all superseded photos after commit", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith({}, { userId: "account", changes: { avatarKey: "https://blob.vercel-storage.com/avatars/new.png" }, expectedAvatarKey: "old" });
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.sync.mock.invocationCallOrder[0]);
    expect(mocks.sync.mock.invocationCallOrder[0]).toBeLessThan(mocks.cleanup.mock.invocationCallOrder[0]);
    expect(mocks.cleanup).toHaveBeenCalledTimes(2);
  });
  it("rolls back the uploaded object on transactional conflict", async () => {
    mocks.sync.mockRejectedValue(new AccountProfileSyncError("Changed"));
    expect((await POST(request())).status).toBe(409);
    expect(mocks.rollback).toHaveBeenCalledWith({ uploadedAvatarKey: "https://blob.vercel-storage.com/avatars/new.png" }); expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("removes canonical photo through the same owner synchronization", async () => {
    expect((await DELETE(new Request("http://localhost/api/user/me/avatar", { method: "DELETE" }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith({}, { userId: "account", changes: { avatarKey: null }, expectedAvatarKey: "old" });
  });
});
