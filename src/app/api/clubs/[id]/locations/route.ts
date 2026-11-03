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
    if (!query || query.length < 2 || query.length > 160) {
      return json({ error: "Invalid location search." }, 400);
    }
    const key = process.env.GEOAPIFY_API_KEY;
    if (!key) return json({ error: unavailable }, 503);

    const detectedCountry = request.headers.get("x-vercel-ip-country")?.trim().toLowerCase() ?? "";
    const country = /^[a-z]{2}$/.test(detectedCountry) && !["xx", "zz"].includes(detectedCountry) ? detectedCountry : "my";
    const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
    url.search = new URLSearchParams({ text: query, format: "json", limit: "5", lang: "en", bias: `countrycode:${country}`, apiKey: key }).toString();
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
    });
    if (!response.ok) {
      logError("Geoapify location search", { status: response.status });
      return json({ error: unavailable }, 502);
    }
    const data = await response.json();
    if (!Array.isArray(data.results)) return json({ error: unavailable }, 502);
    const suggestions: LocationSuggestion[] = [];
    for (const place of data.results) {
      if (!place || typeof place.lat !== "number" || !Number.isFinite(place.lat) || Math.abs(place.lat) > 90 ||
        typeof place.lon !== "number" || !Number.isFinite(place.lon) || Math.abs(place.lon) > 180) continue;
      const name = [place.name, place.address_line1, place.formatted].find(value => typeof value === "string" && value.trim());
      if (typeof name !== "string" || name.trim().length > 160) continue;
      const address = place.address_line2 ?? place.formatted;
      const mapUrl = new URL("https://www.google.com/maps/search/");
      mapUrl.search = new URLSearchParams({ api: "1", query: `${place.lat},${place.lon}` }).toString();
      suggestions.push({
        placeId: typeof place.place_id === "string" ? place.place_id : `${place.lat},${place.lon}`,
        name: name.trim(), address: typeof address === "string" ? address : "", mapUrl: mapUrl.href,
      });
      if (suggestions.length === 5) break;
    }
    return json({ suggestions });
  } catch (error) {
    if (!request.signal.aborted) logError("Location search", { name: error instanceof Error ? error.name : "Unknown error" });
    if (error instanceof Error && error.name === "TimeoutError") return json({ error: "Location search timed out. Try again." }, 504);
    return json({ error: unavailable }, 503);
  }
}
