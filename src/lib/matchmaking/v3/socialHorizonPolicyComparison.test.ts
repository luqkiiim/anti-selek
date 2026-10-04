import { mkdirSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "vitest";
import type { BenchmarkReport, SocialHorizonCoverageReport } from "./socialCoverageBenchmark";
import {
  buildSocialHorizonPolicyComparison,
  formatSocialHorizonPolicyComparison,
  type NamedHorizonReport,
  type NamedLegacyReport,
} from "./socialHorizonCoverageReport";

const enabled = process.env.RUN_SOCIAL_HORIZON_POLICY_COMPARISON === "1";

function loadJson<T>(path: string, policyName: string): T {
  const absolutePath = resolve(path);
  const value = JSON.parse(readFileSync(absolutePath, "utf8")) as T & { validationStatus?: string };
  if (value.validationStatus === "pending") throw new Error(`${policyName} report is pending validation: ${absolutePath}`);
  return value;
}

function writeAtomically(path: string, text: string) {
  const absolutePath = resolve(path);
  const temporaryPath = `${absolutePath}.writing`;
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(temporaryPath, text, "utf8");
  renameSync(temporaryPath, absolutePath);
}

describe("social horizon 3:2:1 policy comparison", () => {
  it.skipIf(!enabled)("independently rescores saved completed histories and compares exact cohorts", () => {
    const inputJson = process.env.SOCIAL_HORIZON_POLICY_INPUTS;
    const outputJson = process.env.SOCIAL_HORIZON_POLICY_OUTPUT_JSON;
    const outputMarkdown = process.env.SOCIAL_HORIZON_POLICY_OUTPUT_MARKDOWN;
    if (!inputJson || !outputJson || !outputMarkdown) {
      throw new Error("The horizon comparison runner must provide input JSON and distinct output paths.");
    }
    if (resolve(outputJson) === resolve(outputMarkdown)) throw new Error("Comparison JSON and Markdown output paths must differ.");
    const inputs = JSON.parse(inputJson) as Array<{
      policyName: string;
      horizonJson: string;
      legacy400Json?: string;
    }>;
    if (!Array.isArray(inputs) || inputs.length < 5 || new Set(inputs.map((input) => input.policyName)).size !== inputs.length) {
      throw new Error("Provide at least the five unique historical/current policies in the comparison cohort.");
    }
    const horizonReports: NamedHorizonReport[] = inputs.map((input) => ({
      policyName: input.policyName,
      report: loadJson<SocialHorizonCoverageReport>(input.horizonJson, `${input.policyName} horizon`),
    }));
    const legacyReports: NamedLegacyReport[] = inputs.flatMap((input) => input.legacy400Json
      ? [{ policyName: input.policyName, report: loadJson<BenchmarkReport>(input.legacy400Json, `${input.policyName} legacy 400`) }]
      : []);
    const comparison = buildSocialHorizonPolicyComparison(horizonReports, legacyReports);
    writeAtomically(outputMarkdown, `${formatSocialHorizonPolicyComparison(comparison)}\n`);
    writeAtomically(outputJson, `${JSON.stringify({ ...comparison, validationStatus: "passed" }, null, 2)}\n`);
  }, 120_000);
});
