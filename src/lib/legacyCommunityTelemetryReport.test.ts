import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const scriptPath = path.resolve(
  process.cwd(),
  "scripts/legacy-community-telemetry-report.mjs"
);

function runReport(input: string) {
  return execFileSync(process.execPath, [scriptPath], {
    encoding: "utf8",
    input,
  });
}

describe("legacy community telemetry report", () => {
  it("summarizes legacy route and input-alias telemetry without leaking values", () => {
    const output = runReport(
      [
        "plain application log",
        `[telemetry] ${JSON.stringify({
          details: {
            method: "GET",
            responseStatus: 200,
            route: "/api/communities/[id]",
            surface: "api",
          },
          event: "legacy_contract.community_route_used",
          request: {
            ip: "203.0.113.10",
            userAgent:
              "Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
          },
          timestamp: "2026-06-24T01:00:00.000Z",
        })}`,
        `[telemetry] ${JSON.stringify({
          details: {
            canonicalKey: "clubId",
            conflict: false,
            legacyKey: "communityId",
            method: "POST",
            route: "/api/clubs",
            surface: "api",
            value: "secret-club-id",
          },
          event: "legacy_contract.community_input_alias_used",
          request: {
            ip: "203.0.113.11",
            userAgent: "curl/8.7.1",
          },
          timestamp: "2026-06-24T01:01:00.000Z",
        })}`,
        "[telemetry] not-json",
        `[telemetry] ${JSON.stringify({
          details: { route: "/api/clubs" },
          event: "unrelated.event",
          timestamp: "2026-06-24T01:02:00.000Z",
        })}`,
        `[telemetry] ${JSON.stringify({
          details: {
            method: "GET",
            responseStatus: 200,
            route: "/community/[id]",
            surface: "page",
          },
          event: "legacy_contract.community_route_used",
          request: {
            userAgent:
              "Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
          },
          timestamp: "2026-06-24T01:03:00.000Z",
        })}`,
      ].join("\n")
    );

    expect(output).toContain("Total events: 3");
    expect(output).toContain("Latest timestamp: 2026-06-24T01:03:00.000Z");
    expect(output).toContain("Malformed telemetry lines: 1");
    expect(output).toContain("legacy_contract.community_route_used: 2");
    expect(output).toContain("legacy_contract.community_input_alias_used: 1");
    expect(output).toContain("/api/communities/[id]: 1");
    expect(output).toContain("/api/clubs: 1");
    expect(output).toContain("/community/[id]: 1");
    expect(output).toContain("communityId: 1");
    expect(output).toContain("api: 2");
    expect(output).toContain("page: 1");
    expect(output).toContain("GET: 2");
    expect(output).toContain("POST: 1");
    expect(output).toContain("200: 2");
    expect(output).toContain("chrome: 1");
    expect(output).toContain("curl: 1");
    expect(output).toContain("safari: 1");
    expect(output).not.toContain("secret-club-id");
    expect(output).not.toContain("203.0.113");
  });
});
