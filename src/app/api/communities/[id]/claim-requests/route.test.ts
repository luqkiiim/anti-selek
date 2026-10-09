import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submitAdmissionApi: vi.fn() }));

vi.mock("@/lib/clubAdmissionApi", () => ({
  submitAdmissionApi: mocks.submitAdmissionApi,
  adminAdmissionListApi: vi.fn(),
  admissionDiscoveryApi: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: vi.fn() }));

import { POST } from "./route";

function claim(body: unknown) {
  return POST(
    new Request("http://localhost/api/communities/club/claim-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "club" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.submitAdmissionApi.mockImplementation(async (request: Request) =>
    Response.json({ received: await request.json() }),
  );
});

describe("deprecated community claim route", () => {
  it.each([
    ["targetPlayerId", { targetPlayerId: "historical-player", note: "I played here last year" }],
    ["targetUserId", { targetUserId: "historical-player" }],
  ])("forwards the legacy %s body to the shared admission API", async (_field, body) => {
    const response = await claim(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("Link")).toContain("/api/clubs/club/claim-requests");
    expect(await response.json()).toEqual({ received: body });
    expect(mocks.submitAdmissionApi).toHaveBeenCalledTimes(1);
    const [forwardedRequest, clubId, legacyClaim] = mocks.submitAdmissionApi.mock.calls[0] as [Request, string, boolean];
    expect(forwardedRequest).toBeInstanceOf(Request);
    expect(clubId).toBe("club");
    expect(legacyClaim).toBe(true);
  });
});
