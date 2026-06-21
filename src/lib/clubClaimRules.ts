export interface ClaimRequesterEligibilityInput {
  isClaimed: boolean;
  clubElo: number;
  hasClubSessionHistory: boolean;
}

export interface ClaimRequesterEligibility {
  canRequest: boolean;
  reason: string | null;
}

export function normalizeClaimName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function doClaimNamesMatch(requesterName: string, targetName: string): boolean {
  return normalizeClaimName(requesterName) === normalizeClaimName(targetName);
}

export function getClaimRequesterEligibility(
  input: ClaimRequesterEligibilityInput
): ClaimRequesterEligibility {
  if (!input.isClaimed) {
    return {
      canRequest: false,
      reason: "Only claimed accounts can request a profile merge.",
    };
  }

  if (input.clubElo !== 1000) {
    return {
      canRequest: false,
      reason: "This account already has club rating history. Manual merge required.",
    };
  }

  if (input.hasClubSessionHistory) {
    return {
      canRequest: false,
      reason: "This account already has tournament history in this club. Manual merge required.",
    };
  }

  return {
    canRequest: true,
    reason: null,
  };
}
