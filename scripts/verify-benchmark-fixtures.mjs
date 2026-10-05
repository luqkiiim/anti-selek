import { readFileSync } from "node:fs";
import { benchmarkSha256, readBenchmarkBytes } from "./benchmark-artifacts.mjs";

const manifest = JSON.parse(readFileSync("benchmarks/fixtures.manifest.json", "utf8"));
if (manifest.schemaVersion !== "benchmark-fixtures-v1") throw new Error("Unsupported fixture manifest.");
for (const fixture of manifest.fixtures) {
  const archive = readFileSync(fixture.archivePath);
  const raw = readBenchmarkBytes(fixture.archivePath);
  const summary = JSON.parse(readFileSync(fixture.summaryPath, "utf8"));
  if (archive.length !== fixture.archiveBytes || benchmarkSha256(archive) !== fixture.archiveSha256 ||
      raw.length !== fixture.rawBytes || benchmarkSha256(raw) !== fixture.rawSha256 ||
      benchmarkSha256(readFileSync(fixture.summaryPath)) !== fixture.summarySha256 ||
      summary.rawSha256 !== fixture.rawSha256) {
    throw new Error(`Fixture integrity failure: ${fixture.archivePath}`);
  }
}
process.stdout.write(`Verified ${manifest.fixtures.length} frozen fixtures, raw content, and compact summaries.\n`);
