import { getCollaborationState, mutateCollaboration } from "@/lib/sessionCollaboration";
import { collaborationRoute } from "./handler";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}) {
  return collaborationRoute(request,params,false,(db,id,actor)=>getCollaborationState(db,id,actor));
}
export async function PATCH(request:Request,{params}:{params:Promise<{code:string}>}) {
  return collaborationRoute(request,params,true,async(db,id,actor,body)=>{await mutateCollaboration(db,id,actor,body);return getCollaborationState(db,id,actor);});
}
