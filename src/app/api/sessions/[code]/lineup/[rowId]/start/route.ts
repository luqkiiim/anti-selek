import { startLineupRow } from "@/lib/sessionLineup";
import { collaborationRoute } from "../../../collaboration/handler";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{code:string;rowId:string}>}) {
  return collaborationRoute(request,params,true,(db,id,actor,body,rowId)=>startLineupRow(db,id,rowId!,actor,body));
}
