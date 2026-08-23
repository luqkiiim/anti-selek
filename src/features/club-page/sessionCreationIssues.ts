import { PlayerGender } from "@/types/enums";

export function hasMissingRequiredGender({
  players,
  selectedPlayerIds,
  guestGenders,
}: {
  players: Array<{ id: string; gender: PlayerGender }>;
  selectedPlayerIds: string[];
  guestGenders: PlayerGender[];
}) {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const hasExplicitGender = (gender: PlayerGender | undefined) =>
    gender === PlayerGender.MALE || gender === PlayerGender.FEMALE;

  return (
    selectedPlayerIds.some(
      (playerId) => !hasExplicitGender(playerById.get(playerId)?.gender)
    ) || guestGenders.some((gender) => !hasExplicitGender(gender))
  );
}

export interface SessionCreationIssueInput {
  name: string;
  participantCount: number;
  poolsEnabled: boolean;
  competitiveCount: number;
  socialCount: number;
  isMixed: boolean;
  hasMissingMixedGender: boolean;
  mixedModeLabel: string;
  isInterclub: boolean;
  hasPartnerClub: boolean;
  hasInvalidInterclubRepresentation: boolean;
}

export function getSessionCreationIssues({
  name,
  participantCount,
  poolsEnabled,
  competitiveCount,
  socialCount,
  isMixed,
  hasMissingMixedGender,
  mixedModeLabel,
  isInterclub,
  hasPartnerClub,
  hasInvalidInterclubRepresentation,
}: SessionCreationIssueInput) {
  const issues: string[] = [];

  if (!name.trim()) {
    issues.push("Add a tournament name.");
  }

  if (participantCount < 2) {
    const remaining = 2 - participantCount;
    issues.push(
      `Add ${remaining} more ${remaining === 1 ? "player or guest" : "players or guests"}.`
    );
  }

  if (poolsEnabled && competitiveCount < 2) {
    issues.push("Add at least 2 Competitive players or guests.");
  }

  if (poolsEnabled && socialCount < 2) {
    issues.push("Add at least 2 Social players or guests.");
  }

  if (isMixed && hasMissingMixedGender) {
    issues.push(
      `Set Male or Female for every selected player and guest in ${mixedModeLabel}.`
    );
  }

  if (isInterclub && !hasPartnerClub) {
    issues.push("Choose a partner club for club vs club.");
  }

  if (
    isInterclub &&
    hasPartnerClub &&
    hasInvalidInterclubRepresentation
  ) {
    issues.push("Assign every selected player and guest to a valid club side.");
  }

  return issues;
}
