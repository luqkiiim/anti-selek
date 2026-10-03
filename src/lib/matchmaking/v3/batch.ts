import { SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection } from "./socialBatch";
import type { RotationBatchOptions } from "./socialBatch";
import type { ActiveMatchmakerV3Player, MatchmakerV3Player, V3BatchResult } from "./types";

export type V3BatchOptions<T extends MatchmakerV3Player> = RotationBatchOptions<T> & {
  sessionType: SessionType;
};

/** Whole-batch rotation, with a balance admissibility policy for Points/Rating. */
export function findBestBatchSelectionV3<T extends MatchmakerV3Player>(
  players: T[],
  options: V3BatchOptions<T>
): V3BatchResult<ActiveMatchmakerV3Player<T>> {
  return findBestRotationBatchSelection(players, options);
}
