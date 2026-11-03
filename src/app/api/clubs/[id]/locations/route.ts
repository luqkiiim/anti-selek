import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isClubOperatorRole } from "@/lib/clubRoles";
import { isGlobalAdminEmail } from "@/lib/globalAdmin";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { invalidTargetResponse, rateLimit } from "@/lib/rateLimit";
import { logError } from "@/lib/errors";
import type { LocationSuggestion } from "@/types/location";

export const dynamic = "force-dynamic";

const unavailable = "Location search is unavailable. Enter a location or add a map link.";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await auth();
    if (!viewer?.user?.id) return json({ error: "Not authenticated" }, 401);
    if (isQuickAccessSession(viewer)) return json({ error: "Location search is unavailable." }, 403);
    const limit = await rateLimit(request, "api:clubs:locations", { identity: viewer.user.id, limit: 40, windowMs: 60_000 });
    if (limit) return limit;

    const { id } = await params;
    if (!id || id.length > 100) return json({ error: "Invalid club." }, 400);
    const isAdmin = !!viewer.user.isAdmin || isGlobalAdminEmail(viewer.user.email);
    const [club, membership] = await Promise.all([
      prisma.club.findUnique({ where: { id }, select: { id: true, isTutorial: true, tutorialOwnerId: true } }),
      isAdmin ? null : prisma.clubAccess.findUnique({ where: { clubId_userId: { clubId: id, userId: viewer.user.id } }, select: { role: true, status: true } }),
    ]);
    if (!club || (club.isTutorial && club.tutorialOwnerId !== viewer.user.id) || (!isAdmin && !(membership?.status === "ACTIVE" && isClubOperatorRole(membership.role)))) {
      return invalidTargetResponse(request, "api:clubs:locations");
    }

    const body = await request.json().catch(() => null);
    const query = typeof body?.query === "string" ? body.query.trim() : null;
    const placeId = typeof body?.placeId === "string" ? body.placeId : null;
    if (!body || typeof body.sessionToken !== "string" || !/^[a-zA-Z0-9_-]{1,36}$/.test(body.sessionToken) ||
      (query !== null) === (placeId !== null) ||
      (query !== null && (query.length < 2 || query.length > 160)) ||
      (placeId !== null && !/^[a-zA-Z0-9_-]{1,255}$/.test(placeId))) {
      return json({ error: "Invalid location search." }, 400);
    }
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return json({ error: unavailable }, 503);

    const url = placeId
      ? `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(body.sessionToken)}`
      : "https://places.googleapis.com/v1/places:autocomplete";
    const response = await fetch(url, {
      method: placeId ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": placeId ? "displayName,googleMapsUri" : "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
      },
      ...(!placeId ? { body: JSON.stringify({ input: query, sessionToken: body.sessionToken, languageCode: "en", regionCode: "MY" }) } : {}),
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(5_000)]),
    });
    if (!response.ok) {
      logError("Google location search", { status: response.status });
      return json({ error: unavailable }, 502);
    }
    const data = await response.json();
    if (placeId) {
      const venue = data.displayName?.text;
      const mapUrl = typeof data.googleMapsUri === "string" ? new URL(data.googleMapsUri) : null;
      if (typeof venue !== "string" || !venue.trim() || venue.length > 160 || !mapUrl || mapUrl.protocol !== "https:" || mapUrl.href.length > 1000) {
        return json({ error: "Unable to select this location. Enter it manually." }, 502);
      }
      return json({ venue: venue.trim(), venueMapUrl: mapUrl.href });
    }
    const suggestions: LocationSuggestion[] = [];
    for (const item of data.suggestions ?? []) {
      const place = item.placePrediction;
      const name = place?.structuredFormat?.mainText?.text;
      const address = place?.structuredFormat?.secondaryText?.text;
      if (typeof place?.placeId === "string" && typeof name === "string") {
        suggestions.push({ placeId: place.placeId, name, address: typeof address === "string" ? address : "" });
      }
      if (suggestions.length === 5) break;
    }
    return json({ suggestions });
  } catch (error) {
    if (!request.signal.aborted) logError("Location search", { name: error instanceof Error ? error.name : "Unknown error" });
    return json({ error: unavailable }, 503);
  }
}
