import { NextResponse } from "next/server";
import { serializeAvatarEntity } from "@/lib/avatar";
import { logError, safeErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { getClubMemberAccessContext } from "../clubApiAccess";

const RATE_LIMIT_KEY = "api:clubs:id:notifications";
const DEFAULT_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 50;

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function getNotificationLimit(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;

  if (!Number.isFinite(parsedLimit)) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(1, parsedLimit));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, RATE_LIMIT_KEY, {
      limit: 60,
      windowMs: 60_000,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    const access = await getClubMemberAccessContext({
      clubId: id,
      rateLimitKey: RATE_LIMIT_KEY,
      request,
    });
    if ("response" in access) return access.response;

    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get("countOnly") === "1";
    const unreadCountPromise = prisma.clubNotification.count({
      where: {
        clubId: id,
        recipientUserId: access.context.viewerId,
        readAt: null,
      },
    });

    if (countOnly) {
      return NextResponse.json({
        unreadCount: await unreadCountPromise,
      });
    }

    const [unreadCount, notifications] = await Promise.all([
      unreadCountPromise,
      prisma.clubNotification.findMany({
        where: {
          clubId: id,
          recipientUserId: access.context.viewerId,
        },
        orderBy: { createdAt: "desc" },
        take: getNotificationLimit(request),
        select: {
          id: true,
          type: true,
          newsItemId: true,
          newsType: true,
          title: true,
          detail: true,
          value: true,
          readAt: true,
          createdAt: true,
          actor: {
            select: {
              id: true,
              name: true,
              avatarKey: true,
            },
          },
          session: {
            select: {
              id: true,
              code: true,
              name: true,
              createdAt: true,
              endedAt: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      unreadCount,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        newsItemId: notification.newsItemId,
        newsType: notification.newsType,
        title: notification.title,
        detail: notification.detail,
        value: notification.value,
        readAt: toIsoString(notification.readAt),
        createdAt: toIsoString(notification.createdAt),
        actor: serializeAvatarEntity(notification.actor),
        session: {
          id: notification.session.id,
          code: notification.session.code,
          name: notification.session.name,
          date: toIsoString(
            notification.session.endedAt ?? notification.session.createdAt
          ),
        },
      })),
    });
  } catch (error) {
    logError("List club notifications error", error);
    return safeErrorResponse();
  }
}
