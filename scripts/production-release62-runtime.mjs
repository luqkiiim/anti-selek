import fs from 'node:fs';
import path from 'node:path';
import { demand, hash, stable } from './production-release62.mjs';

// Installed Vercel CLI 62.2.0 fetchRequestLogs uses this endpoint, page=0,
// rows[].requestId, and hasMoreRows. Preserve raw pages, without level/source
// filters. Do not infer completeness from a CLI limit or an empty next page.
export const REQUEST_LOG_ENDPOINT='https://vercel.com/api/logs/request-logs';
export const PUBLIC_RUNTIME_ALIASES=['antiselek.com','anti-selek.vercel.app','anti-selek-luqkiiims-projects.vercel.app','anti-selek-git-main-luqkiiims-projects.vercel.app'];
const PUBLIC_PROJECT='prj_qouB4g5zkv4d8nL2g4NjLfdvjfeY',PUBLIC_TEAM='team_sS6kaZurbqCwtgU9VGhynSMR';
const MAX_PAGES=128,MAX_DEPTH=20,MAX_ROWS=1000;
const levels=new Set(['info','warning','error','fatal']);
const schemaFailure=/no such (?:table|column)|missing[\s._-]*(?:table|column)|(?:table|column)[^\n]*(?:does not exist|not found)|P2021|P2022|SQLITE_SCHEMA|SQLITE_ERROR|SQLITE_AUTH|schema[^\n]*(?:mismatch|invalid|missing|not found|changed)/i;
const timestamp=value=>typeof value==='number'?value:Date.parse(value);
const iso=value=>new Date(value).toISOString();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>hash(stable(canonical(value)));

// Vercel documents x-vercel-id as region hops followed by a unique proxy ID:
// https://vercel.com/docs/headers/request-headers#x-vercel-id
// Existing authenticated raw request-log captures store that final opaque ID
// (e.g. qrh28-1791816558132-2cdcd4460814), without the region hops.
export function requestIdFromVercelHeader(value) {
  demand(typeof value==='string'&&/^(?:[a-z]{3}\d::)+[a-z0-9]+-\d{13}-[a-f0-9]+$/.test(value),'SMOKE_PROVIDER_REQUEST_ID_REQUIRED');
  return value.split('::').at(-1);
}

export function publicRuntimeScope({projectId,teamId,deploymentId,host}) {
  const scope={projectId,teamId,deploymentId,host,visibility:'public',approvedHosts:[host,...PUBLIC_RUNTIME_ALIASES].sort()};
  runtimeHosts(scope);return scope;
}
function runtimeHosts(scope) {
  if(scope.visibility===undefined) {demand(scope.approvedHosts===undefined,'RUNTIME_SCOPE_INVALID');return [scope.host];}
  demand(scope.visibility==='public'&&scope.projectId===PUBLIC_PROJECT&&scope.teamId===PUBLIC_TEAM
    &&typeof scope.host==='string'&&/^anti-selek-[a-z0-9-]+-luqkiiims-projects\.vercel\.app$/.test(scope.host)&&!PUBLIC_RUNTIME_ALIASES.includes(scope.host)
    &&stable(scope.approvedHosts)===stable([scope.host,...PUBLIC_RUNTIME_ALIASES].sort()),'RUNTIME_PUBLIC_SCOPE_INVALID');
  return scope.approvedHosts;
}

export function runtimeQuery(scope,since,until) {
  runtimeHosts(scope);
  demand(/^prj_[A-Za-z0-9]+$/.test(scope.projectId)&&/^team_[A-Za-z0-9]+$/.test(scope.teamId)&&/^dpl_[A-Za-z0-9]+$/.test(scope.deploymentId),'RUNTIME_SCOPE_INVALID');
  const start=Date.parse(since),end=Date.parse(until);
  demand(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<900000,'RUNTIME_WINDOW_INVALID');
  return {projectId:scope.projectId,ownerId:scope.teamId,deploymentId:scope.deploymentId,environment:'production',startDate:String(start),endDate:String(end),page:'0'};
}

export async function readVercelRequestLogPage(scope,since,until) {
  const query=runtimeQuery(scope,since,until);
  const authPath=path.resolve('private/vercel-cli/auth.json');
  const stat=fs.lstatSync(authPath);demand(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'VERCEL_AUTH_FILE_INVALID');
  const auth=JSON.parse(fs.readFileSync(authPath,'utf8'));
  demand(typeof auth.token==='string'&&auth.token.length>0,'EXISTING_VERCEL_AUTH_REQUIRED');
  const response=await fetch(`${REQUEST_LOG_ENDPOINT}?${new URLSearchParams(query)}`,{method:'GET',headers:{Authorization:`Bearer ${auth.token}`},redirect:'manual',signal:AbortSignal.timeout(20000)});
  demand(response.status===200&&response.headers.get('content-type')?.includes('application/json'),'RUNTIME_AUTHENTICATED_RESPONSE_REQUIRED');
  const raw=await response.json();
  return {endpoint:REQUEST_LOG_ENDPOINT,method:'GET',query,httpStatus:response.status,serverDate:response.headers.get('date'),observedAt:new Date().toISOString(),raw};
}

