import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { assertSocialCourtmatePriorityCheckpoint } from "./social-courtmate-priority-validation.mjs";

const EXPECTED_SEEDS = [1, 4729, 104729, 130363, 2097593];
const REQUIRED_HORIZONS = [21, 100];
const POLICIES = ["baseline", "candidate"];
const FACETS = ["courtmates", "partners", "opponents"];
const EXPECTED_POLICY_LABELS = {
  baseline: "production",
  candidate: "courtmate-first",
};
const RUN_MANIFEST = "social-courtmate-priority-100-run-manifest.json";
const OUTPUT_JSON = "social-courtmate-priority-100-comparison-summary.json";
const OUTPUT_MARKDOWN = "social-courtmate-priority-100-comparison-summary.md";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mean(values) {
  const present = values.filter((value) => Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function min(values) {
  return values.length ? Math.min(...values) : null;
}

function max(values) {
  return values.length ? Math.max(...values) : null;
}

function close(left, right, label) {
  assert(Number.isFinite(left) && Number.isFinite(right) &&
    Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right)), `${label}: ${left} disagrees with ${right}.`);
}

function canonicalPair(left, right) {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function parseArgs(args) {
  let inputDir = null;
  let outputDir = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--input-dir") {
      inputDir = args[++index];
      assert(inputDir, "--input-dir requires a directory.");
    } else if (arg === "--out-dir") {
      outputDir = args[++index];
      assert(outputDir, "--out-dir requires a directory.");
    } else if (!arg.startsWith("-") && inputDir === null) {
      inputDir = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { inputDir, outputDir, help: false };
}

function printUsage() {
  process.stdout.write(
    "Usage: node scripts/summarize-social-courtmate-priority.mjs <run-dir> [--out-dir <ignored-output-dir>]\n" +
    "Reads the validated 100-match baseline/candidate JSON files named by the run manifest.\n" +
    `Default manifest: ${RUN_MANIFEST}; outputs: ${OUTPUT_JSON} and ${OUTPUT_MARKDOWN}.\n`
  );
}

function safeManifestPath(runDir, relativePath) {
  assert(typeof relativePath === "string" && relativePath.length > 0, "Manifest report path is missing.");
  const resolved = path.resolve(runDir, relativePath);
  assert(resolved.startsWith(`${path.resolve(runDir)}${path.sep}`), `Manifest path escapes the run directory: ${relativePath}`);
  return resolved;
}

function validateManifest(runDir) {
  const manifestPath = path.join(runDir, RUN_MANIFEST);
  assert(existsSync(manifestPath), `Missing run manifest: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert(manifest.schemaVersion === "social-courtmate-priority-run-manifest-v1", "Unsupported run-manifest schema.");
  assert(manifest.targetMatches === 100 && manifest.targetMatches <= 100, "This summary requires a validated 100-match run (maximum allowed is 100).");
  assert(JSON.stringify(manifest.seeds) === JSON.stringify(EXPECTED_SEEDS), "Manifest seeds must match the five frozen experiment seeds in order.");
  assert(manifest.policyRuns?.length === 2, "Manifest must contain exactly baseline and candidate policy runs.");
  const runs = new Map();
  for (const row of manifest.policyRuns) {
    assert(POLICIES.includes(row.policy) && !runs.has(row.policy), `Unexpected or duplicate manifest policy: ${row.policy}`);
    assert(row.targetMatches === manifest.targetMatches, `${row.policy}: manifest target differs from the run target.`);
    assert(JSON.stringify(row.seeds) === JSON.stringify(manifest.seeds), `${row.policy}: manifest seed list differs from the run.`);
    runs.set(row.policy, row);
  }
  assert(POLICIES.every((policy) => runs.has(policy)), "Manifest must contain both baseline and candidate.");
  assert(typeof manifest.sourceRevision === "string" && manifest.sourceRevision.length > 0, "Manifest source revision is missing.");
  return { manifest, manifestPath, runs };
}

function validateReport(runDir, manifest, policyRun, policy) {
  const reportPath = safeManifestPath(runDir, policyRun.jsonPath);
  assert(existsSync(reportPath), `${policy}: missing report ${policyRun.jsonPath}`);
  assert(!existsSync(`${reportPath}.pending`) && !existsSync(`${reportPath}.writing`), `${policy}: report is still pending or being written.`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert(report.validationStatus === "passed", `${policy}: report validationStatus is not passed.`);
  assert(report.targetMatches === manifest.targetMatches && report.targetMatches <= 100, `${policy}: report target differs from the manifest or exceeds 100.`);
  assert(JSON.stringify(report.seeds) === JSON.stringify(manifest.seeds), `${policy}: report seeds differ from the manifest.`);
  assert(report.socialCourtmatePriorityPolicy === policy, `${policy}: report policy label mismatch.`);
  assert(report.enginePolicy === "current", `${policy}: report is not from the current matcher architecture.`);
  assert(report.sessionTypes?.length === 1 && report.sessionTypes[0] === "SOCIAL_MIX", `${policy}: report contains a non-Social session type.`);
  assert(report.sessions?.length === EXPECTED_SEEDS.length, `${policy}: report has an incomplete session set.`);

  const source = report.sourceProvenance;
  const manifestSource = policyRun.sourceProvenance;
  assert(source && manifestSource, `${policy}: source provenance is missing.`);
  assert(source.commitSha === manifest.sourceRevision && report.sourceRevision === manifest.sourceRevision,
    `${policy}: report revision differs from the run manifest.`);
  for (const key of ["commitSha", "workingTreeDirty", "engineSourceSha256", "measurementHarnessSha256", "targetMatches"]) {
    assert(source[key] === manifestSource[key], `${policy}: report and manifest provenance disagree on ${key}.`);
  }
  for (const key of ["engineSourceSha256", "measurementHarnessSha256"]) {
    assert(/^[a-f0-9]{64}$/.test(source[key] ?? ""), `${policy}: invalid ${key}.`);
  }
  assert(source.targetMatches === manifest.targetMatches, `${policy}: provenance target differs from the run manifest.`);
  assert(source.sessionTypes?.length === 1 && source.sessionTypes[0] === "SOCIAL_MIX", `${policy}: provenance is not Social-only.`);

  const bySeed = new Map();
  for (const session of report.sessions) {
    assert(session.profile === "narrow" && session.sessionType === "SOCIAL_MIX", `${policy}: unexpected profile/session type.`);
    assert(manifest.seeds.includes(session.seed) && !bySeed.has(session.seed), `${policy}: unexpected or duplicate seed ${session.seed}.`);
    assert(session.completedHistory?.length === manifest.targetMatches, `${policy}/${session.seed}: incomplete completed history.`);
    assert(session.completedMatchTypes?.length === manifest.targetMatches, `${policy}/${session.seed}: completed type history is incomplete.`);
    session.completedHistory.forEach((match, index) => {
      assert(match.completedMatchNumber === index + 1, `${policy}/${session.seed}: completion history is out of order at ${index + 1}.`);
      assert(match.matchType === "MIXED" || match.matchType === "OWN_SIDE", `${policy}/${session.seed}: unknown completed type at ${index + 1}.`);
    });
    assert(session.completedMatchTypes.every((type, index) => type === session.completedHistory[index].matchType),
      `${policy}/${session.seed}: type stream disagrees with completed history.`);
    for (const horizon of REQUIRED_HORIZONS) {
      const checkpoint = session.checkpoints?.[String(horizon)];
      assert(checkpoint?.completedMatches === horizon, `${policy}/${session.seed}: missing ${horizon}-match checkpoint.`);
      assertSocialCourtmatePriorityCheckpoint(checkpoint, policy, `${policy}/${session.seed}/${horizon}`);
      if (policy === "candidate") {
        assert(checkpoint.socialPriority?.policyApplied === true,
          `${policy}/${session.seed}/${horizon}: Social-priority policy flag is missing.`);
      } else {
        assert(checkpoint.socialPriority === undefined,
          `${policy}/${session.seed}/${horizon}: baseline unexpectedly carries candidate priority diagnostics.`);
      }
      close(checkpoint.courtmateCoverage, session.relationshipOpportunityCounts?.courtmates
        ? deriveMetrics(session, horizon).court.coverageFraction : NaN,
      `${policy}/${session.seed}/${horizon}: saved courtmate score`);
      close(checkpoint.completedMatchTypeCounts.MIXED + checkpoint.completedMatchTypeCounts.OWN_SIDE, horizon,
        `${policy}/${session.seed}/${horizon}: type counts`);
    }
    bySeed.set(session.seed, session);
  }
  assert(bySeed.size === EXPECTED_SEEDS.length && EXPECTED_SEEDS.every((seed) => bySeed.has(seed)), `${policy}: report seed set is incomplete.`);
  return { report, bySeed, reportPath };
}

function relationshipOpportunitySets(session) {
  const source = session.relationshipOpportunityCounts;
  const result = new Map(FACETS.map((facet) => [facet, new Map()]));
  for (const facet of FACETS) {
    for (const key of Object.keys(source?.[facet] ?? {})) {
      const [left, right] = key.split("|");
      assert(left && right && left !== right, `Malformed ${facet} opportunity key ${key}.`);
      const pair = canonicalPair(left, right);
      result.get(facet).set(pair, [left, right]);
    }
  }
  return result;
}

function createRelationshipState(roster) {
  return new Map(roster.map((userId) => [userId, {
    courtmates: new Map(),
    partners: new Map(),
    opponents: new Map(),
    types: [],
  }]));
}

function addExposure(histogram, peerId) {
  histogram.set(peerId, (histogram.get(peerId) ?? 0) + 1);
}

function buildPrefix(session, horizon, roster) {
  const history = session.completedHistory.slice(0, horizon);
  const state = createRelationshipState(roster);
  const pairCounts = Object.fromEntries(FACETS.map((facet) => [facet, new Map()]));
  const playerCourtCounts = new Map(roster.map((userId) => [userId, new Set()]));
  const typeCounts = { MIXED: 0, OWN_SIDE: 0 };
  let saturationMatch = null;
  const firstFullCourtMatch = new Map();

  for (const [index, match] of history.entries()) {
    const teams = [match.team1, match.team2];
    assert(teams.every((team) => Array.isArray(team) && team.length === 2), `Match ${index + 1} must contain two doubles teams.`);
    const ids = [...teams[0], ...teams[1]];
    assert(new Set(ids).size === 4 && ids.every((id) => state.has(id)), `Match ${index + 1} contains invalid players.`);
    typeCounts[match.matchType] += 1;
    for (const team of teams) {
      const pair = canonicalPair(team[0], team[1]);
      pairCounts.partners.set(pair, (pairCounts.partners.get(pair) ?? 0) + 1);
      addExposure(state.get(team[0]).partners, team[1]);
      addExposure(state.get(team[1]).partners, team[0]);
    }
    for (const [teamIndex, team] of teams.entries()) {
      const opponents = teams[1 - teamIndex];
      for (const userId of team) {
        for (const peerId of ids) {
          if (peerId === userId) continue;
          addExposure(state.get(userId).courtmates, peerId);
          playerCourtCounts.get(userId).add(peerId);
        }
        for (const opponentId of opponents) {
          const pair = canonicalPair(userId, opponentId);
          if (teamIndex === 0) pairCounts.opponents.set(pair, (pairCounts.opponents.get(pair) ?? 0) + 1);
          addExposure(state.get(userId).opponents, opponentId);
        }
        state.get(userId).types.push(match.matchType);
      }
    }
    const courtPairKeys = new Set();
    for (const userId of ids) for (const peerId of ids) if (peerId !== userId) courtPairKeys.add(canonicalPair(userId, peerId));
    for (const pair of courtPairKeys) pairCounts.courtmates.set(pair, (pairCounts.courtmates.get(pair) ?? 0) + 1);
    for (const userId of ids) {
      if (playerCourtCounts.get(userId).size === roster.length - 1 && !firstFullCourtMatch.has(userId)) {
        firstFullCourtMatch.set(userId, index + 1);
      }
    }
    if (saturationMatch === null && roster.every((userId) => playerCourtCounts.get(userId).size === roster.length - 1)) {
      saturationMatch = index + 1;
    }
  }

  const opportunities = relationshipOpportunitySets(session);
  const facetMetrics = Object.fromEntries(FACETS.map((facet) => {
    const perPlayer = roster.map((userId) => {
      const histogram = state.get(userId)[facet];
      const feasible = [...opportunities.get(facet).values()].flatMap(([left, right]) =>
        left === userId ? [right] : right === userId ? [left] : []);
      const counts = feasible.map((peerId) => histogram.get(peerId) ?? 0);
      const distinct = counts.filter((count) => count > 0).length;
      const total = sum(counts);
      const entropy = normalizedEntropy(counts, feasible.length);
      return { userId, distinct, feasibleCount: feasible.length, totalExposures: total, repeats: total - distinct, normalizedEntropy: entropy };
    });
    const pairExposure = pairCounts[facet];
    const distinctPairs = pairExposure.size;
    const totalExposures = sum([...pairExposure.values()]);
    const possiblePairs = opportunities.get(facet).size;
    return [facet, {
      distinctPairs,
      possiblePairs,
      coverageFraction: possiblePairs ? distinctPairs / possiblePairs : null,
      totalPairExposures: totalExposures,
      repeatedPairExposures: totalExposures - distinctPairs,
      meanDistinctPerPlayer: mean(perPlayer.map((player) => player.distinct)),
      worstDistinctPerPlayer: min(perPlayer.map((player) => player.distinct)),
      meanNormalizedEntropy: mean(perPlayer.map((player) => player.normalizedEntropy)),
      perPlayer,
    }];
  }));
  const typeCoverageByPlayer = roster.map((userId) => {
    const recent = state.get(userId).types.slice(-6);
    const coveredTypes = new Set(recent);
    const T = coveredTypes.size / 2;
    return { userId, appearancesInWindow: recent.length, distinctTypes: coveredTypes.size, T };
  });
  const court = facetMetrics.courtmates;
  return {
    completedMatches: horizon,
    typeCounts,
    court,
    relationships: { partners: facetMetrics.partners, opponents: facetMetrics.opponents },
    rollingType: {
      bothTypePlayerCount: typeCoverageByPlayer.filter((player) => player.T === 1).length,
      eligiblePlayerCount: typeCoverageByPlayer.length,
      bothTypeFraction: typeCoverageByPlayer.filter((player) => player.T === 1).length / typeCoverageByPlayer.length,
      meanT: mean(typeCoverageByPlayer.map((player) => player.T)),
      perPlayer: typeCoverageByPlayer,
    },
    fairness: fairnessMetrics(session, horizon, roster),
    rest: restMetrics(session.checkpoints[String(horizon)]),
    optimizer: optimizerMetrics(session.checkpoints[String(horizon)]),
    saturation: {
      allCourtMatesFirstCompletedMatch: saturationMatch,
      playersFullyCoveredCount: firstFullCourtMatch.size,
      firstFullCourtMatchByPlayer: Object.fromEntries([...firstFullCourtMatch].sort(([left], [right]) => left.localeCompare(right))),
      latestPlayerSaturationMatch: firstFullCourtMatch.size === roster.length ? max([...firstFullCourtMatch.values()]) : null,
    },
    globalMissingTypeStreaks: globalMissingTypeStreaks(history),
    playerMissingTypeStreaks: playerMissingTypeStreaks(state, roster),
  };
}

function normalizedEntropy(counts, opportunityCount) {
  if (opportunityCount < 2) return null;
  const total = sum(counts);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of counts) {
    if (!count) continue;
    const probability = count / total;
    entropy -= probability * Math.log(probability);
  }
  return entropy / Math.log(opportunityCount);
}

function fairnessMetrics(session, horizon, roster) {
  const checkpoint = session.checkpoints[String(horizon)];
  const matchesByPlayer = new Map(checkpoint.playerMatchCounts.map((row) => [row.userId, row.matchesPlayed]));
  assert(roster.every((userId) => matchesByPlayer.has(userId)), `Missing player match counts at ${horizon}.`);
  const values = roster.map((userId) => matchesByPlayer.get(userId));
  const histogram = {};
  for (const value of values) histogram[value] = (histogram[value] ?? 0) + 1;
  return {
    playerMatchHistogram: histogram,
    minPlayerMatches: Math.min(...values),
    maxPlayerMatches: Math.max(...values),
    spread: Math.max(...values) - Math.min(...values),
    checkpointSpread: checkpoint.matchCountSpread,
    observedMinimumFairnessSpread: checkpoint.minimumFairnessSpread,
    observedMaximumFairnessSpread: checkpoint.maximumFairnessSpread,
    optimizerProofFailures: {
      searchLimitCalls: checkpoint.optimizer.searchLimitCalls,
      fairnessCertificateFailures: checkpoint.optimizer.fairnessCertificateFailures,
      starvationCertificateFailures: checkpoint.optimizer.starvationCertificateFailures,
      balanceCertificateFailures: checkpoint.optimizer.balanceCertificateFailures,
      incompleteCounterfactualCalls: checkpoint.optimizer.incompleteCounterfactualCalls,
      candidateFairnessFailures: checkpoint.socialPriority?.fairnessCertificateFailures ?? 0,
      candidateStarvationSafetyFailures: checkpoint.socialPriority?.starvationSafetyFailures ?? 0,
      candidateUncertifiedDecisions: checkpoint.socialPriority?.objectiveUncertifiedDecisions ?? 0,
    },
  };
}

function restMetrics(checkpoint) {
  return {
    backToBack: {
      count: checkpoint.backToBack.count,
      eligibleAssignments: checkpoint.backToBack.eligibleAssignments,
      rate: checkpoint.backToBack.rate,
    },
    assignmentRestGap: checkpoint.assignmentRestGap,
    betweenOwnCompletionEventGap: checkpoint.betweenOwnCompletionEventGap,
    starvationInterventions: {
      overdueDecisions: checkpoint.starvation.decisionsWithOverdueAvailable,
      overduePlayerEvents: checkpoint.starvation.overduePlayerEvents,
      changedPlayerSetDecisions: checkpoint.starvation.materiallyChangedPlayerSet,
      certifiedCounterfactualDecisions: checkpoint.starvation.certifiedCounterfactualDecisions,
      uncertifiedCounterfactualDecisions: checkpoint.starvation.uncertifiedCounterfactualDecisions,
      rateWhenOverdue: checkpoint.starvation.rateWhenOverdue,
    },
  };
}

function optimizerMetrics(checkpoint) {
  const optimizer = checkpoint.optimizer;
  return {
    callsStarted: optimizer.callsStarted,
    callsCompleted: optimizer.callsCompleted,
    ordinaryProductionCalls: optimizer.ordinaryProductionCalls,
    ordinaryProductionWallMs: optimizer.ordinaryProductionWallMs,
    ordinaryProductionMsPerCall: optimizer.ordinaryProductionCalls
      ? optimizer.ordinaryProductionWallMs / optimizer.ordinaryProductionCalls
      : null,
    counterfactualWrapperCalls: optimizer.counterfactualWrapperCalls,
    counterfactualWrapperWallMs: optimizer.counterfactualWrapperWallMs,
    counterfactualWrapperMsPerCall: optimizer.counterfactualWrapperCalls
      ? optimizer.counterfactualWrapperWallMs / optimizer.counterfactualWrapperCalls
      : null,
    searchLimitCalls: optimizer.searchLimitCalls,
  };
}

function globalMissingTypeStreaks(history) {
  return Object.fromEntries(["MIXED", "OWN_SIDE"].map((type) => {
    let current = 0;
    let longest = 0;
    for (const match of history) {
      current = match.matchType === type ? 0 : current + 1;
      longest = Math.max(longest, current);
    }
    return [type, { longestAbsentCompletionEvents: longest, trailingAbsentCompletionEvents: current }];
  }));
}

function playerMissingTypeStreaks(state, roster) {
  const perPlayer = roster.map((userId) => {
    const appearances = state.get(userId).types;
    const absent = Object.fromEntries(["MIXED", "OWN_SIDE"].map((type) => {
      let current = 0;
      let longest = 0;
      for (const observed of appearances) {
        current = observed === type ? 0 : current + 1;
        longest = Math.max(longest, current);
      }
      return [type, { longestAbsentOwnAppearances: longest, trailingAbsentOwnAppearances: current }];
    }));
    return { userId, byType: absent };
  });
  const aggregateByType = Object.fromEntries(["MIXED", "OWN_SIDE"].map((type) => [type, {
    longestAbsentOwnAppearances: max(perPlayer.map((player) => player.byType[type].longestAbsentOwnAppearances)),
    worstTrailingAbsentOwnAppearances: max(perPlayer.map((player) => player.byType[type].trailingAbsentOwnAppearances)),
  }]));
  return { aggregateByType, perPlayer };
}

function finalWindowMetrics(session, windowSize, roster) {
  const start = Math.max(0, session.completedHistory.length - windowSize);
  const slice = session.completedHistory.slice(start);
  const state = createRelationshipState(roster);
  const pairCounts = Object.fromEntries(FACETS.map((facet) => [facet, new Map()]));
  const typeCounts = { MIXED: 0, OWN_SIDE: 0 };
  for (const match of slice) {
    typeCounts[match.matchType] += 1;
    const teams = [match.team1, match.team2];
    const ids = [...teams[0], ...teams[1]];
    for (const team of teams) {
      const pair = canonicalPair(team[0], team[1]);
      pairCounts.partners.set(pair, (pairCounts.partners.get(pair) ?? 0) + 1);
      addExposure(state.get(team[0]).partners, team[1]);
      addExposure(state.get(team[1]).partners, team[0]);
    }
    for (const [teamIndex, team] of teams.entries()) {
      const opponents = teams[1 - teamIndex];
      for (const userId of team) {
        for (const peerId of ids) if (peerId !== userId) addExposure(state.get(userId).courtmates, peerId);
        for (const opponentId of opponents) {
          const pair = canonicalPair(userId, opponentId);
          if (teamIndex === 0) pairCounts.opponents.set(pair, (pairCounts.opponents.get(pair) ?? 0) + 1);
          addExposure(state.get(userId).opponents, opponentId);
        }
      }
    }
    for (const userId of ids) {
      for (const peerId of ids) if (peerId !== userId) {
        const pair = canonicalPair(userId, peerId);
        pairCounts.courtmates.set(pair, (pairCounts.courtmates.get(pair) ?? 0) + 1);
      }
    }
  }
  const opportunities = relationshipOpportunitySets(session);
  const breadth = Object.fromEntries(FACETS.map((facet) => {
    const perPlayer = roster.map((userId) => {
      const histogram = state.get(userId)[facet];
      const peers = [...opportunities.get(facet).values()].flatMap(([left, right]) =>
        left === userId ? [right] : right === userId ? [left] : []);
      const distinct = peers.filter((peer) => (histogram.get(peer) ?? 0) > 0).length;
      return { userId, distinct, possible: peers.length };
    });
    const uniquePairs = pairCounts[facet].size;
    const possiblePairs = opportunities.get(facet).size;
    return [facet, {
      uniquePairs,
      possiblePairs,
      coverageFraction: possiblePairs ? uniquePairs / possiblePairs : null,
      meanDistinctPerPlayer: mean(perPlayer.map((row) => row.distinct)),
      worstDistinctPerPlayer: min(perPlayer.map((row) => row.distinct)),
      perPlayer,
    }];
  }));
  return { windowSize: Math.min(windowSize, session.completedHistory.length), typeCounts, breadth };
}

function deriveMetrics(session, horizon) {
  const checkpoint = session.checkpoints[String(horizon)];
  const roster = checkpoint.playerMatchCounts.map((player) => player.userId).sort();
  assert(roster.length === 14 && new Set(roster).size === 14, `Seed ${session.seed}/${horizon}: expected the fixed 14-player roster.`);
  const metrics = buildPrefix(session, horizon, roster);
  close(metrics.court.coverageFraction, checkpoint.courtmateCoverage, `seed ${session.seed}/${horizon} courtmate coverage`);
  close(metrics.relationships.partners.coverageFraction, checkpoint.partnerCoverage, `seed ${session.seed}/${horizon} partner coverage`);
  close(metrics.relationships.opponents.coverageFraction, checkpoint.opponentCoverage, `seed ${session.seed}/${horizon} opponent coverage`);
  close(metrics.rollingType.meanT, checkpoint.socialVariety3211?.meanT, `seed ${session.seed}/${horizon} rolling meanT`);
  close(metrics.rollingType.bothTypeFraction, checkpoint.socialVariety3211?.fullTypeCoverageFraction,
    `seed ${session.seed}/${horizon} rolling both-type share`);
  assert(metrics.typeCounts.MIXED === checkpoint.completedMatchTypeCounts.MIXED &&
    metrics.typeCounts.OWN_SIDE === checkpoint.completedMatchTypeCounts.OWN_SIDE,
  `Seed ${session.seed}/${horizon}: completed match-type counts do not match the checkpoint.`);
  return metrics;
}

function meanRollingTAt(session, horizon, roster) {
  const appearances = new Map(roster.map((userId) => [userId, []]));
  for (const match of session.completedHistory.slice(0, horizon)) {
    for (const userId of [...match.team1, ...match.team2]) appearances.get(userId)?.push(match.matchType);
  }
  return mean(roster.map((userId) => new Set(appearances.get(userId).slice(-6)).size / 2));
}

function summarizeHorizon(perSeed) {
  const rows = Object.values(perSeed);
  const cRows = rows.map((row) => row.court);
  const typeRows = rows.map((row) => row.rollingType);
  const sumTypeCounts = (values) => ({ MIXED: sum(values.map((value) => value.MIXED)), OWN_SIDE: sum(values.map((value) => value.OWN_SIDE)) });
  const restRows = rows.map((row) => row.rest);
  const fairnessRows = rows.map((row) => row.fairness);
  const proofFields = Object.keys(fairnessRows[0].optimizerProofFailures);
  const b2bCount = sum(restRows.map((row) => row.backToBack.count));
  const b2bEligible = sum(restRows.map((row) => row.backToBack.eligibleAssignments));
  const optimizerRows = rows.map((row) => row.optimizer);
  const aggregateMetric = (facet) => {
    const values = rows.map((row) => row.relationships[facet]);
    return {
      meanDistinctPairs: mean(values.map((value) => value.distinctPairs)),
      pooledDistinctPairs: sum(values.map((value) => value.distinctPairs)),
      possiblePairsPerSeed: values[0].possiblePairs,
      meanCoverageFraction: mean(values.map((value) => value.coverageFraction)),
      meanDistinctPerPlayer: mean(values.map((value) => value.meanDistinctPerPlayer)),
      meanNormalizedEntropy: mean(values.map((value) => value.meanNormalizedEntropy)),
      meanRepeatedPairExposures: mean(values.map((value) => value.repeatedPairExposures)),
      meanTotalPairExposures: mean(values.map((value) => value.totalPairExposures)),
    };
  };
  const perSeedSummary = Object.fromEntries(Object.entries(perSeed).map(([seed, row]) => [seed, ({
    court: {
      meanDistinctPerPlayer: row.court.meanDistinctPerPlayer,
      meanCoverageFraction: row.court.coverageFraction,
      uniqueUndirectedPairs: row.court.distinctPairs,
      worstPlayerDistinct: row.court.worstDistinctPerPlayer,
      fullCoveragePlayerCount: row.court.perPlayer.filter((player) => player.distinct === player.feasibleCount).length,
    },
    rollingType: row.rollingType,
    matchTypeCounts: row.typeCounts,
    fairness: row.fairness,
    rest: row.rest,
    relationships: Object.fromEntries(["partners", "opponents"].map((facet) => [facet, {
      distinctPairs: row.relationships[facet].distinctPairs,
      possiblePairs: row.relationships[facet].possiblePairs,
      meanDistinctPerPlayer: row.relationships[facet].meanDistinctPerPlayer,
      meanNormalizedEntropy: row.relationships[facet].meanNormalizedEntropy,
      repeatedPairExposures: row.relationships[facet].repeatedPairExposures,
    }])),
    optimizer: row.optimizer,
  })]));
  return {
    court: {
      meanPerPlayerDistinct: mean(cRows.flatMap((row) => row.perPlayer.map((player) => player.distinct))),
      meanPerPlayerCoverageFraction: mean(cRows.flatMap((row) => row.perPlayer.map((player) => player.distinct / player.feasibleCount))),
      meanUniqueUndirectedPairs: mean(cRows.map((row) => row.distinctPairs)),
      meanUniqueUndirectedPairFractionOf91: mean(cRows.map((row) => row.distinctPairs / 91)),
      pooledUniqueUndirectedPairsAcrossFiveRuns: sum(cRows.map((row) => row.distinctPairs)),
      pooledPairOpportunitiesAcrossFiveRuns: 5 * 91,
      worstPlayerDistinct: min(cRows.flatMap((row) => row.perPlayer.map((player) => player.distinct))),
      fullCoveragePlayerCountAcrossFiveRuns: sum(cRows.map((row) => row.perPlayer.filter((player) => player.distinct === player.feasibleCount).length)),
      fullCoveragePlayersPerSeed: Object.fromEntries(Object.entries(perSeed).map(([seed, row]) => [seed,
        row.court.perPlayer.filter((player) => player.distinct === player.feasibleCount).length])),
    },
    rollingType: {
      meanBothTypeFraction: mean(typeRows.map((row) => row.bothTypeFraction)),
      pooledBothTypeFraction: sum(typeRows.map((row) => row.bothTypePlayerCount)) /
        sum(typeRows.map((row) => row.eligiblePlayerCount)),
      meanT: mean(typeRows.map((row) => row.meanT)),
      meanTPerSeed: Object.fromEntries(Object.entries(perSeed).map(([seed, row]) => [seed, row.rollingType.meanT])),
    },
    matchTypeCounts: {
      totalAcrossSeeds: sumTypeCounts(rows.map((row) => row.typeCounts)),
      meanPerSeed: {
        MIXED: mean(rows.map((row) => row.typeCounts.MIXED)),
        OWN_SIDE: mean(rows.map((row) => row.typeCounts.OWN_SIDE)),
      },
    },
    fairness: {
      playerMatchHistogramAcrossAllSeedPlayers: rows.flatMap((row) => Object.entries(row.fairness.playerMatchHistogram)
        .flatMap(([matches, count]) => Array.from({ length: count }, () => Number(matches))))
        .reduce((histogram, matches) => ({ ...histogram, [matches]: (histogram[matches] ?? 0) + 1 }), {}),
      matchCountSpreadMeanAcrossSeeds: mean(fairnessRows.map((row) => row.spread)),
      matchCountSpreadMaximumAcrossSeeds: max(fairnessRows.map((row) => row.spread)),
      observedMaximumFairnessSpreadMaximumAcrossSeeds: max(fairnessRows.map((row) => row.observedMaximumFairnessSpread)),
      proofFailureTotals: Object.fromEntries(proofFields.map((field) => [field,
        sum(fairnessRows.map((row) => row.optimizerProofFailures[field]))])),
      perSeed: Object.fromEntries(Object.entries(perSeed).map(([seed, row]) => [seed, row.fairness])),
    },
    rest: {
      backToBack: {
        pooledCount: b2bCount,
        pooledEligibleAssignments: b2bEligible,
        pooledRate: b2bEligible ? b2bCount / b2bEligible : null,
        meanSeedRate: mean(restRows.map((row) => row.backToBack.eligibleAssignments ? row.backToBack.count / row.backToBack.eligibleAssignments : null)),
      },
      assignmentRestGap: summarizeGapMetric(restRows.map((row) => row.assignmentRestGap)),
      betweenOwnCompletionEventGap: summarizeGapMetric(restRows.map((row) => row.betweenOwnCompletionEventGap)),
      starvationInterventions: summarizeInterventions(restRows.map((row) => row.starvationInterventions)),
      perSeed: Object.fromEntries(Object.entries(perSeed).map(([seed, row]) => [seed, row.rest])),
    },
    relationships: {
      partners: aggregateMetric("partners"),
      opponents: aggregateMetric("opponents"),
    },
    optimizer: {
      callsStartedTotal: sum(optimizerRows.map((row) => row.callsStarted)),
      callsStartedMeanPerSeed: mean(optimizerRows.map((row) => row.callsStarted)),
      ordinaryProductionCallsTotal: sum(optimizerRows.map((row) => row.ordinaryProductionCalls)),
      ordinaryProductionWallMsTotal: sum(optimizerRows.map((row) => row.ordinaryProductionWallMs)),
      ordinaryProductionWallMsMeanPerSeed: mean(optimizerRows.map((row) => row.ordinaryProductionWallMs)),
      ordinaryProductionMsPerCallPooled: sum(optimizerRows.map((row) => row.ordinaryProductionWallMs)) /
        Math.max(1, sum(optimizerRows.map((row) => row.ordinaryProductionCalls))),
      counterfactualWrapperCallsTotal: sum(optimizerRows.map((row) => row.counterfactualWrapperCalls)),
      counterfactualWrapperWallMsTotal: sum(optimizerRows.map((row) => row.counterfactualWrapperWallMs)),
      counterfactualWrapperWallMsMeanPerSeed: mean(optimizerRows.map((row) => row.counterfactualWrapperWallMs)),
      counterfactualWrapperMsPerCallPooled: sum(optimizerRows.map((row) => row.counterfactualWrapperWallMs)) /
        Math.max(1, sum(optimizerRows.map((row) => row.counterfactualWrapperCalls))),
      searchLimitCallsTotal: sum(optimizerRows.map((row) => row.searchLimitCalls)),
      perSeed: Object.fromEntries(Object.entries(perSeed).map(([seed, row]) => [seed, row.optimizer])),
    },
    perSeed: perSeedSummary,
  };
}

function summarizeGapMetric(rows) {
  return {
    meanOfSeedMeans: mean(rows.map((row) => row.mean)),
    meanOfSeedP95s: mean(rows.map((row) => row.p95)),
    worstSeedP95: max(rows.map((row) => row.p95)),
    maximumAcrossSeeds: max(rows.map((row) => row.max)),
    totalObservationCount: sum(rows.map((row) => row.count)),
    perSeed: rows,
  };
}

function summarizeInterventions(rows) {
  const keys = ["overdueDecisions", "overduePlayerEvents", "changedPlayerSetDecisions", "certifiedCounterfactualDecisions", "uncertifiedCounterfactualDecisions"];
  const counts = Object.fromEntries(keys.map((key) => [key, sum(rows.map((row) => row[key]))]));
  const decisionCohort = counts.certifiedCounterfactualDecisions + counts.uncertifiedCounterfactualDecisions;
  return {
    ...counts,
    pooledChangedSetRateWhenOverdue: counts.certifiedCounterfactualDecisions
      ? counts.changedPlayerSetDecisions / counts.certifiedCounterfactualDecisions
      : null,
    meanSeedChangedSetRateWhenOverdue: mean(rows.map((row) => row.rateWhenOverdue)),
    totalCertifiedInterventionCohort: decisionCohort,
    perSeed: rows,
  };
}

function summarizeLongRun(perSeed) {
  const finalWindows = Object.fromEntries(Object.entries(perSeed).map(([policy, rows]) => [policy,
    Object.fromEntries(Object.entries(rows).map(([seed, row]) => [seed, ({
      meanT76To100: row.meanT76To100,
      all91CourtPairsSaturationMatch: row.saturation.allCourtMatesFirstCompletedMatch,
      final25TypeCounts: row.final25.typeCounts,
      final50TypeCounts: row.final50.typeCounts,
      final50Breadth: Object.fromEntries(FACETS.map((facet) => [facet, {
        uniquePairs: row.final50.breadth[facet].uniquePairs,
        possiblePairs: row.final50.breadth[facet].possiblePairs,
        coverageFraction: row.final50.breadth[facet].coverageFraction,
        meanDistinctPerPlayer: row.final50.breadth[facet].meanDistinctPerPlayer,
      }])),
      globalMissingTypeStreaks: row.globalMissingTypeStreaks,
      playerMissingTypeStreaks: row.playerMissingTypeStreaks.aggregateByType,
    })]))]));
  const aggregate = {};
  for (const policy of POLICIES) {
    const rows = Object.values(perSeed[policy]);
    aggregate[policy] = {
      meanT76To100AcrossSeedTimePoints: mean(rows.map((row) => row.meanT76To100)),
      all91CourtPairsSaturationMatches: Object.fromEntries(rows.map((row) => [row.seed, row.saturation.allCourtMatesFirstCompletedMatch])),
      saturatedBy100SeedCount: rows.filter((row) => row.saturation.allCourtMatesFirstCompletedMatch !== null).length,
      meanFinal25MixedMatches: mean(rows.map((row) => row.final25.typeCounts.MIXED)),
      meanFinal25OwnSideMatches: mean(rows.map((row) => row.final25.typeCounts.OWN_SIDE)),
      meanFinal50MixedMatches: mean(rows.map((row) => row.final50.typeCounts.MIXED)),
      meanFinal50OwnSideMatches: mean(rows.map((row) => row.final50.typeCounts.OWN_SIDE)),
      meanFinal50CourtPairs: mean(rows.map((row) => row.final50.breadth.courtmates.uniquePairs)),
      meanFinal50PartnerPairs: mean(rows.map((row) => row.final50.breadth.partners.uniquePairs)),
      meanFinal50OpponentPairs: mean(rows.map((row) => row.final50.breadth.opponents.uniquePairs)),
      maximumGlobalMissingTypeRun: Object.fromEntries(["MIXED", "OWN_SIDE"].map((type) => [type,
        max(rows.map((row) => row.globalMissingTypeStreaks[type].longestAbsentCompletionEvents))])),
      maximumTrailingGlobalMissingTypeRun: Object.fromEntries(["MIXED", "OWN_SIDE"].map((type) => [type,
        max(rows.map((row) => row.globalMissingTypeStreaks[type].trailingAbsentCompletionEvents))])),
      maximumPlayerMissingTypeRun: Object.fromEntries(["MIXED", "OWN_SIDE"].map((type) => [type,
        max(rows.map((row) => row.playerMissingTypeStreaks.aggregateByType[type].longestAbsentOwnAppearances))])),
      maximumTrailingPlayerMissingTypeRun: Object.fromEntries(["MIXED", "OWN_SIDE"].map((type) => [type,
        max(rows.map((row) => row.playerMissingTypeStreaks.aggregateByType[type].worstTrailingAbsentOwnAppearances))])),
    };
  }
  return { perSeed: finalWindows, aggregate };
}

function compareSeedMetrics(baselineRows, candidateRows, getValue, direction = "higher") {
  let wins = 0;
  let ties = 0;
  let losses = 0;
  const bySeed = {};
  for (const seed of EXPECTED_SEEDS) {
    const baseline = getValue(baselineRows[seed]);
    const candidate = getValue(candidateRows[seed]);
    const delta = candidate - baseline;
    const comparison = Math.abs(delta) <= 1e-12 ? 0 : direction === "higher" ? Math.sign(delta) : -Math.sign(delta);
    if (comparison > 0) wins += 1;
    else if (comparison < 0) losses += 1;
    else ties += 1;
    bySeed[seed] = { baseline, candidate, candidateMinusBaseline: delta };
  }
  return { wins, ties, losses, bySeed };
}

function pairedComparisons(derived) {
  const comparisons = {};
  for (const horizon of REQUIRED_HORIZONS) {
    const baseline = derived.baseline[horizon];
    const candidate = derived.candidate[horizon];
    comparisons[horizon] = {
      primaryCourtPairBreadth: compareSeedMetrics(baseline, candidate, (row) => row.court.distinctPairs),
      rollingBothTypeShare: compareSeedMetrics(baseline, candidate, (row) => row.rollingType.bothTypeFraction),
      meanT: compareSeedMetrics(baseline, candidate, (row) => row.rollingType.meanT),
      partnerPairBreadth: compareSeedMetrics(baseline, candidate, (row) => row.relationships.partners.distinctPairs),
      opponentPairBreadth: compareSeedMetrics(baseline, candidate, (row) => row.relationships.opponents.distinctPairs),
      backToBackRate: compareSeedMetrics(baseline, candidate,
        (row) => row.rest.backToBack.eligibleAssignments ? row.rest.backToBack.count / row.rest.backToBack.eligibleAssignments : 0, "lower"),
      maximumFairnessSpread: compareSeedMetrics(baseline, candidate, (row) => row.fairness.observedMaximumFairnessSpread, "lower"),
    };
  }
  return comparisons;
}

function deriveReport(loaded) {
  const derived = { baseline: {}, candidate: {} };
  const longRun = { baseline: {}, candidate: {} };
  const rosterIdsBySeed = new Map();
  for (const policy of POLICIES) {
    for (const seed of EXPECTED_SEEDS) {
      const session = loaded[policy].bySeed.get(seed);
      const roster = session.checkpoints["100"].playerMatchCounts.map((row) => row.userId).sort();
      const priorRoster = rosterIdsBySeed.get(seed);
      if (priorRoster) assert(JSON.stringify(priorRoster) === JSON.stringify(roster), `${policy}/${seed}: roster differs across policies.`);
      else rosterIdsBySeed.set(seed, roster);
      derived[policy][seed] = {};
      for (const horizon of REQUIRED_HORIZONS) derived[policy][seed][horizon] = deriveMetrics(session, horizon);
      const prefixRows = Array.from({ length: 25 }, (_value, offset) => meanRollingTAt(session, 76 + offset, roster));
      longRun[policy][seed] = {
        seed,
        meanT76To100: mean(prefixRows),
        final25: finalWindowMetrics(session, 25, roster),
        final50: finalWindowMetrics(session, 50, roster),
        saturation: derived[policy][seed][100].saturation,
        globalMissingTypeStreaks: derived[policy][seed][100].globalMissingTypeStreaks,
        playerMissingTypeStreaks: derived[policy][seed][100].playerMissingTypeStreaks,
      };
    }
  }
  const horizonSummaries = Object.fromEntries(REQUIRED_HORIZONS.map((horizon) => [String(horizon),
    Object.fromEntries(POLICIES.map((policy) => [policy, summarizeHorizon(
      Object.fromEntries(EXPECTED_SEEDS.map((seed) => [seed, derived[policy][seed][horizon]]))
    )]))]));
  return {
    derived,
    horizons: horizonSummaries,
    longRun: summarizeLongRun(longRun),
    pairedSeedWinTieLoss: pairedComparisons({
      baseline: Object.fromEntries(REQUIRED_HORIZONS.map((horizon) => [horizon,
        Object.fromEntries(EXPECTED_SEEDS.map((seed) => [seed, derived.baseline[seed][horizon]]))])),
      candidate: Object.fromEntries(REQUIRED_HORIZONS.map((horizon) => [horizon,
        Object.fromEntries(EXPECTED_SEEDS.map((seed) => [seed, derived.candidate[seed][horizon]]))])),
    }),
    longRunPerSeed: longRun,
  };
}

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function pct(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "n/a";
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderMarkdown(summary) {
  const lines = [
    "# Social courtmate-priority comparison",
    "",
    `Validated five-seed run at ${summary.run.targetMatches} completed matches per seed. Source revision ${summary.run.sourceRevision}; engine SHA-256 ${summary.run.engineSourceSha256}; measurement SHA-256 ${summary.run.measurementHarnessSha256}.`,
    "",
    "The comparison keeps metrics separate. It does not calculate a combined KPI and does not apply the previous 3/2/1/1 score as a decision rule.",
    "",
    "## 21 completed matches (primary)",
    "",
  ];
  for (const horizon of REQUIRED_HORIZONS) {
    if (horizon === 100) lines.push("## 100 completed matches (secondary)", "");
    const rows = POLICIES.map((policy) => {
      const data = summary.horizons[String(horizon)][policy];
      return [
        policy,
        `${fmt(data.court.meanPerPlayerDistinct, 1)} / ${fmt(data.court.meanUniqueUndirectedPairs, 1)}/91 (${pct(data.court.meanUniqueUndirectedPairFractionOf91)})`,
        `${data.court.worstPlayerDistinct}/13`,
        `${data.court.fullCoveragePlayerCountAcrossFiveRuns}/70`,
        `${pct(data.rollingType.meanBothTypeFraction)} / ${fmt(data.rollingType.meanT)}`,
        `${data.matchTypeCounts.totalAcrossSeeds.MIXED} / ${data.matchTypeCounts.totalAcrossSeeds.OWN_SIDE}`,
        `${pct(data.rest.backToBack.pooledRate)} / ${pct(data.rest.backToBack.meanSeedRate)}`,
        `${fmt(data.rest.assignmentRestGap.meanOfSeedP95s, 1)} / ${data.rest.assignmentRestGap.maximumAcrossSeeds}`,
        `${fmt(data.rest.betweenOwnCompletionEventGap.meanOfSeedP95s, 1)} / ${data.rest.betweenOwnCompletionEventGap.maximumAcrossSeeds}`,
        `${data.rest.starvationInterventions.changedPlayerSetDecisions}/${data.rest.starvationInterventions.certifiedCounterfactualDecisions}`,
      ];
    });
    lines.push(markdownTable([
      "Policy", "C avg / court pairs", "Worst player C", "Full C players", "Both T / mean T", "MIXED / OWN_SIDE",
      "B2B pooled / seed mean", "Assignment gap p95 mean / max", "Event gap p95 mean / max", "Overdue set changes / certified",
    ], rows), "");
    lines.push("Per-seed match-count histograms and full spread details are in the JSON output.", "");
  }

  lines.push("## Pairwise seed outcomes", "");
  lines.push(markdownTable(["Horizon", "Metric", "Candidate wins", "Ties", "Losses"], REQUIRED_HORIZONS.flatMap((horizon) => {
    const metrics = summary.pairedSeedWinTieLoss[horizon];
    return [
      [horizon, "Unique courtmate pairs (primary comparison)", metrics.primaryCourtPairBreadth.wins, metrics.primaryCourtPairBreadth.ties, metrics.primaryCourtPairBreadth.losses],
      [horizon, "Both types in each player's latest six", metrics.rollingBothTypeShare.wins, metrics.rollingBothTypeShare.ties, metrics.rollingBothTypeShare.losses],
      [horizon, "Mean rolling T", metrics.meanT.wins, metrics.meanT.ties, metrics.meanT.losses],
      [horizon, "Partner pair breadth", metrics.partnerPairBreadth.wins, metrics.partnerPairBreadth.ties, metrics.partnerPairBreadth.losses],
      [horizon, "Opponent pair breadth", metrics.opponentPairBreadth.wins, metrics.opponentPairBreadth.ties, metrics.opponentPairBreadth.losses],
      [horizon, "Back-to-back rate (lower is better)", metrics.backToBackRate.wins, metrics.backToBackRate.ties, metrics.backToBackRate.losses],
      [horizon, "Maximum fairness spread (lower is better)", metrics.maximumFairnessSpread.wins, metrics.maximumFairnessSpread.ties, metrics.maximumFairnessSpread.losses],
    ];
  })), "");

  lines.push("## Final windows and type streaks", "");
  lines.push(markdownTable(["Policy", "Seed", "All-91 C saturation event", "Mean T, matches 76–100", "Final 25 M/O", "Final 50 M/O", "Final 50 C/P/O pairs", "Longest global missing M/O run", "Trailing global missing M/O run", "Longest player missing M/O appearances", "Trailing player missing M/O appearances"],
    POLICIES.flatMap((policy) => EXPECTED_SEEDS.map((seed) => {
      const row = summary.longRun.perSeed[policy][seed];
      const streak = row.globalMissingTypeStreaks;
      const player = row.playerMissingTypeStreaks;
      return [policy, seed, row.all91CourtPairsSaturationMatch ?? "not by 100", fmt(row.meanT76To100),
        `${row.final25TypeCounts.MIXED}/${row.final25TypeCounts.OWN_SIDE}`,
        `${row.final50TypeCounts.MIXED}/${row.final50TypeCounts.OWN_SIDE}`,
        `${row.final50Breadth.courtmates.uniquePairs}/${row.final50Breadth.partners.uniquePairs}/${row.final50Breadth.opponents.uniquePairs}`,
        `${streak.MIXED.longestAbsentCompletionEvents}/${streak.OWN_SIDE.longestAbsentCompletionEvents}`,
        `${streak.MIXED.trailingAbsentCompletionEvents}/${streak.OWN_SIDE.trailingAbsentCompletionEvents}`,
        `${player.MIXED.longestAbsentOwnAppearances}/${player.OWN_SIDE.longestAbsentOwnAppearances}`,
        `${player.MIXED.worstTrailingAbsentOwnAppearances}/${player.OWN_SIDE.worstTrailingAbsentOwnAppearances}`];
    }))), "");

  lines.push("## Partner/opponent breadth and optimizer cost", "");
  lines.push(markdownTable(["Horizon", "Policy", "Partner distinct pairs / possible", "Partner entropy", "Partner repeats", "Opponent distinct pairs / possible", "Opponent entropy", "Opponent repeats", "Calls started", "Ordinary calls / ms", "Ordinary ms/call", "Wrapper audits / ms"],
    REQUIRED_HORIZONS.flatMap((horizon) => POLICIES.map((policy) => {
      const row = summary.horizons[String(horizon)][policy];
      return [horizon, policy,
        `${fmt(row.relationships.partners.meanDistinctPairs, 1)}/${row.relationships.partners.possiblePairsPerSeed}`,
        fmt(row.relationships.partners.meanNormalizedEntropy),
        fmt(row.relationships.partners.meanRepeatedPairExposures, 1),
        `${fmt(row.relationships.opponents.meanDistinctPairs, 1)}/${row.relationships.opponents.possiblePairsPerSeed}`,
        fmt(row.relationships.opponents.meanNormalizedEntropy),
        fmt(row.relationships.opponents.meanRepeatedPairExposures, 1),
        row.optimizer.callsStartedTotal,
        `${row.optimizer.ordinaryProductionCallsTotal}/${fmt(row.optimizer.ordinaryProductionWallMsTotal, 1)}`,
        fmt(row.optimizer.ordinaryProductionMsPerCallPooled),
        `${row.optimizer.counterfactualWrapperCallsTotal}/${fmt(row.optimizer.counterfactualWrapperWallMsTotal, 1)}`];
    }))),
    "",
    "Production assignment cost uses `ordinaryProductionWallMs` divided by ordinary production calls. `counterfactualWrapperWallMs` is reported separately; it includes the wrapper's production selection and no-starvation diagnostic and is excluded from the ordinary production cohort.",
    "",
    "## Definitions and aggregation",
    "",
    "- Courtmate breadth is derived from completed match history. The fixed 14-player roster has 91 possible undirected courtmate pairs. C average is the mean distinct courtmates per player; worst C is the minimum player count; full C counts players who met all 13 peers.",
    "- Rolling T is each player's fraction of MIXED and OWN_SIDE types present in their latest six completed appearances. `Both T` is the share with T = 1; `mean T` averages all 14 players. The 76–100 value averages the 25 prefix checkpoints from 76 through 100.",
    "- Back-to-back is reported as pooled count / eligible assignments and as the unweighted mean of the five seed rates. Gap p95 is the unweighted mean of the five per-seed p95s; max is the worst seed maximum. Event gap counts completed events between a player's own completed matches.",
    "- Partner/opponent pair breadth and repeats count undirected completed exposure events. Entropy is the mean per-player Shannon entropy normalized by that player's structural opportunity count. Final-50 breadth uses only the last 50 matches.",
    "- Saturation is the first completed match at which every player has met all 13 courtmates. Global missing-type streaks count consecutive matches without a type; player streaks count consecutive own appearances without that type.",
    "- Paired wins, ties, and losses compare each listed metric separately by seed. No weighted KPI, score threshold, or legacy 3/2/1/1 rule is used.",
    "- Fairness histograms count players by completed appearances at the checkpoint. Certificate failures and search limits are reported as recorded in checkpoint counters.",
    ""
  );
  return lines.join("\n");
}

function writeExclusive(file, contents) {
  assert(!existsSync(file), `Refusing to overwrite existing output: ${file}`);
  writeFileSync(file, contents, { encoding: "utf8", flag: "wx" });
}

export function summarizeSocialCourtmatePriorityRun(runDirInput, outputDirInput = runDirInput) {
  const runDir = path.resolve(runDirInput);
  const outputDir = path.resolve(outputDirInput);
  const generatedDir = path.resolve("benchmarks/generated");
  assert(runDir.startsWith(`${generatedDir}${path.sep}`), "Input run directory must be under ignored benchmarks/generated/.");
  assert(outputDir.startsWith(`${generatedDir}${path.sep}`), "Summary outputs must be under ignored benchmarks/generated/.");
  const { manifest, manifestPath, runs } = validateManifest(runDir);
  const loaded = {};
  for (const policy of POLICIES) {
    const policyRun = runs.get(policy);
    assert(policyRun.sourceProvenance?.socialPriorityPolicy === EXPECTED_POLICY_LABELS[policy], `${policy}: manifest policy provenance mismatch.`);
    loaded[policy] = validateReport(runDir, manifest, policyRun, policy);
  }
  const base = loaded.baseline.report.sourceProvenance;
  const candidate = loaded.candidate.report.sourceProvenance;
  for (const field of ["commitSha", "workingTreeDirty", "engineSourceSha256", "measurementHarnessSha256", "targetMatches"]) {
    assert(base[field] === candidate[field], `Baseline and candidate source ${field} differs.`);
  }
  assert(base.engineSourceSha256 === manifest.policyRuns[0].sourceProvenance.engineSourceSha256 &&
    base.measurementHarnessSha256 === manifest.policyRuns[0].sourceProvenance.measurementHarnessSha256,
  "Report source hashes do not match the run manifest.");

  const summarized = deriveReport(loaded);
  const summary = {
    schemaVersion: "social-courtmate-priority-comparison-summary-v1",
    validationStatus: "passed",
    generatedAt: new Date().toISOString(),
    run: {
      manifest: path.relative(runDir, manifestPath),
      sourceRevision: manifest.sourceRevision,
      workingTreeDirty: manifest.workingTreeDirty,
      engineSourceSha256: base.engineSourceSha256,
      measurementHarnessSha256: base.measurementHarnessSha256,
      targetMatches: manifest.targetMatches,
      seeds: manifest.seeds,
      sessionsPerPolicy: manifest.policyRuns.length ? EXPECTED_SEEDS.length : 0,
    },
    definitions: {
      C: "Completed-history distinct undirected courtmate pairs; 91 possible across the fixed 14-player roster.",
      T: "Per-player distinct MIXED/OWN_SIDE types divided by two in the latest six completed appearances.",
      primaryComparison: "Paired per-seed courtmate pair breadth at 21 and 100; all other outcomes are reported separately.",
      noCompositeKpi: true,
      noLegacy3211DecisionRule: true,
      b2bAggregation: "Pooled counts divided by pooled eligible assignments, plus unweighted mean of seed rates.",
      gapP95Aggregation: "Unweighted mean of seed p95s; maximum is the worst seed maximum.",
      entropy: "Mean per-player Shannon entropy normalized by structural opportunity count.",
      productionTiming: "ordinaryProductionWallMs / ordinaryProductionCalls; counterfactualWrapperWallMs includes the wrapper production selection and no-starvation diagnostic and is reported separately.",
    },
    horizons: summarized.horizons,
    pairedSeedWinTieLoss: summarized.pairedSeedWinTieLoss,
    longRun: summarized.longRun,
  };
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, OUTPUT_JSON);
  const markdownPath = path.join(outputDir, OUTPUT_MARKDOWN);
  assert(!existsSync(jsonPath) && !existsSync(markdownPath), "Refusing to overwrite existing summary output.");
  const jsonContents = `${JSON.stringify(summary, null, 2)}\n`;
  const markdownContents = `${renderMarkdown(summary)}\n`;
  writeExclusive(jsonPath, jsonContents);
  writeExclusive(markdownPath, markdownContents);
  return { summary, jsonPath, markdownPath };
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printUsage();
  assert(args.inputDir, "Provide the full run directory containing the validated manifest.");
  const result = summarizeSocialCourtmatePriorityRun(args.inputDir, args.outputDir ?? args.inputDir);
  process.stdout.write(`Validated baseline/candidate comparison written.\n${result.jsonPath}\n${result.markdownPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
