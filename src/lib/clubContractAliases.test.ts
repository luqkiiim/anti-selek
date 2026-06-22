import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClubContractAliasConflictError,
  readAliasedSearchParam,
  readAliasedValue,
  withLegacyClubAliases,
} from "@/lib/clubContractAliases";
import { expectClubContractAliases } from "@/lib/clubContractAliasTestUtils";
import { LEGACY_COMMUNITY_INPUT_ALIAS_USED_EVENT } from "@/lib/serverTelemetry";

function getTelemetryPayload(infoSpy: ReturnType<typeof vi.spyOn>) {
  expect(infoSpy).toHaveBeenCalledTimes(1);
  expect(infoSpy.mock.calls[0]?.[0]).toBe("[telemetry]");

  return JSON.parse(String(infoSpy.mock.calls[0]?.[1])) as {
    details: Record<string, unknown>;
    event: string;
  };
}

describe("club contract aliases", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds legacy response aliases for every canonical club contract field", () => {
    const clubPulse = {
      metrics: { members: 2 },
    };
    const clubs = [{ id: "community-1", name: "Club One" }];

    const response = withLegacyClubAliases({
      clubId: "community-1",
      clubName: "Club One",
      clubPulse,
      clubs,
      quickAccessClubId: "community-1",
      viewerClubRole: "ADMIN",
      partnerClubId: "community-2",
      sourceClubId: "community-3",
      targetClubId: "community-4",
    });

    expectClubContractAliases(response);
  });

  it("logs legacy body alias usage without recording request values", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new Request("http://localhost/api/clubs", {
      method: "POST",
    });

    const value = readAliasedValue(
      { communityId: "legacy-club-id" },
      "clubId",
      "communityId",
      "club identifier",
      {
        canonicalRoute: "/api/clubs",
        request,
        surface: "api",
      }
    );

    expect(value).toBe("legacy-club-id");

    const payload = getTelemetryPayload(infoSpy);
    expect(payload).toMatchObject({
      details: {
        canonicalKey: "clubId",
        conflict: false,
        legacyKey: "communityId",
        method: "POST",
        route: "/api/clubs",
        surface: "api",
      },
      event: LEGACY_COMMUNITY_INPUT_ALIAS_USED_EVENT,
    });
    expect(JSON.stringify(payload)).not.toContain("legacy-club-id");
  });

  it("does not log canonical-only alias usage", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new Request("http://localhost/api/clubs", {
      method: "POST",
    });

    const value = readAliasedValue(
      { clubId: "canonical-club-id" },
      "clubId",
      "communityId",
      "club identifier",
      {
        canonicalRoute: "/api/clubs",
        request,
        surface: "api",
      }
    );

    expect(value).toBe("canonical-club-id");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("logs conflicts before throwing without recording conflicting values", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new Request("http://localhost/api/clubs", {
      method: "POST",
    });

    expect(() =>
      readAliasedValue(
        { clubId: "canonical-club-id", communityId: "legacy-club-id" },
        "clubId",
        "communityId",
        "club identifier",
        {
          canonicalRoute: "/api/clubs",
          request,
          surface: "api",
        }
      )
    ).toThrow(ClubContractAliasConflictError);

    const payload = getTelemetryPayload(infoSpy);
    expect(payload.details.conflict).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("canonical-club-id");
    expect(JSON.stringify(payload)).not.toContain("legacy-club-id");
  });

  it("logs legacy search param usage with compatible route patterns", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const request = new Request(
      "http://localhost/api/communities/host-club-id/collab-roster?partnerCommunityId=partner-club-id"
    );

    const value = readAliasedSearchParam(
      new URL(request.url).searchParams,
      "partnerClubId",
      "partnerCommunityId",
      "partner club identifier",
      {
        canonicalRoute: "/api/clubs/[id]/collab-roster",
        request,
        surface: "api",
      }
    );

    expect(value).toBe("partner-club-id");

    const payload = getTelemetryPayload(infoSpy);
    expect(payload).toMatchObject({
      details: {
        canonicalKey: "partnerClubId",
        conflict: false,
        legacyKey: "partnerCommunityId",
        method: "GET",
        route: "/api/communities/[id]/collab-roster",
        surface: "api",
      },
      event: LEGACY_COMMUNITY_INPUT_ALIAS_USED_EVENT,
    });
    expect(JSON.stringify(payload)).not.toContain("host-club-id");
    expect(JSON.stringify(payload)).not.toContain("partner-club-id");
  });
});