function validatePage(capture,scope,since,until) {
  demand(capture?.endpoint===REQUEST_LOG_ENDPOINT&&capture.method==='GET'&&capture.httpStatus===200&&stable(capture.query)===stable(runtimeQuery(scope,since,until)),'RUNTIME_CAPTURE_BINDING_INVALID');
  demand(Number.isFinite(Date.parse(capture.observedAt))&&Date.parse(capture.observedAt)>=Date.parse(until)
    &&Number.isFinite(Date.parse(capture.serverDate))&&Math.abs(Date.parse(capture.serverDate)-Date.parse(capture.observedAt))<300000,'RUNTIME_CAPTURE_TIME_INVALID');
  demand(Array.isArray(capture.raw?.rows)&&typeof capture.raw.hasMoreRows==='boolean'&&capture.raw.rows.length<MAX_ROWS,'RUNTIME_CAPTURE_INCOMPLETE');
  const ids=new Set();
  for(const row of capture.raw.rows) {
    demand(typeof row.requestId==='string'&&row.requestId.length>0&&!ids.has(row.requestId),'RUNTIME_REQUEST_ID_INVALID');ids.add(row.requestId);
    const time=timestamp(row.timestamp);
    demand(row.deploymentId===scope.deploymentId&&row.environment==='production'&&runtimeHosts(scope).includes(row.domain)
      &&Number.isFinite(time)&&time>=Date.parse(since)&&time<=Date.parse(until),'RUNTIME_ROW_SCOPE_INVALID');
  }
}
function uniqueRows(rows) {
  const unique=new Map();
  for(const row of rows) {
    const previous=unique.get(row.requestId);
    demand(!previous||digest(previous)===digest(row),'RUNTIME_INGESTION_NOT_STABLE');unique.set(row.requestId,row);
  }
  demand(unique.size<MAX_ROWS,'RUNTIME_CAPTURE_INCOMPLETE');
  return [...unique.values()].sort((a,b)=>a.requestId.localeCompare(b.requestId));
}

// Saturated pages are bisected at overlapping millisecond boundaries. Every
// leaf must explicitly be complete. Dense indivisible windows fail closed.
export async function captureRuntimeWindow(scope,since,until,{fetchPage=readVercelRequestLogPage,now=()=>new Date().toISOString()}={}) {
  runtimeQuery(scope,since,until);const pages=[];
  async function window(left,right,depth=0) {
    demand(depth<=MAX_DEPTH&&pages.length<MAX_PAGES,'RUNTIME_COLLECTION_BOUND_EXCEEDED');
    const capture=await fetchPage(scope,iso(left),iso(right));validatePage(capture,scope,iso(left),iso(right));pages.push(capture);
    if(!capture.raw.hasMoreRows)return capture.raw.rows;
    demand(right-left>=2,'RUNTIME_WINDOW_SATURATED');
    const mid=Math.floor((left+right)/2);
    const rows=uniqueRows([...await window(left,mid,depth+1),...await window(mid,right,depth+1)]);
    const complete=new Map(rows.map(row=>[row.requestId,row]));
    demand(capture.raw.rows.every(row=>complete.has(row.requestId)&&digest(complete.get(row.requestId))===digest(row)),'RUNTIME_INGESTION_NOT_STABLE');
    return rows;
  }
  const rows=uniqueRows(await window(Date.parse(since),Date.parse(until)));
  return {...pages[0],observedAt:now(),serverDate:pages.at(-1).serverDate,pages,raw:{rows,hasMoreRows:false}};
}

