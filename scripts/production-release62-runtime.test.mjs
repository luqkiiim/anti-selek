import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PROJECT,TEAM,ALIASES} from './production-release62-evidence.mjs';
import {REQUEST_LOG_ENDPOINT,runtimeQuery,requestIdFromVercelHeader,captureRuntimeWindow,buildRuntimeEvidence,validateRuntimeEvidence,collectRuntimeEvidence,publicRuntimeScope,PUBLIC_RUNTIME_ALIASES} from './production-release62-runtime.mjs';

const scope={projectId:'prj_test',teamId:'team_test',deploymentId:'dpl_test',host:'test.vercel.app'};
const start=Date.parse('2026-10-13T00:00:00Z');
const iso=ms=>new Date(ms).toISOString();
const since=iso(start),until=iso(start+3000);
const freeze='Rate limit storage error SQLITE_CONSTRAINT PRODUCTION_RELEASE62_WRITES_FROZEN';
function row(path,index,status=200,logs=[]) {
  const time=start+1000+index*100;
  return {requestId:`node${index}-${time}-abcdef12345${index}`,timestamp:time,deploymentId:scope.deploymentId,environment:'production',domain:scope.host,requestMethod:'GET',requestPath:path,statusCode:status,events:[{source:path==='/'?'static':'serverless'}],logs};
}
function page(rows,{left=since,right=until,observedAt=iso(start+13000),hasMoreRows=false}={}) {
  return {endpoint:REQUEST_LOG_ENDPOINT,method:'GET',query:runtimeQuery(scope,left,right),httpStatus:200,observedAt,serverDate:observedAt,raw:{rows,hasMoreRows}};
}
function capture(rows,observedAt=iso(start+13000)) {
  const p=page(structuredClone(rows),{observedAt});return {...structuredClone(p),pages:[p]};
}
function fixture() {
  const rows=[row('/',0),row('/api/auth/session',1,200,[{level:'error',message:freeze}]),row('/api/clubs/release-smoke/removed-players',2,401,[{level:'error',message:freeze}])];
  const smoke={deploymentId:scope.deploymentId,host:scope.host,smokeStartedAt:since,smokeResults:rows.map(r=>({host:scope.host,path:r.requestPath,method:'GET',status:r.statusCode,appResponse:true,observedAt:iso(start+2000),vercelId:`sin1::iad1::${r.requestId}`,requestId:r.requestId}))};
  return {rows,smoke,captures:[capture(rows),capture(rows,iso(start+23000))]};
}
const evidence=f=>buildRuntimeEvidence(f.captures,scope,f.smoke);
const verified=f=>validateRuntimeEvidence(evidence(f),scope,f.smoke);
function addRow(f,r){for(const c of f.captures){c.raw.rows.push(structuredClone(r));c.pages[0].raw.rows.push(structuredClone(r));}}

test('exact provider IDs bind all three smoke probes and both expected frozen writes',()=>{
  const f=fixture(),e=verified(f);
  assert.equal(e.errorCount,2);assert.equal(e.schemaFailureCount,0);
  assert.deepEqual(e.expectedFreezeErrors.map(r=>r.requestId).sort(),f.rows.slice(1).map(r=>r.requestId).sort());
});

test('header parsing strips only provider region hops and fails closed',()=>{
  assert.equal(requestIdFromVercelHeader('sin1::iad1::node-1791849600000-abcdef123456'),'node-1791849600000-abcdef123456');
  for(const bad of [null,'','node-1791849600000-abcdef123456','sin1::','sin1::node-1791849600000-abcdef123456, other','sin1::node-1791849600000-abcdef123456\n'])assert.throws(()=>requestIdFromVercelHeader(bad),/SMOKE_PROVIDER_REQUEST_ID_REQUIRED/);
});

test('same path, method and status from a different request cannot establish smoke visibility',()=>{
  const f=fixture();f.smoke.smokeResults[1].requestId='other-1791849600000-abcdef123456';f.smoke.smokeResults[1].vercelId=`sin1::${f.smoke.smokeResults[1].requestId}`;
  assert.throws(()=>evidence(f),/RUNTIME_SMOKE_VISIBILITY_REQUIRED/);
});

test('unrelated frozen-write errors are unexpected even with an identical successful smoke route',()=>{
  const f=fixture();addRow(f,row('/api/auth/session',3,200,[{level:'error',message:freeze}]));
  const e=evidence(f);assert.equal(e.unexpectedErrorCount,1);assert.equal(e.expectedFreezeErrors.length,2);
  assert.throws(()=>validateRuntimeEvidence(e,scope,f.smoke),/RUNTIME_EVIDENCE_INVALID/);
});

