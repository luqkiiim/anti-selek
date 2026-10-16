import { editLineupRow } from "@/lib/sessionLineup";
import { collaborationRoute } from "../../collaboration/handler";
export const dynamic="force-dynamic";
export async function PATCH(request:Request,{params}:{params:Promise<{code:string;rowId:string}>}) {
  return collaborationRoute(request,params,true,(db,id,actor,body,rowId)=>editLineupRow(db,id,rowId!,actor,body));
}
