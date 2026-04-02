import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

export function isValidPlayerGender(value: unknown): value is PlayerGender {
  return (
    typeof value === "string" &&
    [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
      value as PlayerGender
    )
  );
}

export function isValidPartnerPreference(
  value: unknown
): value is PartnerPreference {
  return (
    typeof value === "string" &&
    [PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
      value as PartnerPreference
    )
  );
}

export function isValidMixedSide(value: unknown): value is MixedSide {
  return (
    typeof value === "string" &&
    [MixedSide.UPPER, MixedSide.LOWER].includes(value as MixedSide)
  );
}

export function defaultPartnerPreferenceForGender(
  gender: PlayerGender
): PartnerPreference {
  return gender === PlayerGender.FEMALE
    ? PartnerPreference.FEMALE_FLEX
    : PartnerPreference.OPEN;
}

export function getDefaultMixedSideForGender(
  gender: PlayerGender
): MixedSide | null {
  if (gender === PlayerGender.MALE) {
    return MixedSide.UPPER;
  }

  if (gender === PlayerGender.FEMALE) {
    return MixedSide.LOWER;
  }

  return null;
}

export function getLegacyMixedSideOverride(
  gender: PlayerGender,
  partnerPreference?: PartnerPreference | string | null
): MixedSide | null {
  if (!isValidPartnerPreference(partnerPreference)) {
    return null;
  }

  if (
    gender === PlayerGender.FEMALE &&
    partnerPreference === PartnerPreference.OPEN
  ) {
    return MixedSide.UPPER;
  }

  if (
    gender === PlayerGender.MALE &&
    partnerPreference === PartnerPreference.FEMALE_FLEX
  ) {
    return MixedSide.LOWER;
  }

  return null;
}

export function normalizeMixedSideOverrideForGender(
  gender: PlayerGender,
  mixedSideOverride?: MixedSide | string | null,
  legacyPartnerPreference?: PartnerPreference | string | null
): MixedSide | null {
  if (isValidMixedSide(mixedSideOverride)) {
    if (
      gender === PlayerGender.FEMALE &&
      mixedSideOverride === MixedSide.UPPER
    ) {
      return MixedSide.UPPER;
    }

    if (
      gender === PlayerGender.MALE &&
      mixedSideOverride === MixedSide.LOWER
    ) {
      return MixedSide.LOWER;
    }

    return null;
  }

  return getLegacyMixedSideOverride(gender, legacyPartnerPreference);
}

export function getStoredPartnerPreference(
  gender: PlayerGender,
  mixedSideOverride?: MixedSide | string | null
): PartnerPreference {
  const normalizedMixedSideOverride = normalizeMixedSideOverrideForGender(
    gender,
    mixedSideOverride
  );

  if (
    gender === PlayerGender.FEMALE &&
    normalizedMixedSideOverride === MixedSide.UPPER
  ) {
    return PartnerPreference.OPEN;
  }

  return defaultPartnerPreferenceForGender(gender);
}

export function resolveMixedSideState({
  gender,
  mixedSideOverride,
  partnerPreference,
}: {
  gender: PlayerGender;
  mixedSideOverride?: MixedSide | string | null;
  partnerPreference?: PartnerPreference | string | null;
}) {
  const resolvedMixedSideOverride = normalizeMixedSideOverrideForGender(
    gender,
    mixedSideOverride,
    partnerPreference
  );

  return {
    mixedSideOverride: resolvedMixedSideOverride,
    partnerPreference: getStoredPartnerPreference(
      gender,
      resolvedMixedSideOverride
    ),
  };
}

export function getEffectiveMixedSide({
  gender,
  mixedSideOverride,
  partnerPreference,
}: {
  gender?: PlayerGender | string | null;
  mixedSideOverride?: MixedSide | string | null;
  partnerPreference?: PartnerPreference | string | null;
}): MixedSide | null {
  if (!isValidPlayerGender(gender)) {
    return null;
  }

  const resolvedMixedSideOverride = normalizeMixedSideOverrideForGender(
    gender,
    mixedSideOverride,
    partnerPreference
  );

  if (resolvedMixedSideOverride) {
    return resolvedMixedSideOverride;
  }

  return getDefaultMixedSideForGender(gender);
}

export function getMixedSideOverrideOptionForGender(gender: PlayerGender) {
  if (gender === PlayerGender.FEMALE) {
    return {
      value: MixedSide.UPPER,
      label: "Upper Side",
    };
  }

  if (gender === PlayerGender.MALE) {
    return {
      value: MixedSide.LOWER,
      label: "Lower Side",
    };
  }

  return null;
}

export function getMixedSideDisplayLabel({
  gender,
  mixedSideOverride,
  partnerPreference,
}: {
  gender: PlayerGender;
  mixedSideOverride?: MixedSide | string | null;
  partnerPreference?: PartnerPreference | string | null;
}) {
  const resolvedMixedSideOverride = normalizeMixedSideOverrideForGender(
    gender,
    mixedSideOverride,
    partnerPreference
  );

  if (resolvedMixedSideOverride === MixedSide.UPPER) {
    return "Upper Side";
  }

  if (resolvedMixedSideOverride === MixedSide.LOWER) {
    return "Lower Side";
  }

  return "Default";
}
