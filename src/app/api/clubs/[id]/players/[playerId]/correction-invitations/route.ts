import { correctionInvitationPost } from "@/lib/playerInvitationApi";

type Context = { params: Promise<{ id: string; playerId: string }> };
export function POST(request: Request, context: Context) { return correctionInvitationPost(request, context); }
