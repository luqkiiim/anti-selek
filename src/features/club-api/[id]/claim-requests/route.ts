import { submitAdmissionApi, adminAdmissionListApi, admissionDiscoveryApi } from "@/lib/clubAdmissionApi";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return submitAdmissionApi(request, (await params).id, true);
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const clubId = (await context.params).id;
  const session = await auth();
  const access = session?.user?.id && !session.user.isQuickAccess ? await getClubAdminAccess(prisma, { clubId, userId: session.user.id, isGlobalAdmin: session.user.isAdmin }) : null;
  return access?.canAdmin ? adminAdmissionListApi(request, context) : admissionDiscoveryApi(request, clubId);
}
