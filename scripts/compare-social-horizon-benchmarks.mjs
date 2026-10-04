import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const horizonDir = "benchmarks/social-horizon-321";
const oldDir = "benchmarks/social-coverage-21";
const inputs = [
  {
    policyName: "entropy-first",
    horizonJson: `${horizonDir}/baseline/social-horizon-21-baseline-legacy-gate.json`,
    legacy400Json: `${oldDir}/social-coverage-full21-entropy-first.json`,
  },
  {
    policyName: "strict-cadence",
    horizonJson: `${horizonDir}/strict/social-horizon-21-strict-legacy-gate.json`,
    legacy400Json: `${oldDir}/social-coverage-full21-strict-cadence.json`,
  },
  {
    policyName: "type-entropy-first",
    horizonJson: `${horizonDir}/type-first/social-horizon-21-type-first-legacy-gate.json`,
    legacy400Json: `${oldDir}/type-first-final/social-coverage-full21-type-entropy-first.json`,
  },
  {
    policyName: "replay-envelope-best-plus-one",
    horizonJson: `${horizonDir}/replay-envelope/social-horizon-21-replay-envelope-legacy-gate.json`,
    legacy400Json: `${oldDir}/replay-envelope/social-coverage-full21-replay-envelope.json`,
  },
  {
    policyName: "coverage-gated-legacy-metric",
    horizonJson: `${horizonDir}/current/social-horizon-21-current-legacy-gate.json`,
    legacy400Json: `${oldDir}/coverage-gated/social-coverage-full21-coverage-gated.json`,
  },
];

const horizon321GatePath = valueAfter("--horizon-321-gated", null);
if (horizon321GatePath) {
  inputs.push({ policyName: "coverage-gated-horizon-321", horizonJson: horizon321GatePath });
}
for (const input of inputs) {
  if (!existsSync(path.resolve(root, input.horizonJson))) throw new Error(`Missing horizon report: ${input.horizonJson}`);
  if (input.legacy400Json && !existsSync(path.resolve(root, input.legacy400Json))) {
    throw new Error(`Missing legacy 400 report: ${input.legacy400Json}`);
  }
}

const outputDir = path.resolve(root, valueAfter("--out-dir", horizonDir));
const outputJson = path.join(outputDir, "social-horizon-policy-comparison.json");
const outputMarkdown = path.join(outputDir, "social-horizon-policy-comparison.md");
const testFile = "src/lib/matchmaking/v3/socialHorizonPolicyComparison.test.ts";
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const env = {
  ...process.env,
  RUN_SOCIAL_HORIZON_POLICY_COMPARISON: "1",
  SOCIAL_HORIZON_POLICY_INPUTS: JSON.stringify(inputs),
  SOCIAL_HORIZON_POLICY_OUTPUT_JSON: outputJson,
  SOCIAL_HORIZON_POLICY_OUTPUT_MARKDOWN: outputMarkdown,
};
const result = spawnSync(process.execPath, [vitest, "run", testFile, "--maxWorkers=1"], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
process.stdout.write(`\nSaved independently rescored comparison.\nJSON: ${outputJson}\nMarkdown: ${outputMarkdown}\n`);
