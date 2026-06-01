import { NextResponse } from "next/server";
import {
  AVATAR_MAX_FILE_BYTES,
  isSupportedAvatarMimeType,
} from "@/lib/avatar";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { isAllowedShareAvatarSource } from "@/lib/shareAvatar";

export const dynamic = "force-dynamic";

const SHARE_AVATAR_CACHE_SECONDS = 86_400;
const SHARE_AVATAR_FETCH_TIMEOUT_MS = 5_000;

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const source = new URL(request.url).searchParams.get("source");
    if (!source || !isAllowedShareAvatarSource(source)) {
      return NextResponse.json({ error: "Invalid avatar source" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      SHARE_AVATAR_FETCH_TIMEOUT_MS
    );
    const upstream = await fetch(source, {
      cache: "force-cache",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!upstream.ok) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim();
    if (!contentType || !isSupportedAvatarMimeType(contentType)) {
      return NextResponse.json(
        { error: "Unsupported avatar image" },
        { status: 415 }
      );
    }

    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > AVATAR_MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Avatar image is too large" }, { status: 413 });
    }

    const body = await upstream.arrayBuffer();
    if (body.byteLength > AVATAR_MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Avatar image is too large" }, { status: 413 });
    }

    return new Response(body, {
      headers: {
        "Cache-Control": `private, max-age=${SHARE_AVATAR_CACHE_SECONDS}`,
        "Content-Length": `${body.byteLength}`,
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    logError("Share avatar proxy error", error);
    return safeErrorResponse();
  }
}
