import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), club: vi.fn(), membership: vi.fn(), rateLimit: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { club: { findUnique: mocks.club }, clubAccess: { findUnique: mocks.membership } } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: mocks.rateLimit, invalidTargetResponse: () => Response.json({ error: "Unavailable" }, { status: 403 }) }));
import { POST } from "./route";

const sessionToken = "71c536cb-9d59-4429-b80a-cb9fcbdd4548";
const request = (body: unknown = { query: "Badminton", sessionToken }) => POST(new Request("http://localhost/api/clubs/home/locations", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: "home" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-only-places-key");
  vi.stubEnv("ADMIN_EMAILS", "");
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ user: { id: "host", email: "host@example.test" } });
  mocks.club.mockResolvedValue({ id: "home", isTutorial: false });
  mocks.membership.mockResolvedValue({ role: "STAFF", status: "ACTIVE" });
  mocks.rateLimit.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("rejects anonymous and quick-access requests before contacting Google", async () => {
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

it("enforces rate limits and handles missing configuration without contacting Google", async () => {
  mocks.rateLimit.mockResolvedValueOnce(Response.json({ error: "Rate limit exceeded" }, { status: 429 }));
  expect((await request()).status).toBe(429);
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
  expect((await request()).status).toBe(503);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each([
  { query: "x", sessionToken },
  { query: "x".repeat(161), sessionToken },
  { query: "Hall", placeId: "ChIJ-test", sessionToken },
  { placeId: "../other-resource", sessionToken },
  { query: "Hall", sessionToken: "" },
])("rejects invalid lookup payloads %j", async body => {
  expect((await request(body)).status).toBe(400);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("requests only prediction fields and returns names and addresses without leaking its key", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ suggestions: [
    { placePrediction: { placeId: "ChIJ-hall", structuredFormat: { mainText: { text: "Community Hall" }, secondaryText: { text: "Petaling Jaya" } } } },
    { queryPrediction: { text: { text: "Not a selectable place" } } },
  ] }));
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ suggestions: [{ placeId: "ChIJ-hall", name: "Community Hall", address: "Petaling Jaya" }] });
  const [url, options] = mocks.fetch.mock.calls[0];
  expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
  expect(options.headers["X-Goog-Api-Key"]).toBe("test-only-places-key");
  expect(options.headers["X-Goog-FieldMask"]).toBe("suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat");
  expect(JSON.parse(options.body)).toMatchObject({ input: "Badminton", sessionToken });
});

it("finishes the autocomplete billing session with the selected place and returns the map link", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ displayName: { text: "Community Hall" }, googleMapsUri: "https://maps.google.com/?cid=123" }));
  const response = await request({ placeId: "ChIJ-hall", sessionToken });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ venue: "Community Hall", venueMapUrl: "https://maps.google.com/?cid=123" });
  const [url, options] = mocks.fetch.mock.calls[0];
  expect(new URL(url).searchParams.get("sessionToken")).toBe(sessionToken);
  expect(options.method).toBe("GET");
  expect(options.headers["X-Goog-FieldMask"]).toBe("displayName,googleMapsUri");
});

it("handles provider rejection and timeouts without leaking provider responses or credentials", async () => {
  mocks.fetch.mockResolvedValueOnce(Response.json({ error: { message: "sensitive provider details" } }, { status: 403 }));
  const rejected = await request();
  expect(rejected.status).toBe(502);
  expect(JSON.stringify(await rejected.json())).not.toMatch(/sensitive|test-only-places-key/);
  mocks.fetch.mockRejectedValueOnce(new DOMException("provider timeout", "TimeoutError"));
  expect((await request()).status).toBe(503);
});
