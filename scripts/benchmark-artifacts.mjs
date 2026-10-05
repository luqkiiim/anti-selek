import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";

/** Preserve old .json arguments while frozen fixtures live at .json.gz. */
export function resolveBenchmarkArtifact(file) {
  if (existsSync(file)) return file;
  if (file.endsWith(".json") && existsSync(`${file}.gz`)) return `${file}.gz`;
  throw new Error(`Missing benchmark artifact: ${file} (or ${file}.gz)`);
}

export function hasBenchmarkArtifact(file) {
  return existsSync(file) || (file.endsWith(".json") && existsSync(`${file}.gz`));
}

export function readBenchmarkBytes(file) {
  const resolved = resolveBenchmarkArtifact(file);
  const bytes = readFileSync(resolved);
  return resolved.endsWith(".gz") ? gunzipSync(bytes) : bytes;
}

export function readBenchmarkJson(file) {
  const value = JSON.parse(readBenchmarkBytes(file).toString("utf8"));
  if (value.artifactKind === "benchmark-summary") {
    throw new Error(`A compact summary cannot replace a full benchmark fixture: ${file}`);
  }
  return value;
}

export function benchmarkSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pick(value, keys) {
  return Object.fromEntries(keys.filter((key) => value?.[key] !== undefined)
    .map((key) => [key, value[key]]));
}

/** Keep counters and nested scalar metrics, excluding unbounded witness lists. */
function counters(value) {
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => !Array.isArray(item))
    .map(([key, item]) => [key, counters(item)]));
}

export function buildBenchmarkSummary(report, rawBytes) {
  if (report.validationStatus === "pending" || report.validationStatus === "failed") {
    throw new Error("Refusing to publish an unvalidated benchmark report.");
  }
  const metadata = pick(report, ["schemaVersion", "validationStatus", "sourceRevision", "sourceProvenance",
    "generatedAt", "enginePolicy", "matcherCoverageGainMetric", "targetMatches", "metric", "setup",
    "seedCount", "wideSeedCount", "seeds", "wideSeeds"]);
  const metrics = Array.isArray(report.sessions) ? {
    sessions: report.sessions.map((session) => ({
      ...pick(session, ["profile", "sessionType", "seed", "maximumMatchCountSpread"]),
      checkpoints: Object.fromEntries(Object.entries(session.checkpoints).map(([horizon, checkpoint]) => [horizon, {
        ...pick(checkpoint, ["completedMatches", "varietyCoverageScore", "partnerCoverage", "opponentCoverage",
          "courtmateCoverage", "normalizedEntropyScore", "relationshipEntropyScore", "matchTypeEntropyScore",
          "assignmentRestGap", "backToBack", "completedMatchTypeCounts", "matchTypeCoverage", "matchCountSpread",
          "playerMatchCounts", "minimumPlayerMatchCount", "maximumPlayerMatchCount", "allPlayersExactlySixMatches",
          "maximumFairnessSpread", "maximumBalanceGap", "maximumObservedAvailableRestTurns"]),
        ...(checkpoint.socialHorizon321 ? { socialHorizon321: pick(checkpoint.socialHorizon321,
          ["score", "facetMean", "averageDistinctCount"]) } : {}),
        ...Object.fromEntries(["starvation", "coverageGate", "replayEnvelope", "optimizer"]
          .filter((key) => checkpoint[key] !== undefined).map((key) => [key, counters(checkpoint[key])])),
      }])),
    })),
  } : {
    // Policy comparisons are already compact: retain their aggregates and provenance.
    comparison: report,
  };
  return {
    artifactKind: "benchmark-summary",
    summaryVersion: 1,
    rawSha256: benchmarkSha256(rawBytes),
    rawBytes: rawBytes.length,
    validationStatus: report.validationStatus ?? "not-recorded-in-historical-source",
    ...metadata,
    ...metrics,
  };
}

export function writeBenchmarkSummary(input, output) {
  if (!output.endsWith(".summary.json")) throw new Error("Summary output must end in .summary.json.");
  const bytes = readBenchmarkBytes(input);
  const report = readBenchmarkJson(input);
  const text = `${JSON.stringify(buildBenchmarkSummary(report, bytes), null, 2)}\n`;
  // A summary is a review artifact, not another raw dump.
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("Summary exceeds the 1 MiB publication limit.");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, text, "utf8");
  return output;
}
