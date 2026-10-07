"""Derive exact 24/27-match endpoints from validated legacy traces, without running a matcher."""

import collections
import hashlib
import json
import math
import pathlib
import statistics


ROOT = pathlib.Path(__file__).resolve().parent.parent
INPUT = ROOT / "benchmarks/generated/social-readiness/full-2026-10-07-v1"
OUTPUT = ROOT / "benchmarks/generated/social-readiness/full-2026-10-07-v3/legacy-short-endpoints-independent.json"


def derive(session):
    scenario = session["scenario"]
    assert min(scenario["upperCount"], scenario["lowerCount"]) >= 4
    size = scenario["upperCount"] + scenario["lowerCount"]
    ids = [f"P{index + 1}" for index in range(size)]
    counts = dict.fromkeys(ids, 0)
    rests = dict.fromkeys(ids, 0)
    busy = set()
    last = {}
    samples = []
    back_to_back = 0
    max_available = max_assignment_gap = max_completion_gap = 0
    decisions = collections.defaultdict(list)
    for decision in session["decisions"]:
        if decision["executed"]:
            decisions[decision["afterCompletedMatches"]].append(decision)

    def assign(completed):
        nonlocal max_available, max_assignment_gap
        if decisions[completed]:
            max_available = max(max_available, max((rests[user] for user in ids if user not in busy), default=0))
        for decision in decisions[completed]:
            for assignment in decision["selectedAssignments"]:
                for user in assignment["ids"]:
                    if user in last:
                        max_assignment_gap = max(max_assignment_gap, completed - last[user])
                    assert user not in busy
                    busy.add(user)

    def metrics(horizon):
        facets = {facet: {user: collections.Counter() for user in ids} for facet in ["C", "P", "O"]}
        types = {user: [] for user in ids}
        type_counts = collections.Counter()
        for match in session["completedHistory"][:horizon]:
            team1, team2 = match["team1"], match["team2"]
            quartet = team1 + team2
            kind = match["socialVariety"]["courtType"]
            kind = "OWN_SIDE" if kind in ["UPPER", "LOWER"] else kind
            assert kind in ["MIXED", "OWN_SIDE"]
            type_counts[kind] += 1
            for user in quartet:
                types[user].append(kind)
                for peer in quartet:
                    if peer != user:
                        facets["C"][user][peer] += 1
            for team, other in [(team1, team2), (team2, team1)]:
                for user in team:
                    for peer in team:
                        if peer != user:
                            facets["P"][user][peer] += 1
                    for peer in other:
                        facets["O"][user][peer] += 1
        relationships = {}
        for facet, players in facets.items():
            distinct = [len(players[user]) for user in ids]
            entropy = []
            for frequencies in players.values():
                total = sum(frequencies.values())
                entropy.append(-sum((value / total) * math.log(value / total) for value in frequencies.values()) / math.log(size - 1) if total else 0)
            relationships[facet] = {
                "averageDistinctPeers": statistics.mean(distinct),
                "minimumDistinctPeers": min(distinct),
                "meanCoverage": statistics.mean(value / (size - 1) for value in distinct),
                "worstPlayerCoverage": min(distinct) / (size - 1),
                "fullyCoveredPlayerCount": sum(value == size - 1 for value in distinct),
                "coveredPairCount": sum(distinct) // 2,
                "feasiblePairCount": size * (size - 1) // 2,
                "meanNormalizedEntropy": statistics.mean(entropy),
            }
        recent = [len(set(types[user][-6:])) / 2 for user in ids]
        longest = 0
        for history in types.values():
            current, previous = 0, None
            for kind in history:
                current = current + 1 if kind == previous else 1
                longest = max(longest, current)
                previous = kind
        sorted_rest = sorted(samples)
        return {
            "completedMatches": horizon,
            "relationships": relationships,
            "meanT": statistics.mean(recent),
            "bothTypeCoverageFraction": sum(value == 1 for value in recent) / size,
            "mixedMatches": type_counts["MIXED"],
            "ownSideMatches": type_counts["OWN_SIDE"],
            "longestSingleTypeRun": longest,
            "countDistribution": dict(sorted(collections.Counter(counts.values()).items())),
            "playerMatchCounts": counts.copy(),
            "countSpread": max(counts.values()) - min(counts.values()),
            "rest": {
                "assignmentCount": len(samples),
                "meanRestTurnsIncludingFirst": statistics.mean(samples),
                "p95RestTurns": sorted_rest[math.ceil(0.95 * len(samples)) - 1],
                "maximumRestTurns": max(samples),
                "backToBackCount": back_to_back,
                "backToBackRate": back_to_back / (horizon * 4 - size),
                "longestOtherCompletionGap": max_completion_gap,
                "longestCompletionToNextAssignmentGap": max_assignment_gap,
                "maximumObservedAvailableRestTurns": max_available,
            },
        }

    checks = 0
    assign(0)
    checkpoints = {checkpoint["completedMatches"]: checkpoint for checkpoint in session["checkpoints"]}
    for completed, match in enumerate(session["completedHistory"], 1):
        for user in ids:
            if user not in busy:
                rests[user] += 1
        for user in match["team1"] + match["team2"]:
            assert user in busy
            busy.remove(user)
            counts[user] += 1
            samples.append(rests[user])
            back_to_back += counts[user] > 1 and rests[user] == 0
            rests[user] = 0
            if user in last:
                max_completion_gap = max(max_completion_gap, completed - last[user] - 1)
            last[user] = completed
        if completed in checkpoints:
            actual, checkpoint = metrics(completed), checkpoints[completed]
            for facet, name in [("C", "courtmates"), ("P", "partners"), ("O", "opponents")]:
                for key, value in actual["relationships"][facet].items():
                    assert abs(value - checkpoint["scores"]["structural"][name][key]) < 1e-9
                    checks += 1
            assert abs(actual["meanT"] - checkpoint["scores"]["structural"]["meanT"]) < 1e-9
            checks += 1
            for key in ["assignmentCount", "p95RestTurns", "maximumRestTurns", "longestOtherCompletionGap"]:
                assert actual["rest"][key] == checkpoint["rest"][key]
                checks += 1
            assert abs(actual["rest"]["meanRestTurnsIncludingFirst"] - checkpoint["rest"]["meanRestTurns"]) < 1e-9
            assert actual["rest"]["backToBackCount"] == checkpoint["rest"]["backToBackAssignments"]
            checks += 2
        if completed < len(session["completedHistory"]):
            assign(completed)
    return metrics(len(session["completedHistory"])), checks


def main():
    sessions, checks = [], 0
    for profile in ["16-8-8-2c", "18-9-9-3c"]:
        source = INPUT / f"legacy-short-{profile}" / f"frontier-{profile}.json"
        raw = source.read_bytes()
        report = json.loads(raw)
        assert report["validationStatus"] == "passed"
        for session in report["sessions"]:
            assert session["status"] == "completed"
            endpoint, count = derive(session)
            checks += count
            sessions.append({"scenarioId": session["scenario"]["id"], "seed": session["seed"], "sourceFile": str(source.relative_to(ROOT)), "sourceSha256": hashlib.sha256(raw).hexdigest(), **endpoint})
    payload = {
        "schemaVersion": "independent-legacy-short-endpoints-v1",
        "analysisScriptSha256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        "crossCheckedSavedCheckpointFields": checks,
        "method": "Completed-history relationships independently enumerated; legacy decision/completion rest replay; legacy mean rest includes first appearances, B2B denominator excludes them. Maximum available rest considers real assignment decisions only.",
        "sessions": sessions,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"file": str(OUTPUT), "sessions": len(sessions), "crossCheckedSavedCheckpointFields": checks}))


if __name__ == "__main__":
    main()
