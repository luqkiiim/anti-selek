import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.resolve(arg("out") ?? `benchmarks/generated/club-play-${timestamp}/results.json`);
if (existsSync(out)) throw new Error(`Club Play benchmark output already exists at ${out}`);

const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
const result = spawnSync(process.execPath, [
  "node_modules/vitest/vitest.mjs", "run", "src/lib/matchmaking/clubPlayBenchmark.test.ts",
  "--testNamePattern=Club Play paired benchmark",
], {
  stdio: "inherit",
  env: {
    ...process.env,
    CLUB_PLAY_BENCHMARK_OUTPUT: out,
    CLUB_PLAY_BENCHMARK_REVISION: revision,
    CLUB_PLAY_BENCHMARK_DIRTY: String(dirty),
    ...(arg("cases") ? { CLUB_PLAY_BENCHMARK_CASES: arg("cases") } : {}),
    ...(arg("seeds") ? { CLUB_PLAY_BENCHMARK_SEEDS: arg("seeds") } : {}),
    ...(arg("policies") ? { CLUB_PLAY_BENCHMARK_POLICIES: arg("policies") } : {}),
  },
});
if (result.error) throw result.error;
if (existsSync(out)) console.log(`Club Play benchmark results: ${out}`);
process.exitCode = result.status ?? 1;
