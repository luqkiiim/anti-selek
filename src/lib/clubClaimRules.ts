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
      reason: "Sign in with an account to request a Player connection.",
    };
  }


  return {
    canRequest: true,
    reason: null,
  };
}
