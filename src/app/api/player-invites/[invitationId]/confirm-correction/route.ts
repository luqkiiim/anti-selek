import { invitationConfirmCorrectionPost } from "@/lib/playerInvitationApi";

type Context = { params: Promise<{ invitationId: string }> };
export function POST(request: Request, context: Context) { return invitationConfirmCorrectionPost(request, context); }
