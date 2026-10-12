import fs from 'node:fs';
import path from 'node:path';
import { demand, hash, stable } from './production-release61.mjs';

// This is the same authenticated request-log endpoint used by Vercel CLI63.1.2
// fetchRequestLogs. Collect the entire window, without level/source filtering,
// so an HTTP500 without an application console error cannot be hidden.
export const REQUEST_LOG_ENDPOINT='https://vercel.com/api/logs/request-logs';
const levels=new Set(['info','warning','error','fatal']);
const timestamp=value=>typeof value==='number'?value:Date.parse(value);
const iso=value=>new Date(value).toISOString();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>hash(stable(canonical(value)));

export function runtimeQuery(scope,since,until) {
  demand(/^prj_[A-Za-z0-9]+$/.test(scope.projectId)&&/^team_[A-Za-z0-9]+$/.test(scope.teamId)&&/^dpl_[A-Za-z0-9]+$/.test(scope.deploymentId),'RUNTIME_SCOPE_INVALID');
  const start=Date.parse(since),end=Date.parse(until);
  demand(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<900000,'RUNTIME_WINDOW_INVALID');
  return {projectId:scope.projectId,ownerId:scope.teamId,deploymentId:scope.deploymentId,environment:'production',startDate:String(start),endDate:String(end)};
}

export async function readVercelRequestLogPage(scope,since,until) {
  const query=runtimeQuery(scope,since,until);
  const authPath=path.join(process.env.APPDATA??'C:/Users/pc/AppData/Roaming','com.vercel.cli','Data','auth.json');
  const stat=fs.lstatSync(authPath);demand(stat.isFile()&&!stat.isSymbolicLink(),'VERCEL_AUTH_FILE_INVALID');
  const auth=JSON.parse(fs.readFileSync(authPath,'utf8'));
  demand(typeof auth.token==='string'&&auth.token.length>0,'EXISTING_VERCEL_AUTH_REQUIRED');
  const response=await fetch(`${REQUEST_LOG_ENDPOINT}?${new URLSearchParams(query)}`,{method:'GET',headers:{Authorization:`Bearer ${auth.token}`},redirect:'manual',signal:AbortSignal.timeout(20000)});
  demand(response.status===200&&response.headers.get('content-type')?.includes('application/json'),'RUNTIME_AUTHENTICATED_RESPONSE_REQUIRED');
  const raw=await response.json();
  return {endpoint:REQUEST_LOG_ENDPOINT,method:'GET',query,httpStatus:response.status,serverDate:response.headers.get('date'),observedAt:new Date().toISOString(),raw};
}

function capturedRows(capture,scope,since,until) {
  demand(capture?.endpoint===REQUEST_LOG_ENDPOINT&&capture.method==='GET'&&capture.httpStatus===200&&stable(capture.query)===stable(runtimeQuery(scope,since,until)),'RUNTIME_CAPTURE_BINDING_INVALID');
  demand(Number.isFinite(Date.parse(capture.observedAt))&&Date.parse(capture.observedAt)>=Date.parse(until)
    &&Number.isFinite(Date.parse(capture.serverDate))&&Math.abs(Date.parse(capture.serverDate)-Date.parse(capture.observedAt))<300000,'RUNTIME_CAPTURE_TIME_INVALID');
  demand(Array.isArray(capture.raw?.rows)&&capture.raw.hasMoreRows===false&&capture.raw.rows.length<1000,'RUNTIME_CAPTURE_INCOMPLETE');
  const ids=new Set();
  return capture.raw.rows.map(row=>{
    const time=timestamp(row.timestamp);
    demand(typeof row.requestId==='string'&&row.requestId.length>0&&!ids.has(row.requestId),'RUNTIME_REQUEST_ID_INVALID');ids.add(row.requestId);
    demand(row.deploymentId===scope.deploymentId&&row.environment==='production'&&row.domain===scope.host
      &&Number.isFinite(time)&&time>=Date.parse(since)&&time<=Date.parse(until),'RUNTIME_ROW_SCOPE_INVALID');
    demand(Number.isInteger(row.statusCode)&&row.statusCode>=100&&row.statusCode<600,'RUNTIME_HTTP_STATUS_PENDING');
    demand(typeof row.requestMethod==='string'&&typeof row.requestPath==='string'&&Array.isArray(row.logs)&&Array.isArray(row.events),'RUNTIME_ROW_INVALID');
    const sources=row.events.map(event=>event.source);
    demand(sources.every(source=>['serverless','edge-function','edge-middleware','static','external'].includes(source)),'RUNTIME_SOURCE_INVALID');
    const logs=row.logs.map(log=>{
      demand(levels.has(log.level)&&typeof log.message==='string'&&(log.messageTruncated===undefined||log.messageTruncated===false),'RUNTIME_LOG_TRUNCATED_OR_INVALID');
      return {level:log.level,message:log.message,messageTruncated:false};
    });
    return {requestId:row.requestId,deploymentId:row.deploymentId,host:row.domain,environment:row.environment,observedAt:iso(time),method:row.requestMethod,path:row.requestPath,status:row.statusCode,sources,logs};
  }).sort((a,b)=>a.requestId.localeCompare(b.requestId));
}

