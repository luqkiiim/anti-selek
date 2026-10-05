import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionAccountId } from "@/lib/quickAccess";
import { buildAvatarObjectKey, getAvatarFileSignatureValidationError, getAvatarUploadValidationError, isAvatarStorageConfigured, resolveAvatarUrl } from "@/lib/avatar";
import { cleanupSupersededAvatar, rollbackUploadedAvatar, uploadAvatarObject } from "@/lib/avatarStorage";
import { rateLimit } from "@/lib/rateLimit";
import { logError, safeErrorResponse } from "@/lib/errors";

async function target(request: Request) {
  const limited = await rateLimit(request, "api:account:avatar", { limit: 10, windowMs: 60000 });
  if (limited) return { response: limited };
  const userId = getSessionAccountId(await auth());
  if (!userId) return { response: NextResponse.json({ error: "Sign in to manage your account photo" }, { status: 401 }) };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, avatarKey: true, isActive: true } });
  if (!user?.isActive) return { response: NextResponse.json({ error: "Account unavailable" }, { status: 403 }) };
  return { user };
}

export async function POST(request: Request) {
  let uploadedAvatarKey: string | null = null;
  try {
    const access = await target(request); if (access.response) return access.response;
    const user = access.user!;
    if (!isAvatarStorageConfigured()) return NextResponse.json({ error: "Avatar storage is not configured" }, { status: 503 });
    const file = (await request.formData()).get("avatar");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
    const error = getAvatarUploadValidationError({ mimeType: file.type, size: file.size }) ?? getAvatarFileSignatureValidationError({ mimeType: file.type, bytes: new Uint8Array(await file.slice(0, 16).arrayBuffer()) });
    if (error) return NextResponse.json({ error }, { status: 400 });
    uploadedAvatarKey = await uploadAvatarObject({ avatarPathname: buildAvatarObjectKey({ userId: `accounts/${user.id}`, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" }), body: file, contentType: file.type });
    const updated = await prisma.user.updateMany({ where: { id: user.id, avatarKey: user.avatarKey }, data: { avatarKey: uploadedAvatarKey } });
    if (!updated.count) {
      await rollbackUploadedAvatar({ uploadedAvatarKey });
      return NextResponse.json({ error: "Your photo changed. Refresh and try again" }, { status: 409 });
    }
    await cleanupSupersededAvatar({ previousAvatarKey: user.avatarKey, nextAvatarKey: uploadedAvatarKey });
    return NextResponse.json({ avatarUrl: resolveAvatarUrl(uploadedAvatarKey) });
  } catch (error) {
    await rollbackUploadedAvatar({ uploadedAvatarKey });
    logError("Account photo upload", error); return safeErrorResponse();
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await target(request); if (access.response) return access.response;
    const user = access.user!;
    const updated = await prisma.user.updateMany({ where: { id: user.id, avatarKey: user.avatarKey }, data: { avatarKey: null } });
    if (!updated.count) return NextResponse.json({ error: "Your photo changed. Refresh and try again" }, { status: 409 });
    await cleanupSupersededAvatar({ previousAvatarKey: user.avatarKey, nextAvatarKey: null });
    return NextResponse.json({ avatarUrl: null });
  } catch (error) { logError("Account photo removal", error); return safeErrorResponse(); }
}