test('every probe, including the root document, needs provider log visibility',()=>{
  const f=fixture();for(const c of f.captures){c.raw.rows=c.raw.rows.slice(1);c.pages[0].raw.rows=c.pages[0].raw.rows.slice(1);}
  assert.throws(()=>evidence(f),/RUNTIME_SMOKE_VISIBILITY_REQUIRED/);
});

for(const level of ['info','warning','error','fatal'])for(const message of ['no such table: CommunityMember','no such column: mixedSideOverride','Prisma P2021 model missing','Prisma P2022 column missing','SQLITE_SCHEMA schema changed'])test(`${level} schema failure rejects evidence: ${message}`,()=>{
  const f=fixture();addRow(f,row('/api/other',4,200,[{level,message}]));
  const e=evidence(f);assert.equal(e.schemaFailureCount,1);
  assert.throws(()=>validateRuntimeEvidence(e,scope,f.smoke),/RUNTIME_EVIDENCE_INVALID/);
});

test('500 responses without error console logs reject evidence',()=>{
  const f=fixture();addRow(f,row('/api/other',4,500));const e=evidence(f);assert.equal(e.httpErrorCount,1);
  assert.throws(()=>validateRuntimeEvidence(e,scope,f.smoke),/RUNTIME_EVIDENCE_INVALID/);
});

test('truncated logs and missing raw completeness evidence fail closed',()=>{
  const f=fixture();f.captures[0].raw.rows[1].logs[0].messageTruncated=true;f.captures[0].pages[0].raw.rows[1].logs[0].messageTruncated=true;
  assert.throws(()=>evidence(f),/RUNTIME_LOG_TRUNCATED_OR_INVALID/);
  const g=fixture();delete g.captures[0].pages;assert.throws(()=>evidence(g),/RUNTIME_CAPTURE_INCOMPLETE/);
});

test('complete time bisection deduplicates boundary rows and preserves all 51 requests',async()=>{
  const rows=Array.from({length:51},(_,i)=>({...row('/api/traffic',i),timestamp:start+i*10}));let calls=0;
  const collected=await captureRuntimeWindow(scope,since,iso(start+500),{now:()=>iso(start+13000),fetchPage:async(_scope,left,right)=>{
    calls++;const matching=rows.filter(r=>r.timestamp>=Date.parse(left)&&r.timestamp<=Date.parse(right));
    return page(matching.slice(0,50),{left,right,hasMoreRows:matching.length>50});
  }});
  assert.equal(calls,3);assert.equal(collected.pages.length,3);assert.equal(collected.raw.rows.length,51);
  assert.equal(collected.raw.hasMoreRows,false);
});

test('saturated indivisible windows and provider pages without hasMoreRows fail closed',async()=>{
  await assert.rejects(captureRuntimeWindow(scope,since,iso(start+1),{fetchPage:async(_s,left,right)=>page([],{left,right,hasMoreRows:true})}),/RUNTIME_WINDOW_SATURATED/);
  await assert.rejects(captureRuntimeWindow(scope,since,until,{fetchPage:async()=>{const p=page([]);delete p.raw.hasMoreRows;return p;}}),/RUNTIME_CAPTURE_INCOMPLETE/);
});

test('time bisection rejects a parent request omitted by its allegedly complete children',async()=>{
  await assert.rejects(captureRuntimeWindow(scope,since,until,{fetchPage:async(_s,left,right)=>page(left===since&&right===until?[row('/api/other',4)]:[],{left,right,hasMoreRows:left===since&&right===until})}),/RUNTIME_INGESTION_NOT_STABLE/);
});

test('forged complete aggregate cannot hide a missing coverage leaf',()=>{
  const f=fixture();const parent=page(f.rows,{hasMoreRows:true});f.captures[0].pages=[parent];
  assert.throws(()=>evidence(f),/RUNTIME_CAPTURE_COVERAGE_INVALID/);
});

test('stable normalized logs do not hide changes to raw provider metadata',()=>{
  const f=fixture();f.captures[1].raw.rows[0].errorCode='FUNCTION_INVOCATION_FAILED';f.captures[1].pages[0].raw.rows[0].errorCode='FUNCTION_INVOCATION_FAILED';
  assert.throws(()=>evidence(f),/RUNTIME_INGESTION_NOT_STABLE/);
});

