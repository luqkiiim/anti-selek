const AUTH_ENTRY_PATHS = [
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

const BLOCKED_PATH_PREFIXES = ["/api", "/_next"];

/**
 * Accepts only app-local destinations that are safe to use after authentication.
 * The value passed by `useSearchParams` is already decoded, so encoded external
 * URLs naturally fail the leading-slash check.
 */
export function getSafeCallbackUrl(
  value: string | null | undefined,
  fallback = "/"
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://anti-selek.local");
    const decodedPathname = decodeURIComponent(parsed.pathname);
    const pathname = decodedPathname.toLowerCase();

    if (
      parsed.origin !== "https://anti-selek.local" ||
      !decodedPathname.startsWith("/") ||
      decodedPathname.startsWith("//") ||
      decodedPathname.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(decodedPathname)
    ) {
      return fallback;
    }

    if (
      BLOCKED_PATH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      ) ||
      AUTH_ENTRY_PATHS.some(
        (authPath) =>
          pathname === authPath || pathname.startsWith(`${authPath}/`)
      )
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function withCallbackUrl(
  pathname: string,
  callbackUrl: string | null | undefined
): string {
  const safeCallbackUrl = getSafeCallbackUrl(callbackUrl, "");
  if (!safeCallbackUrl) {
    return pathname;
  }

  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}callbackUrl=${encodeURIComponent(
    safeCallbackUrl
  )}`;
}

export function getCurrentAppPath(
  location: Pick<Location, "pathname" | "search" | "hash">
): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function getQuickAccessCallbackUrl(
  value: string | null | undefined,
  quickAccessClubId: string | null | undefined
): string {
  const fallback = quickAccessClubId ? `/club/${quickAccessClubId}` : "/";
  const safeCallbackUrl = getSafeCallbackUrl(value, "");
  if (!safeCallbackUrl) return fallback;

  const pathname = new URL(
    safeCallbackUrl,
    "https://anti-selek.local"
  ).pathname;
  const quickClubPath = quickAccessClubId
    ? `/club/${quickAccessClubId}`
    : null;

  if (quickClubPath && pathname === quickClubPath) {
    return safeCallbackUrl;
  }

  return fallback;
}

type SessionReadabilityCheck = (code: string) => Promise<boolean>;

async function canReadSessionCallback(code: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Quick access is scoped to one club. Tournament callbacks need a server
 * authorization check because the club cannot be inferred safely from a code.
 */
export async function resolveQuickAccessCallbackUrl(
  value: string | null | undefined,
  quickAccessClubId: string | null | undefined,
  isSessionReadable: SessionReadabilityCheck = canReadSessionCallback
): Promise<string> {
  const fallback = getQuickAccessCallbackUrl(null, quickAccessClubId);
  const safeCallbackUrl = getSafeCallbackUrl(value, "");
  if (!safeCallbackUrl) return fallback;

  const parsed = new URL(safeCallbackUrl, "https://anti-selek.local");
  const quickClubPath = quickAccessClubId
    ? `/club/${quickAccessClubId}`
    : null;
  if (quickClubPath && parsed.pathname === quickClubPath) {
    return safeCallbackUrl;
  }

  const sessionMatch = parsed.pathname.match(
    /^\/session\/([^/]+)(?:\/history)?\/?$/
  );
  if (!sessionMatch) return fallback;

  try {
    const code = decodeURIComponent(sessionMatch[1]);
    return code && (await isSessionReadable(code)) ? safeCallbackUrl : fallback;
  } catch {
    return fallback;
  }
}
