interface HeaderCarrier {
  headers: Headers;
}

function getHeaderValue(
  request: HeaderCarrier | undefined,
  name: string
): string | null {
  if (!request) {
    return null;
  }

  return request.headers.get(name);
}

function firstForwardedAddress(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const firstValue = value
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return firstValue ?? null;
}

export function getRequestIp(request: HeaderCarrier | undefined): string | null {
  return (
    firstForwardedAddress(getHeaderValue(request, "x-forwarded-for")) ??
    getHeaderValue(request, "x-real-ip") ??
    getHeaderValue(request, "cf-connecting-ip")
  );
}

export function getRequestUserAgent(
  request: HeaderCarrier | undefined
): string | null {
  return getHeaderValue(request, "user-agent");
}
