import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), club: vi.fn(), membership: vi.fn(), rateLimit: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { club: { findUnique: mocks.club }, clubAccess: { findUnique: mocks.membership } } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit, invalidTargetResponse: () => Response.json({ error: "Unavailable" }, { status: 403 }) }));
import { POST } from "./route";

const request = (body: unknown = { query: "Badminton" }) => POST(new Request("http://localhost/api/clubs/home/locations", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: "home" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEOAPIFY_API_KEY", "test-only-geoapify-key");
  vi.stubEnv("ADMIN_EMAILS", "");
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ user: { id: "host", email: "host@example.test" } });
  mocks.club.mockResolvedValue({ id: "home", isTutorial: false });
  mocks.membership.mockResolvedValue({ role: "STAFF", status: "ACTIVE" });
  mocks.rateLimit.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("rejects anonymous and quick-access requests before contacting Geoapify", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await request()).status).toBe(401);
  mocks.auth.mockResolvedValue({ user: { id: "host", isQuickAccess: true } });
  expect((await request()).status).toBe(403);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each([{ role: "MEMBER", status: "ACTIVE" }, { role: "OWNER", status: "REVOKED" }, null])("requires current operator access (%j)", async membership => {
  mocks.membership.mockResolvedValue(membership);
  expect((await request()).status).toBe(403);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("does not let an operator spend lookup requests against a missing club or someone else's tutorial", async () => {
  mocks.club.mockResolvedValue(null);
  expect((await request()).status).toBe(403);
  mocks.club.mockResolvedValue({ id: "home", isTutorial: true, tutorialOwnerId: "someone-else" });
  expect((await request()).status).toBe(403);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("enforces rate limits and handles missing configuration without contacting Geoapify", async () => {
  mocks.rateLimit.mockResolvedValueOnce(Response.json({ error: "Rate limit exceeded" }, { status: 429 }));
  expect((await request()).status).toBe(429);
  vi.stubEnv("GEOAPIFY_API_KEY", "");
  expect((await request()).status).toBe(503);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each([
  null,
  { query: "x" },
  { query: "x".repeat(161) },
  { query: 123 },
  { placeId: "not-a-query" },
])("rejects invalid lookup payloads %j", async body => {
  expect((await request(body)).status).toBe(400);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("returns place names, addresses and coordinate map links without exposing its key or making a second lookup", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ results: [
    { place_id: "geoapify-hall", name: "Community Hall", address_line2: "Petaling Jaya", lat: 3.107, lon: 101.6 },
  ] }));
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const result = await response.json();
  expect(result.suggestions).toEqual([{ placeId: "geoapify-hall", name: "Community Hall", address: "Petaling Jaya", mapUrl: "https://www.google.com/maps/search/?api=1&query=3.107%2C101.6" }]);
  expect(JSON.stringify(result)).not.toContain("test-only-geoapify-key");
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = mocks.fetch.mock.calls[0];
  expect(url.origin + url.pathname).toBe("https://api.geoapify.com/v1/geocode/autocomplete");
  expect(url.searchParams.get("apiKey")).toBe("test-only-geoapify-key");
  expect(url.searchParams.get("text")).toBe("Badminton");
  expect(url.searchParams.get("bias")).toBe("countrycode:my");
  expect(url.searchParams.has("filter")).toBe(false);
  expect(options.cache).toBe("no-store");
});

it("supports address-only results and skips invalid coordinates rather than creating incorrect map links", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ results: [
    { name: "Missing coordinates" },
    { name: "Out of bounds", lat: 91, lon: 101.6 },
    { name: "Invalid coordinate type", lat: "3.107", lon: 101.6 },
    { address_line1: "Jalan SS2", formatted: "Jalan SS2, Petaling Jaya", lat: 3.107, lon: 101.6 },
  ] }));
  expect((await (await request()).json()).suggestions).toEqual([
    { placeId: "3.107,101.6", name: "Jalan SS2", address: "Jalan SS2, Petaling Jaya", mapUrl: "https://www.google.com/maps/search/?api=1&query=3.107%2C101.6" },
  ]);
});

it("handles provider rejection and timeouts without leaking provider responses or credentials", async () => {
  mocks.fetch.mockResolvedValueOnce(Response.json({ error: { message: "sensitive provider details" } }, { status: 403 }));
  const rejected = await request();
  expect(rejected.status).toBe(502);
  expect(JSON.stringify(await rejected.json())).not.toMatch(/sensitive|test-only-geoapify-key/);
  mocks.fetch.mockRejectedValueOnce(new DOMException("provider timeout", "TimeoutError"));
  expect((await request()).status).toBe(503);
});
