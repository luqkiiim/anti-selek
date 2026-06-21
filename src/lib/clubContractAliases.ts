import {
  LEGACY_COMMUNITY_INPUT_ALIAS_USED_EVENT,
  logTelemetryEvent,
} from "@/lib/serverTelemetry";

type ContractTelemetrySurface = "api" | "page";

export interface ClubContractAliasTelemetryContext {
  canonicalRoute: string;
  request: Request;
  surface: ContractTelemetrySurface;
}

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
  label: string,
  telemetry?: ClubContractAliasTelemetryContext
) {
  const canonicalValue = source[canonicalKey];
  const legacyValue = source[legacyKey];
  const conflict =
    canonicalValue !== undefined &&
    legacyValue !== undefined &&
    canonicalValue !== legacyValue;

  if (legacyValue !== undefined) {
    logLegacyCommunityInputAliasUsed({
      canonicalKey,
      conflict,
      legacyKey,
      telemetry,
    });
  }

  if (conflict) {
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
  label: string,
  telemetry?: ClubContractAliasTelemetryContext
) {
  const canonicalValue = searchParams.get(canonicalKey);
  const legacyValue = searchParams.get(legacyKey);
  const conflict =
    canonicalValue !== null &&
    legacyValue !== null &&
    canonicalValue !== legacyValue;

  if (legacyValue !== null) {
    logLegacyCommunityInputAliasUsed({
      canonicalKey,
      conflict,
      legacyKey,
      telemetry,
    });
  }

  if (conflict) {
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

function logLegacyCommunityInputAliasUsed({
  canonicalKey,
  conflict,
  legacyKey,
  telemetry,
}: {
  canonicalKey: string;
  conflict: boolean;
  legacyKey: string;
  telemetry?: ClubContractAliasTelemetryContext;
}) {
  if (!telemetry) {
    return;
  }

  logTelemetryEvent({
    details: {
      canonicalKey,
      conflict,
      legacyKey,
      method: telemetry.request.method,
      route: getLegacyCompatibleRoutePattern(
        telemetry.request,
        telemetry.canonicalRoute
      ),
      surface: telemetry.surface,
    },
    event: LEGACY_COMMUNITY_INPUT_ALIAS_USED_EVENT,
    request: telemetry.request,
  });
}

function getLegacyCompatibleRoutePattern(request: Request, canonicalRoute: string) {
  const pathname = new URL(request.url).pathname;

  if (canonicalRoute.startsWith("/api/clubs") && pathname.startsWith("/api/communities")) {
    return canonicalRoute.replace("/api/clubs", "/api/communities");
  }

  if (canonicalRoute.startsWith("/club") && pathname.startsWith("/community")) {
    return canonicalRoute.replace("/club", "/community");
  }

  return canonicalRoute;
}