export function buildRuntimeEvidence(captures,scope,smoke,{requireRequestVisibility=true}={}) {
  const since=smoke.smokeStartedAt,until=captures?.[0]?.query?.endDate&&iso(Number(captures[0].query.endDate));
  demand(Array.isArray(captures)&&captures.length===2&&until,'TWO_RUNTIME_CAPTURES_REQUIRED');
  const first=capturedRows(captures[0],scope,since,until),rows=capturedRows(captures[1],scope,since,until);
  demand(Date.parse(captures[1].observedAt)>=Date.parse(captures[0].observedAt)+10000&&digest(first)===digest(rows),'RUNTIME_INGESTION_NOT_STABLE');
  demand(smoke.deploymentId===scope.deploymentId&&smoke.host===scope.host&&Array.isArray(smoke.smokeResults),'RUNTIME_SMOKE_SCOPE_INVALID');
  if(requireRequestVisibility)for(const result of smoke.smokeResults.filter(result=>result.path.startsWith('/api/')))
    demand(rows.some(row=>row.path===result.path&&row.method==='GET'&&row.status===result.status),'RUNTIME_SMOKE_VISIBILITY_REQUIRED');
  const errors=rows.flatMap(row=>row.logs.filter(log=>['error','fatal'].includes(log.level)).map(log=>({row,log})));
  const expected=[],unexpected=[];
  for(const {row,log} of errors) {
    const allowed=row.method==='GET'&&row.sources.includes('serverless')&&log.level==='error'
      &&['/api/auth/session','/api/clubs/release-smoke/removed-players'].includes(row.path)
      &&smoke.smokeResults.some(s=>s.path===row.path&&s.status===row.status&&s.method==='GET'&&s.appResponse===true)
      &&/Rate limit storage error/.test(log.message)&&/SQLITE_CONSTRAINT/.test(log.message)&&/PRODUCTION_RELEASE61_WRITES_FROZEN/.test(log.message)
      &&!/no such table|missing.table|SQLITE_AUTH|SQLITE_ERROR|P2021|P2022/i.test(log.message);
    if(allowed)expected.push({requestId:row.requestId,path:row.path,deploymentId:row.deploymentId,method:row.method,level:log.level,source:'function',classification:'Rate limit storage error',code:'SQLITE_CONSTRAINT',constraint:'PRODUCTION_RELEASE61_WRITES_FROZEN',observedAt:row.observedAt});
    else unexpected.push({requestId:row.requestId,level:log.level});
  }
  return {version:2,source:'authenticated-vercel-runtime-logs',scope,since,until,observedAt:captures[1].observedAt,captures,rawRowsSha256:digest(rows),errorCount:errors.length,unexpectedErrorCount:unexpected.length,httpErrorCount:rows.filter(row=>row.status>=500).length,expectedFreezeErrors:expected,
    collection:{groupBy:'level',countedLevels:['error','fatal'],captureComplete:true,rawLimit:1000,returnedErrorRows:errors.length,groupedErrorCount:errors.filter(({log})=>log.level==='error').length,groupedFatalCount:errors.filter(({log})=>log.level==='fatal').length}};
}

export function validateRuntimeEvidence(runtime,scope,smoke) {
  demand(runtime?.version===2&&stable(runtime.scope)===stable(scope),'RUNTIME_EVIDENCE_SCOPE_INVALID');
  const rebuilt=buildRuntimeEvidence(runtime.captures,scope,smoke);
  demand(stable(rebuilt)===stable(runtime)&&runtime.unexpectedErrorCount===0&&runtime.httpErrorCount===0,'RUNTIME_EVIDENCE_INVALID');
  return rebuilt;
}

export async function collectRuntimeEvidence(scope,smoke,{fetchPage=readVercelRequestLogPage,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>new Date().toISOString()}={}) {
  // Fix the log window after every HTTP response completed, then let ingestion
  // settle. Both authenticated complete snapshots must describe that same window.
  const until=now();demand(smoke.smokeResults.every(result=>Date.parse(until)>=Date.parse(result.observedAt)),'RUNTIME_WINDOW_BEFORE_SMOKE');
  let previous;let lastError;
  for(let attempt=0;attempt<5;attempt++) {
    await wait(10000);const current=await fetchPage(scope,smoke.smokeStartedAt,until);
    try {
      capturedRows(current,scope,smoke.smokeStartedAt,until);
      if(previous) return buildRuntimeEvidence([previous,current],scope,smoke);
      previous=current;
    } catch(error) {
      if(!/PRODUCTION_RELEASE61_RUNTIME_(HTTP_STATUS_PENDING|INGESTION_NOT_STABLE|SMOKE_VISIBILITY_REQUIRED)$/.test(error.message))throw error;
      lastError=error;
      if(error.message.endsWith('HTTP_STATUS_PENDING'))previous=undefined;
      else previous=current;
    }
  }
  throw lastError??new Error('PRODUCTION_RELEASE61_RUNTIME_CAPTURE_INCOMPLETE');
}
