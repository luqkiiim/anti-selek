#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TELEMETRY_MARKER = "[telemetry]";
const ROUTE_EVENT = "legacy_contract.community_route_used";
const INPUT_ALIAS_EVENT = "legacy_contract.community_input_alias_used";
const TARGET_EVENTS = new Set([ROUTE_EVENT, INPUT_ALIAS_EVENT]);

function increment(map, key) {
  const normalizedKey =
    typeof key === "string" && key.trim().length > 0 ? key.trim() : "unknown";
  map.set(normalizedKey, (map.get(normalizedKey) ?? 0) + 1);
}

function userAgentFamily(userAgent) {
  if (typeof userAgent !== "string" || userAgent.trim().length === 0) {
    return "unknown";
  }

  const value = userAgent.toLowerCase();
  if (value.includes("edg/")) return "edge";
  if (value.includes("firefox/")) return "firefox";
  if (value.includes("chrome/") || value.includes("chromium/")) return "chrome";
  if (value.includes("safari/")) return "safari";
  if (value.includes("curl/")) return "curl";
  if (value.includes("node")) return "node";
  return "other";
}

export function parseLegacyCommunityTelemetry(text) {
  const events = [];
  const malformedLines = [];
  const lines = String(text ?? "").split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const markerIndex = line.indexOf(TELEMETRY_MARKER);
    if (markerIndex === -1) {
      continue;
    }

    const jsonText = line.slice(markerIndex + TELEMETRY_MARKER.length).trim();
    try {
      const payload = JSON.parse(jsonText);
      if (TARGET_EVENTS.has(payload?.event)) {
        events.push(payload);
      }
    } catch {
      malformedLines.push(index + 1);
    }
  }

  return { events, malformedLines };
}

export function buildLegacyCommunityTelemetryReport(text) {
  const { events, malformedLines } = parseLegacyCommunityTelemetry(text);
  const byEvent = new Map();
  const byRoute = new Map();
  const byLegacyKey = new Map();
  const bySurface = new Map();
  const byMethod = new Map();
  const byStatus = new Map();
  const byUserAgentFamily = new Map();
  let latestTimestamp = null;

  for (const event of events) {
    const details = event.details ?? {};
    increment(byEvent, event.event);
    increment(byRoute, details.route);
    if (details.legacyKey !== undefined) {
      increment(byLegacyKey, details.legacyKey);
    }
    increment(bySurface, details.surface);
    increment(byMethod, details.method);
    if (details.responseStatus !== undefined) {
      increment(byStatus, String(details.responseStatus));
    }
    increment(byUserAgentFamily, userAgentFamily(event.request?.userAgent));

    if (typeof event.timestamp === "string") {
      const timestamp = Date.parse(event.timestamp);
      if (
        Number.isFinite(timestamp) &&
        (!latestTimestamp || timestamp > Date.parse(latestTimestamp))
      ) {
        latestTimestamp = event.timestamp;
      }
    }
  }

  return {
    byEvent,
    byLegacyKey,
    byMethod,
    byRoute,
    byStatus,
    bySurface,
    byUserAgentFamily,
    latestTimestamp,
    malformedLineCount: malformedLines.length,
    total: events.length,
  };
}

function formatMap(title, map) {
  const entries = [...map.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });

  if (entries.length === 0) {
    return [`${title}: none`];
  }

  return [
    `${title}:`,
    ...entries.map(([key, count]) => `  ${key}: ${count}`),
  ];
}

export function formatLegacyCommunityTelemetryReport(report) {
  return [
    "Legacy community telemetry report",
    `Total events: ${report.total}`,
    `Latest timestamp: ${report.latestTimestamp ?? "none"}`,
    `Malformed telemetry lines: ${report.malformedLineCount}`,
    ...formatMap("By event", report.byEvent),
    ...formatMap("By route", report.byRoute),
    ...formatMap("By legacy key", report.byLegacyKey),
    ...formatMap("By surface", report.bySurface),
    ...formatMap("By method", report.byMethod),
    ...formatMap("By response status", report.byStatus),
    ...formatMap("By user-agent family", report.byUserAgentFamily),
  ].join("\n");
}

function printUsage() {
  console.log(`Usage: node scripts/legacy-community-telemetry-report.mjs [log-file]

Reads log lines from a file or stdin and summarizes structured [telemetry]
events for deprecated legacy community contracts.`);
}

function readInput() {
  const filePath = process.argv.find(
    (arg, index) => index > 1 && !arg.startsWith("-")
  );
  if (filePath) {
    return readFileSync(filePath, "utf8");
  }

  if (process.stdin.isTTY) {
    return "";
  }

  return readFileSync(0, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
  } else {
    const input = readInput();
    const report = buildLegacyCommunityTelemetryReport(input);
    console.log(formatLegacyCommunityTelemetryReport(report));
  }
}
