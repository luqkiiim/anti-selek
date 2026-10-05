import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { benchmarkSha256, hasBenchmarkArtifact, readBenchmarkJson, writeBenchmarkSummary } from "../../../../scripts/benchmark-artifacts.mjs";

describe("benchmark artifact storage", () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "anti-selek-benchmark-")); });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

  it("loads a frozen gzip fixture through its historical .json path or explicit archive path", () => {
    const input = join(directory, "history.json");
    writeFileSync(`${input}.gz`, gzipSync(JSON.stringify({ sourceRevision: "frozen" })));
    expect(hasBenchmarkArtifact(input)).toBe(true);
    expect(readBenchmarkJson(input)).toEqual({ sourceRevision: "frozen" });
    expect(readBenchmarkJson(`${input}.gz`)).toEqual(readBenchmarkJson(input));
  });

  it("uses an explicitly supplied fresh plain report when both formats exist", () => {
    const input = join(directory, "report.json");
    writeFileSync(`${input}.gz`, gzipSync(JSON.stringify({ sourceRevision: "old" })));
    writeFileSync(input, JSON.stringify({ sourceRevision: "new" }));
    expect(readBenchmarkJson(input).sourceRevision).toBe("new");
  });

  it("reports missing and damaged fixtures rather than silently omitting a policy", () => {
    const input = join(directory, "missing.json");
    expect(hasBenchmarkArtifact(input)).toBe(false);
    expect(() => readBenchmarkJson(input)).toThrow("Missing benchmark artifact");
    writeFileSync(`${input}.gz`, "broken archive");
    expect(() => readBenchmarkJson(input)).toThrow();
  });

  it("publishes KPI, rest, fairness, certification and provenance without witness payloads", () => {
    const input = join(directory, "report.json");
    const output = join(directory, "review.summary.json");
    const provenance = { commitSha: "abc", engineSourceSha256: "engine", measurementHarnessSha256: "harness" };
    const report = { validationStatus: "passed", sourceProvenance: provenance, sessions: [{
      profile: "narrow", sessionType: "SOCIAL_MIX", seed: 4729,
      completedHistory: [{ privateRawDetail: "not-in-summary" }],
      checkpoints: { "21": { completedMatches: 21, matchCountSpread: 2,
        socialHorizon321: { score: 0.81, facetMean: { courtmates: 0.82 }, players: [{ raw: "not-in-summary" }] },
        backToBack: { count: 16, eligibleAssignments: 70 }, assignmentRestGap: { max: 5, p95: 4 },
        coverageGate: { certifiedDecisions: 20, witnesses: [{ raw: "not-in-summary" }] },
      } },
    }] };
    const raw = Buffer.from(JSON.stringify(report));
    writeFileSync(input, raw);
    writeBenchmarkSummary(input, output);
    const text = readFileSync(output, "utf8");
    const summary = JSON.parse(text);
    expect(summary.sourceProvenance).toEqual(provenance);
    expect(summary.rawSha256).toBe(benchmarkSha256(raw));
    expect(summary.sessions[0].checkpoints["21"]).toEqual({
      completedMatches: 21, matchCountSpread: 2,
      socialHorizon321: { score: 0.81, facetMean: { courtmates: 0.82 } },
      backToBack: { count: 16, eligibleAssignments: 70 }, assignmentRestGap: { max: 5, p95: 4 },
      coverageGate: { certifiedDecisions: 20 },
    });
    expect(text).not.toContain("not-in-summary");
    expect(() => readBenchmarkJson(output)).toThrow("cannot replace a full benchmark fixture");
  });

  it("does not certify old artifacts whose validation status was never recorded", () => {
    const input = join(directory, "historical.json");
    const output = join(directory, "historical.summary.json");
    writeFileSync(input, JSON.stringify({ sourceRevision: "old", sessions: [] }));
    writeBenchmarkSummary(input, output);
    expect(JSON.parse(readFileSync(output, "utf8")).validationStatus).toBe("not-recorded-in-historical-source");
  });

  it("refuses pending reports, non-summary paths, and oversized publication", () => {
    const input = join(directory, "report.json");
    const output = join(directory, "report.summary.json");
    writeFileSync(input, JSON.stringify({ validationStatus: "pending" }));
    expect(() => writeBenchmarkSummary(input, output)).toThrow("unvalidated");
    expect(() => writeBenchmarkSummary(input, input)).toThrow("must end in .summary.json");
    writeFileSync(input, JSON.stringify({ groups: ["x".repeat(1024 * 1024)] }));
    expect(() => writeBenchmarkSummary(input, output)).toThrow("publication limit");
  });
});
