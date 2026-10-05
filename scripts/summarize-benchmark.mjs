import { writeBenchmarkSummary } from "./benchmark-artifacts.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error("Usage: node scripts/summarize-benchmark.mjs <report.json[.gz]> <reviewed-name.summary.json>");
}
process.stdout.write(`Saved compact benchmark summary: ${writeBenchmarkSummary(input, output)}\n`);
