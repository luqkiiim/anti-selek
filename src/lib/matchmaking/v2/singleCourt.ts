import { SessionMode, SessionType } from "../../../types/enums";
import { getQuartetKey } from "../partitioning";

import { buildFairnessPool } from "./fairness";
import { compareSelectionsV2, evaluateQuartetV2 } from "./scoring";
import type {
  MatchmakingContext,
  RankedRotationLoadCandidate,
  V2Selection,
} from "./types";

const NORMAL_EXTRA_CANDIDATES = [4, 8, 12];
const MIXICANO_EXTRA_CANDIDATES = [8, 12, 16];

function getPoolSizes(
  sessionMode: SessionMode,
  rankedCandidateCount: number,
  neededPlayers: number
) {
  const extras =
    sessionMode === SessionMode.MIXICANO
      ? MIXICANO_EXTRA_CANDIDATES
      : NORMAL_EXTRA_CANDIDATES;

  return extras
    .map((extra) => Math.min(rankedCandidateCount, neededPlayers + extra))
    .filter((size, index, sizes) => sizes.indexOf(size) === index);
}

export function findBestAutoMatchSelectionV2<T extends RankedRotationLoadCandidate>(
  rankedCandidates: T[],
  context: MatchmakingContext,
  sessionMode: SessionMode,
  sessionType: SessionType,
  options?: {
    excludedQuartetKey?: string;
  }
): V2Selection | null {
  if (rankedCandidates.length < 4) {
    return null;
  }

  for (const poolSize of getPoolSizes(sessionMode, rankedCandidates.length, 4)) {
    const pool = buildFairnessPool(rankedCandidates, 4, poolSize - 4);
    let bestSelection: V2Selection | null = null;

    for (let i = 0; i < pool.length - 3; i++) {
      for (let j = i + 1; j < pool.length - 2; j++) {
        for (let k = j + 1; k < pool.length - 1; k++) {
          for (let l = k + 1; l < pool.length; l++) {
            const ids: [string, string, string, string] = [
              pool[i].userId,
              pool[j].userId,
              pool[k].userId,
              pool[l].userId,
            ];

            if (
              options?.excludedQuartetKey &&
              getQuartetKey(ids) === options.excludedQuartetKey
            ) {
              continue;
            }

            const selection = evaluateQuartetV2(
              rankedCandidates,
              context,
              sessionMode,
              sessionType,
              ids
            );

            if (!selection) {
              continue;
            }

            if (
              !bestSelection ||
              compareSelectionsV2(selection, bestSelection, sessionType) < 0
            ) {
              bestSelection = selection;
            }
          }
        }
      }
    }

    if (bestSelection) {
      return bestSelection;
    }
  }

  return null;
}