function capturedRows(capture,scope,since,until) {
  validatePage(capture,scope,since,until);
  demand(capture.raw.hasMoreRows===false&&Array.isArray(capture.pages)&&capture.pages.length>0&&capture.pages.length<=MAX_PAGES,'RUNTIME_CAPTURE_INCOMPLETE');
  let index=0;
  function window(left,right,depth=0) {
    demand(depth<=MAX_DEPTH&&index<capture.pages.length,'RUNTIME_CAPTURE_COVERAGE_INVALID');
    const page=capture.pages[index++];validatePage(page,scope,iso(left),iso(right));
    demand(Date.parse(page.observedAt)<=Date.parse(capture.observedAt),'RUNTIME_CAPTURE_TIME_INVALID');
    if(!page.raw.hasMoreRows)return page.raw.rows;
    demand(right-left>=2,'RUNTIME_WINDOW_SATURATED');const mid=Math.floor((left+right)/2);
    const rows=uniqueRows([...window(left,mid,depth+1),...window(mid,right,depth+1)]);
    const complete=new Map(rows.map(row=>[row.requestId,row]));
    demand(page.raw.rows.every(row=>complete.has(row.requestId)&&digest(complete.get(row.requestId))===digest(row)),'RUNTIME_INGESTION_NOT_STABLE');
    return rows;
  }
  const complete=uniqueRows(window(Date.parse(since),Date.parse(until)));
  demand(index===capture.pages.length&&digest(complete)===digest(uniqueRows(capture.raw.rows)),'RUNTIME_CAPTURE_COVERAGE_INVALID');
  return complete.map(row=>{
    demand(Number.isInteger(row.statusCode)&&row.statusCode>=100&&row.statusCode<600,'RUNTIME_HTTP_STATUS_PENDING');
    demand(typeof row.requestMethod==='string'&&typeof row.requestPath==='string'&&Array.isArray(row.logs)&&Array.isArray(row.events),'RUNTIME_ROW_INVALID');
    const sources=row.events.map(event=>event.source);
    demand(sources.every(source=>['serverless','edge-function','edge-middleware','static','external'].includes(source)),'RUNTIME_SOURCE_INVALID');
    const logs=row.logs.map(log=>{
      demand(levels.has(log.level)&&typeof log.message==='string'&&(log.messageTruncated===undefined||log.messageTruncated===false),'RUNTIME_LOG_TRUNCATED_OR_INVALID');
      return {level:log.level,message:log.message,messageTruncated:false};
    });
    return {requestId:row.requestId,deploymentId:row.deploymentId,host:row.domain,environment:row.environment,observedAt:iso(timestamp(row.timestamp)),method:row.requestMethod,path:row.requestPath,status:row.statusCode,sources,logs};
  });
}

export function buildRuntimeEvidence(captures,scope,smoke) {
  const publicGate=scope.visibility==='public',hosts=runtimeHosts(scope);
  const since=smoke.smokeStartedAt,until=captures?.[0]?.query?.endDate&&iso(Number(captures[0].query.endDate));
  demand(Array.isArray(captures)&&captures.length===2&&until,'TWO_RUNTIME_CAPTURES_REQUIRED');
  const first=capturedRows(captures[0],scope,since,until),rows=capturedRows(captures[1],scope,since,until);
  demand(Date.parse(captures[1].observedAt)>=Date.parse(captures[0].observedAt)+10000&&digest(first)===digest(rows)
    &&digest(uniqueRows(captures[0].raw.rows))===digest(uniqueRows(captures[1].raw.rows)),'RUNTIME_INGESTION_NOT_STABLE');
  demand(smoke.deploymentId===scope.deploymentId&&smoke.host===scope.host&&Array.isArray(smoke.smokeResults)&&(publicGate?smoke.smokeResults.length>=2:smoke.smokeResults.length===3),'RUNTIME_SMOKE_SCOPE_INVALID');
  if(publicGate)demand(['/','/api/auth/session'].every(path=>smoke.smokeResults.filter(result=>result.host===PUBLIC_RUNTIME_ALIASES[0]&&result.path===path&&result.status===200).length===1)
    &&smoke.smokeResults.every(result=>result.protectionBypassSent===false&&result.redirectsFollowed===false),'RUNTIME_PUBLIC_SMOKE_REQUIRED');
  const smokeIds=new Set();
  for(const result of smoke.smokeResults) {
    const requestId=requestIdFromVercelHeader(result.vercelId);
    demand(result.requestId===requestId&&!smokeIds.has(requestId)&&hosts.includes(result.host)&&result.method==='GET'&&result.appResponse===true
      &&Date.parse(result.observedAt)>=Date.parse(since)&&Date.parse(result.observedAt)<=Date.parse(until),'RUNTIME_SMOKE_BINDING_INVALID');
    smokeIds.add(requestId);
    demand(rows.some(row=>row.requestId===requestId&&row.host===result.host&&row.path===result.path&&row.method===result.method&&row.status===result.status
      &&Date.parse(row.observedAt)<=Date.parse(result.observedAt)),'RUNTIME_SMOKE_VISIBILITY_REQUIRED');
  }
  const schemaFailures=rows.flatMap(row=>row.logs.filter(log=>schemaFailure.test(log.message)).map(log=>({requestId:row.requestId,level:log.level})));
  const freezeFailures=publicGate?rows.flatMap(row=>row.logs.filter(log=>/PRODUCTION_RELEASE62_WRITES_FROZEN/.test(log.message))):[];
  const errors=rows.flatMap(row=>row.logs.filter(log=>['error','fatal'].includes(log.level)).map(log=>({row,log})));
  const expected=[],unexpected=[];
  for(const {row,log} of errors) {
    const allowed=!publicGate&&row.method==='GET'&&row.sources.includes('serverless')&&log.level==='error'
      &&['/api/auth/session','/api/clubs/release-smoke/removed-players'].includes(row.path)
      &&smoke.smokeResults.some(s=>s.requestId===row.requestId&&s.path===row.path&&s.status===row.status&&s.method==='GET'&&s.appResponse===true)
      &&/Rate limit storage error/.test(log.message)&&/SQLITE_CONSTRAINT/.test(log.message)&&/PRODUCTION_RELEASE62_WRITES_FROZEN/.test(log.message)
      &&!schemaFailure.test(log.message);
    if(allowed)expected.push({requestId:row.requestId,path:row.path,deploymentId:row.deploymentId,method:row.method,level:log.level,source:'function',classification:'Rate limit storage error',code:'SQLITE_CONSTRAINT',constraint:'PRODUCTION_RELEASE62_WRITES_FROZEN',observedAt:row.observedAt});
    else unexpected.push({requestId:row.requestId,level:log.level});
  }
  return {version:2,source:'authenticated-vercel-runtime-logs',...(publicGate?{gate:'public-completion',freezeFailureCount:freezeFailures.length}:{}),scope,since,until,observedAt:captures[1].observedAt,captures,rawRowsSha256:digest(rows),errorCount:errors.length,unexpectedErrorCount:unexpected.length,schemaFailureCount:schemaFailures.length,httpErrorCount:rows.filter(row=>row.status>=500).length,expectedFreezeErrors:expected,
    collection:{groupBy:'level',countedLevels:['error','fatal'],scannedLevels:[...levels],captureComplete:true,rawLimit:MAX_ROWS,pageLimit:MAX_PAGES,returnedErrorRows:errors.length,groupedErrorCount:errors.filter(({log})=>log.level==='error').length,groupedFatalCount:errors.filter(({log})=>log.level==='fatal').length}};
}

