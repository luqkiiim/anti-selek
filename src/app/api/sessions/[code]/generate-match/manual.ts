import {
  getManualMatchPlayerIds,
  hasDuplicateManualMatchPlayers,
  isValidManualMatchPartition,
  type ManualMatchTeams,
} from "@/lib/matchmaking/manualMatch";
import {
  buildRotationHistory,
  type PartitionCandidate,
} from "@/lib/matchmaking/partitioning";
import { SessionMode, SessionType } from "@/types/enums";
import {
  GenerateMatchError,
  type GenerateMatchCourt,
  type GenerateMatchSession,
  mixedModeLabel,
} from "./shared";

export function validateManualMatchRequest({
  sessionData,
  targetCourt,
  parsedTeams,
  busyPlayerIds,
  playersById,
  rotationHistory,
}: {
  sessionData: GenerateMatchSession;
  targetCourt: GenerateMatchCourt;
  parsedTeams: ManualMatchTeams;
  busyPlayerIds: Set<string>;
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
}) {
  if (targetCourt.currentMatch) {
    throw new GenerateMatchError(
      409,
      "This court already has a match. Undo it first to create a manual match."
    );
  }

  if (hasDuplicateManualMatchPlayers(parsedTeams)) {
    throw new GenerateMatchError(
      400,
      "Manual matches require 4 different players."
    );
  }

  const selectedIds = getManualMatchPlayerIds(parsedTeams);
  const selectedPlayers = selectedIds.map((id) =>
    sessionData.players.find((player) => player.userId === id)
  );

  if (selectedPlayers.some((player) => !player)) {
    throw new GenerateMatchError(
      400,
      "Every manual match player must already be in this session."
    );
  }

  if (selectedPlayers.some((player) => player?.isPaused)) {
    throw new GenerateMatchError(
      400,
      "Paused players cannot be added to a manual match."
    );
  }

  const busyManualIds = selectedIds.filter((id) => busyPlayerIds.has(id));
  if (busyManualIds.length > 0) {
    throw new GenerateMatchError(
      409,
      "One or more selected players are already busy on another court."
    );
  }

  if (
    !isValidManualMatchPartition(
      parsedTeams,
      playersById,
      sessionData.mode as SessionMode,
      sessionData.type as SessionType,
      rotationHistory
    )
  ) {
    throw new GenerateMatchError(
      400,
      sessionData.mode === SessionMode.MIXICANO
        ? `That manual pairing is invalid for current ${mixedModeLabel} preferences.`
        : "Invalid manual pairing."
    );
  }

  return selectedIds;
}
