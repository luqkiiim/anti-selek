import { NextResponse } from "next/server";
import { POST as verifyEntry } from "@/app/api/clubs/join-entry/route";
import { rateLimit } from "@/lib/rateLimit";
/** Response-compatible predecessor. Only the current session-bound entry grant is issued. */
export async function POST(request: Request) {
  const limited = await rateLimit(request, "api:club-join-proof", { limit: 8, windowMs: 60_000 });
  if (limited) return limited;
  const response = await verifyEntry(request);
  if (!response.ok) return response;
  const { clubId } = await response.json();
  return NextResponse.json({ ok: true, clubId, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }, { headers: response.headers });
}