export function validateRuntimeEvidence(runtime,scope,smoke,{now=Date.now()}={}) {
  demand(runtime?.version===2&&stable(runtime.scope)===stable(scope),'RUNTIME_EVIDENCE_SCOPE_INVALID');
  const rebuilt=buildRuntimeEvidence(runtime.captures,scope,smoke);
  demand(stable(rebuilt)===stable(runtime)&&runtime.unexpectedErrorCount===0&&runtime.httpErrorCount===0&&runtime.schemaFailureCount===0,'RUNTIME_EVIDENCE_INVALID');
  if(scope.visibility==='public')demand(runtime.freezeFailureCount===0&&runtime.errorCount===0&&runtime.expectedFreezeErrors.length===0
    &&now-Date.parse(runtime.since)>=0&&now-Date.parse(runtime.since)<900000&&now-Date.parse(runtime.observedAt)>=0&&now-Date.parse(runtime.observedAt)<900000,'RUNTIME_PUBLIC_EVIDENCE_INVALID');
  return rebuilt;
}

export async function collectRuntimeEvidence(scope,smoke,{fetchPage=readVercelRequestLogPage,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>new Date().toISOString()}={}) {
  const until=now();demand(smoke.smokeResults.every(result=>Date.parse(until)>=Date.parse(result.observedAt)),'RUNTIME_WINDOW_BEFORE_SMOKE');
  let previous;let lastError;
  for(let attempt=0;attempt<5;attempt++) {
    await wait(10000);
    let current;
    try {
      current=await captureRuntimeWindow(scope,smoke.smokeStartedAt,until,{fetchPage,now});
      capturedRows(current,scope,smoke.smokeStartedAt,until);
      if(previous)return buildRuntimeEvidence([previous,current],scope,smoke);
      previous=current;
    } catch(error) {
      if(!/PRODUCTION_RELEASE62_RUNTIME_(HTTP_STATUS_PENDING|INGESTION_NOT_STABLE|SMOKE_VISIBILITY_REQUIRED)$/.test(error.message))throw error;
      lastError=error;
      previous=error.message.endsWith('HTTP_STATUS_PENDING')?undefined:current;
    }
  }
  throw lastError??new Error('PRODUCTION_RELEASE62_RUNTIME_CAPTURE_INCOMPLETE');
}
