import { identityOptionsGet } from "@/lib/playerInvitationApi";

type Context = { params: Promise<{ id: string; playerId: string }> };
export function GET(request: Request, context: Context) { return identityOptionsGet(request, context); }
