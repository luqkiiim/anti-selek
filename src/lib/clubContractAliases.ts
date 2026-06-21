export class ClubContractAliasConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClubContractAliasConflictError";
  }
}

export function readAliasedValue(
  source: Record<string, unknown>,
  canonicalKey: string,
  legacyKey: string,
  label: string
) {
  const canonicalValue = source[canonicalKey];
  const legacyValue = source[legacyKey];

  if (
    canonicalValue !== undefined &&
    legacyValue !== undefined &&
    canonicalValue !== legacyValue
  ) {
    throw new ClubContractAliasConflictError(
      `Conflicting ${label}; use either ${canonicalKey} or ${legacyKey}.`
    );
  }

  return canonicalValue ?? legacyValue;
}

export function readAliasedSearchParam(
  searchParams: URLSearchParams,
  canonicalKey: string,
  legacyKey: string,
  label: string
) {
  const canonicalValue = searchParams.get(canonicalKey);
  const legacyValue = searchParams.get(legacyKey);

  if (
    canonicalValue !== null &&
    legacyValue !== null &&
    canonicalValue !== legacyValue
  ) {
    throw new ClubContractAliasConflictError(
      `Conflicting ${label}; use either ${canonicalKey} or ${legacyKey}.`
    );
  }

  return canonicalValue ?? legacyValue;
}

export function withLegacyClubAliases<
  T extends {
    clubId?: unknown;
    clubName?: unknown;
    clubPulse?: unknown;
    clubs?: unknown;
    quickAccessClubId?: unknown;
    viewerClubRole?: unknown;
    partnerClubId?: unknown;
    sourceClubId?: unknown;
    targetClubId?: unknown;
  },
>(value: T) {
  return {
    ...value,
    ...(value.clubId !== undefined ? { communityId: value.clubId } : {}),
    ...(value.clubName !== undefined ? { communityName: value.clubName } : {}),
    ...(value.clubPulse !== undefined
      ? { communityPulse: value.clubPulse }
      : {}),
    ...(value.clubs !== undefined ? { communities: value.clubs } : {}),
    ...(value.quickAccessClubId !== undefined
      ? { quickAccessCommunityId: value.quickAccessClubId }
      : {}),
    ...(value.viewerClubRole !== undefined
      ? { viewerCommunityRole: value.viewerClubRole }
      : {}),
    ...(value.partnerClubId !== undefined
      ? { partnerCommunityId: value.partnerClubId }
      : {}),
    ...(value.sourceClubId !== undefined
      ? { sourceCommunityId: value.sourceClubId }
      : {}),
    ...(value.targetClubId !== undefined
      ? { targetCommunityId: value.targetClubId }
      : {}),
  };
}
