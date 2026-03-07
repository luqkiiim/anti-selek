import { SessionMode } from "../../types/enums";
import {
  scorePartitionDetailed,
  type DoublesPartition,
  type PartitionCandidate,
  type RotationHistory,
} from "./partitioning";

export type ManualMatchTeams = DoublesPartition;
export function getManualMatchPlayerIds(teams: ManualMatchTeams): [
  string,
  string,
  string,
  string,
] {
  return [
    teams.team1[0],
    teams.team1[1],
    teams.team2[0],
    teams.team2[1],
  ];
}

export function hasDuplicateManualMatchPlayers(teams: ManualMatchTeams): boolean {
  return new Set(getManualMatchPlayerIds(teams)).size !== 4;
}

export function isValidManualMatchPartition(
  teams: ManualMatchTeams,
  playersById: Map<string, PartitionCandidate>,
  sessionMode: SessionMode,
  rotationHistory: RotationHistory
): boolean {
  return (
    scorePartitionDetailed(teams, playersById, sessionMode, rotationHistory) !==
    null
  );
}
