import { invitationConfirmAccessRestorePost } from "@/lib/playerInvitationApi";

type Context = { params: Promise<{ invitationId: string }> };
export function POST(request: Request, context: Context) { return invitationConfirmAccessRestorePost(request, context); }
