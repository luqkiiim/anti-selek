import { expect } from "vitest";

type AliasRecord = Record<string, unknown>;

export const CLUB_CONTRACT_ALIAS_PAIRS = [
  ["clubId", "communityId"],
  ["clubName", "communityName"],
  ["clubPulse", "communityPulse"],
  ["clubs", "communities"],
  ["quickAccessClubId", "quickAccessCommunityId"],
  ["viewerClubRole", "viewerCommunityRole"],
  ["partnerClubId", "partnerCommunityId"],
  ["sourceClubId", "sourceCommunityId"],
  ["targetClubId", "targetCommunityId"],
] as const;

export function expectAliasPair(
  value: AliasRecord,
  canonicalKey: string,
  legacyKey: string
) {
  expect(value).toHaveProperty(canonicalKey);
  expect(value).toHaveProperty(legacyKey);
  expect(value[legacyKey]).toEqual(value[canonicalKey]);
}

export function expectOptionalAliasPair(
  value: AliasRecord,
  canonicalKey: string,
  legacyKey: string
) {
  const hasCanonical = Object.prototype.hasOwnProperty.call(value, canonicalKey);
  const hasLegacy = Object.prototype.hasOwnProperty.call(value, legacyKey);

  if (!hasCanonical && !hasLegacy) {
    return;
  }

  expectAliasPair(value, canonicalKey, legacyKey);
}

export function expectClubContractAliases(value: AliasRecord) {
  for (const [canonicalKey, legacyKey] of CLUB_CONTRACT_ALIAS_PAIRS) {
    expectOptionalAliasPair(value, canonicalKey, legacyKey);
  }
}