test('collector retries delayed visibility and verifies two fixed-window stable snapshots',async()=>{
  const f=fixture();let time=start+3000,calls=0;const windows=[];
  const e=await collectRuntimeEvidence(scope,f.smoke,{now:()=>iso(time),wait:async ms=>{time+=ms;},fetchPage:async(_s,left,right)=>{
    windows.push([left,right]);calls++;return page(calls<3?f.rows.slice(1):f.rows,{left,right,observedAt:iso(time)});
  }});
  assert.equal(calls,4);assert.equal(e.expectedFreezeErrors.length,2);
  assert.ok(windows.every(([left,right])=>left===since&&right===until));
});

test('missing correlation, changed header binding, duplicated IDs and status mismatches fail closed',()=>{
  for(const mutate of [
    f=>{delete f.smoke.smokeResults[0].vercelId;},
    f=>{f.smoke.smokeResults[0].requestId='unrelated';},
    f=>{f.smoke.smokeResults[0]={...f.smoke.smokeResults[1]};},
    f=>{f.smoke.smokeResults[1].status=201;},
  ]) {const f=fixture();mutate(f);assert.throws(()=>evidence(f),/SMOKE_PROVIDER_REQUEST_ID_REQUIRED|RUNTIME_SMOKE_BINDING_INVALID|RUNTIME_SMOKE_VISIBILITY_REQUIRED/);}
});

test('a fully verified bisection tree supports stable runtime evidence across page boundaries',async()=>{
  const f=fixture();f.rows.push(...Array.from({length:51},(_,i)=>({...row('/api/traffic',i+10),timestamp:start+500+i*40})));
  const make=observedAt=>captureRuntimeWindow(scope,since,until,{now:()=>observedAt,fetchPage:async(_s,left,right)=>{
    const matching=f.rows.filter(r=>r.timestamp>=Date.parse(left)&&r.timestamp<=Date.parse(right));
    return page(matching.slice(0,50),{left,right,observedAt,hasMoreRows:matching.length>50});
  }});
  f.captures=[await make(iso(start+13000)),await make(iso(start+23000))];
  assert.equal(verified(f).schemaFailureCount,0);assert.equal(f.captures[0].raw.rows.length,54);
  assert.ok(f.captures[0].pages.length>1);
});

test('overlapping boundary request changes reject capture rather than silently deduplicating',async()=>{
  const boundary={...row('/api/boundary',3),timestamp:start+1500};
  await assert.rejects(captureRuntimeWindow(scope,since,until,{fetchPage:async(_s,left,right)=>{
    if(left===since&&right===until)return page([boundary],{left,right,hasMoreRows:true});
    const changed=left!==since?{...boundary,statusCode:500}:boundary;
    return page([changed],{left,right});
  }}),/RUNTIME_INGESTION_NOT_STABLE/);
});

test('collector stops at its page bound even when a provider keeps saturating pages',async()=>{
  let calls=0;
  await assert.rejects(captureRuntimeWindow(scope,since,until,{fetchPage:async(_s,left,right)=>{calls++;return page([],{left,right,hasMoreRows:Date.parse(right)-Date.parse(left)>10});}}),/RUNTIME_COLLECTION_BOUND_EXCEEDED/);
  assert.equal(calls,128);
});

function publicFixture() {
  const publicScope=publicRuntimeScope({projectId:PROJECT,teamId:TEAM,deploymentId:scope.deploymentId,host:'anti-selek-current-luqkiiims-projects.vercel.app'});
  const rows=[row('/',0),row('/api/auth/session',1)].map(r=>({...r,domain:ALIASES[0]}));
  const smoke={deploymentId:publicScope.deploymentId,host:publicScope.host,smokeStartedAt:since,smokeResults:rows.map(r=>({host:r.domain,path:r.requestPath,method:'GET',status:200,appResponse:true,observedAt:iso(start+2000),vercelId:`sin1::iad1::${r.requestId}`,requestId:r.requestId,protectionBypassSent:false,redirectsFollowed:false}))};
  const captures=[iso(start+13000),iso(start+23000)].map(observedAt=>{
    const p={...page(structuredClone(rows),{observedAt}),query:runtimeQuery(publicScope,since,until)};
    return {...structuredClone(p),pages:[p]};
  });
  return {rows,smoke,captures,scope:publicScope};
}
const publicEvidence=f=>buildRuntimeEvidence(f.captures,f.scope,f.smoke);
const publicVerified=(f,now=start+30000)=>validateRuntimeEvidence(publicEvidence(f),f.scope,f.smoke,{now});

