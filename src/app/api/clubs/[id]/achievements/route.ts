import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canQuickAccessClub, isQuickAccessSession } from "@/lib/quickAccess";
import { getClubAchievementCollection, saveAchievementPreferences } from "@/lib/clubAchievementService";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";
import { z } from "zod";
import type { AchievementId } from "@/lib/clubAchievements";

const preferences=z.object({showcase:z.array(z.string().max(50)).max(3).optional(),seen:z.array(z.object({id:z.string().max(50),tier:z.number().int().min(1).max(3)})).max(33).optional()}).strict();
async function handle(request:Request,context:{params:Promise<{id:string}>},write:boolean) {
  try {
    const limit=await rateLimit(request,"api:club:achievements",{limit:60,windowMs:60000});if(limit)return limit;
    const session=await auth();if(!session?.user?.id)return NextResponse.json({error:"Not authenticated"},{status:401});
    const {id:clubId}=await context.params;
    if(!canQuickAccessClub(session,clubId))return NextResponse.json({error:"Club unavailable"},{status:404});
    const member=await prisma.clubMember.findUnique({where:{clubId_userId:{clubId,userId:session.user.id}},select:{id:true}});
    if(!member)return NextResponse.json({error:"Club unavailable"},{status:404});
    if(write) {
      if(isQuickAccessSession(session))return NextResponse.json({error:"Sign in to save your collection"},{status:403});
      const parsed=preferences.safeParse(await request.json().catch(()=>null));
      if(!parsed.success)return NextResponse.json({error:"Invalid achievement preferences"},{status:400});
      const input=parsed.data as {showcase?:AchievementId[];seen?:{id:AchievementId;tier:number}[]};
      if(!await saveAchievementPreferences(clubId,session.user.id,input))return NextResponse.json({error:"Only earned badges can be selected"},{status:400});
    }
    return NextResponse.json(await getClubAchievementCollection(clubId,session.user.id));
  }catch(error){logError("Club achievements error",error);return safeErrorResponse();}
}
export const GET=(request:Request,context:{params:Promise<{id:string}>})=>handle(request,context,false);
export const PATCH=(request:Request,context:{params:Promise<{id:string}>})=>handle(request,context,true);
