import { getRequestIp, getRequestUserAgent } from "@/lib/requestMetadata";

type AuditOutcome = "denied" | "error" | "success";

interface AuditActor {
  email?: string | null;
  isGlobalAdmin?: boolean;
  userId?: string | null;
}

interface AuditScope {
  communityId?: string;
  route?: string;
  sessionCode?: string;
}

interface AuditTarget {
  id?: string;
  name?: string | null;
  type: string;
}

interface AuditEvent {
  action: string;
  actor?: AuditActor;
  details?: Record<string, unknown>;
  outcome: AuditOutcome;
  request?: { headers: Headers };
  scope?: AuditScope;
  target?: AuditTarget;
}

export function logAuditEvent(event: AuditEvent) {
  console.info(
    "[audit]",
    JSON.stringify({
      action: event.action,
      actor: {
        email: event.actor?.email ?? null,
        isGlobalAdmin: event.actor?.isGlobalAdmin ?? false,
        userId: event.actor?.userId ?? null,
      },
      details: event.details,
      outcome: event.outcome,
      request: event.request
        ? {
            ip: getRequestIp(event.request),
            userAgent: getRequestUserAgent(event.request),
          }
        : undefined,
      scope: event.scope,
      target: event.target,
      timestamp: new Date().toISOString(),
    })
  );
}