test('public runtime scope exactly pins project/team, immutable host and four reviewed aliases',()=>{
  assert.deepEqual(PUBLIC_RUNTIME_ALIASES,ALIASES);
  const f=publicFixture();assert.deepEqual(f.scope.approvedHosts,[f.scope.host,...ALIASES].sort());
  assert.equal(runtimeQuery(f.scope,since,until).environment,'production');
  for(const mutate of [s=>{s.teamId='team_other';},s=>{s.projectId='prj_other';},s=>{s.approvedHosts.push('foreign.example');},s=>{s.approvedHosts.pop();},s=>{s.visibility='preview';}]){
    const bad=structuredClone(f.scope);mutate(bad);assert.throws(()=>runtimeQuery(bad,since,until),/RUNTIME_PUBLIC_SCOPE_INVALID/);
  }
});

test('fresh public evidence accepts all approved host traffic with no freeze exceptions',()=>{
  const f=publicFixture();for(const [i,host] of f.scope.approvedHosts.entries())addRow(f,{...row('/api/traffic',i+10),timestamp:start+1500,domain:host});
  const e=publicVerified(f);assert.equal(e.gate,'public-completion');assert.equal(e.errorCount,0);assert.equal(e.freezeFailureCount,0);assert.deepEqual(e.expectedFreezeErrors,[]);
  assert.equal(e.captures[1].raw.rows.length,7);
});

for(const host of ['foreign.example','anti-selek-old-luqkiiims-projects.vercel.app','antiselek.com.attacker.example'])test(`public evidence rejects foreign host ${host}`,()=>{
  const f=publicFixture();addRow(f,{...row('/api/traffic',4),domain:host});assert.throws(()=>publicEvidence(f),/RUNTIME_ROW_SCOPE_INVALID/);
});

for(const level of ['info','warning','error','fatal'])test(`public gate rejects frozen-write messages at ${level}`,()=>{
  const f=publicFixture();for(const c of f.captures)for(const rows of [c.raw.rows,c.pages[0].raw.rows])rows[1].logs=[{level,message:freeze}];
  const e=publicEvidence(f);assert.equal(e.freezeFailureCount,1);assert.deepEqual(e.expectedFreezeErrors,[]);
  if(['error','fatal'].includes(level))assert.equal(e.unexpectedErrorCount,1);
  assert.throws(()=>publicVerified(f),/RUNTIME_(PUBLIC_)?EVIDENCE_INVALID/);
});

for(const [level,message,status] of [['warning','no such table: User',200],['error','Unhandled app error',200],['fatal','Function crashed',200],['info','ok',500]])test(`public gate rejects ${level} ${message} HTTP${status}`,()=>{
  const f=publicFixture();addRow(f,{...row('/api/other',4,status,[{level,message}]),domain:ALIASES[1]});assert.throws(()=>publicVerified(f),/RUNTIME_EVIDENCE_INVALID/);
});

test('public smoke requires fresh exact provider IDs on the canonical public root/session without bypass',()=>{
  for(const mutate of [
    f=>{f.smoke.smokeResults[0].protectionBypassSent=true;},
    f=>{f.smoke.smokeResults[1].observedAt=iso(start-1);},
    f=>{for(const c of f.captures)for(const rows of [c.raw.rows,c.pages[0].raw.rows])rows[1].domain=ALIASES[1];},
    f=>{f.smoke.smokeResults[0].requestId='unrelated';},
    f=>{f.smoke.smokeResults.pop();},
  ]){const f=publicFixture();mutate(f);assert.throws(()=>publicVerified(f),/RUNTIME_PUBLIC_SMOKE_REQUIRED|RUNTIME_SMOKE_(BINDING_INVALID|VISIBILITY_REQUIRED|SCOPE_INVALID)/);}
  assert.throws(()=>publicVerified(publicFixture(),start+900001),/RUNTIME_PUBLIC_EVIDENCE_INVALID/);
});

test('public collection uses a fresh fixed full window and stable complete captures',async()=>{
  const f=publicFixture();let time=start+3000,calls=0;
  const e=await collectRuntimeEvidence(f.scope,f.smoke,{now:()=>iso(time),wait:async ms=>{time+=ms;},fetchPage:async(target,left,right)=>{
    calls++;return {...page(structuredClone(f.rows),{left,right,observedAt:iso(time)}),query:runtimeQuery(target,left,right)};
  }});
  assert.equal(calls,2);assert.equal(e.since,since);assert.equal(e.until,until);assert.equal(e.gate,'public-completion');
  assert.doesNotThrow(()=>validateRuntimeEvidence(e,f.scope,f.smoke,{now:time}));
});
