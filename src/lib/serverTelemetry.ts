import { getRequestIp, getRequestUserAgent } from "@/lib/requestMetadata";

export const LEGACY_COMMUNITY_ROUTE_USED_EVENT =
  "legacy_contract.community_route_used";
export const LEGACY_COMMUNITY_INPUT_ALIAS_USED_EVENT =
  "legacy_contract.community_input_alias_used";

interface TelemetryRequest {
  headers: Headers;
}

interface ServerTelemetryEvent {
  details?: Record<string, unknown>;
  event: string;
  request?: TelemetryRequest;
}

export function logTelemetryEvent(event: ServerTelemetryEvent) {
  try {
    console.info(
      "[telemetry]",
      JSON.stringify({
        details: event.details,
        event: event.event,
        request: event.request
          ? {
              ip: getRequestIp(event.request),
              userAgent: getRequestUserAgent(event.request),
            }
          : undefined,
        timestamp: new Date().toISOString(),
      })
    );
  } catch {
    // Telemetry must never affect request behavior.
  }
}
