import {test} from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const PROJECT='prj_qouB4g5zkv4d8nL2g4NjLfdvjfeY',TEAM='team_sS6kaZurbqCwtgU9VGhynSMR';
const ALIASES=['antiselek.com','anti-selek.vercel.app','anti-selek-luqkiiims-projects.vercel.app','anti-selek-git-main-luqkiiims-projects.vercel.app'];
import {REQUEST_LOG_ENDPOINT,runtimeQuery,requestIdFromVercelHeader,captureRuntimeWindow,buildRuntimeEvidence,validateRuntimeEvidence,collectRuntimeEvidence,publicRuntimeScope,PUBLIC_RUNTIME_ALIASES,normalizeRuntimeRow} from './production-release63-runtime.mjs';

const scope={projectId:'prj_test',teamId:'team_test',deploymentId:'dpl_test',host:'test.vercel.app'};
const start=Date.parse('2026-10-13T00:00:00Z');
const iso=ms=>new Date(ms).toISOString();
const since=iso(start),until=iso(start+3000);
const freeze='Rate limit storage error SQLITE_CONSTRAINT PRODUCTION_RELEASE63_WRITES_FROZEN';
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
  const smoke={deploymentId:publicScope.deploymentId,host:publicScope.host,smokeStartedAt:since,smokeResults:rows.map(r=>({host:r.domain,path:r.requestPath,method:'GET',status:200,appResponse:true,observedAt:iso(start+2000),vercelId:`sin1::iad1::${r.requestId}`,requestId:r.requestId,authorizationSent:false,protectionBypassSent:false,redirectsFollowed:false}))};
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

const sessionCode='01234567-89ab-cdef-0123-456789abcdef';
const sessionPath=`/api/sessions/${sessionCode}`;
function routeRow(suffix='') {return {...row(sessionPath+suffix,6),requestSearchParams:{view:'full'},providerMetadata:{nested:[{preserve:true}]}};}
function replaceLogs(f,index,logs) {for(const c of f.captures)for(const rows of [c.raw.rows,c.pages[0].raw.rows])rows[index].logs=structuredClone(logs);}

for(const suffix of ['', '/leaderboard', '/history', '/share-image'])test(`route-derived normalization is additive and immutable for ${suffix||'session'}`,()=>{
  const original=routeRow(suffix),before=structuredClone(original),normalized=normalizeRuntimeRow(original);
  assert.deepEqual(original,before);assert.equal(normalized.requestSearchParams.nxtPcode,sessionCode);
  delete normalized.requestSearchParams.nxtPcode;assert.deepEqual(normalized,before);
  original.requestSearchParams.nxtPcode=sessionCode;assert.deepEqual(normalizeRuntimeRow(original),original);
});

for(const [name,mutate] of Object.entries({
  conflicting:r=>{r.requestSearchParams.nxtPcode='different';},
  arrayValue:r=>{r.requestSearchParams.nxtPcode=[sessionCode];},
  unknownRoute:r=>{r.requestPath='/api/unrelated';r.requestSearchParams.nxtPcode=sessionCode;},
  ambiguousRoute:r=>{r.requestPath+='/extra';r.requestSearchParams.nxtPcode=sessionCode;},
  encodedRoute:r=>{r.requestPath=`/api/sessions/%30${sessionCode.slice(1)}`;r.requestSearchParams.nxtPcode=sessionCode;},
  uppercaseRoute:r=>{r.requestPath=sessionPath.toUpperCase();r.requestSearchParams.nxtPcode=sessionCode;},
  queryInRoute:r=>{r.requestPath+='?code=other';r.requestSearchParams.nxtPcode=sessionCode;},
  paramsArray:r=>{r.requestSearchParams=[];},
  missingParams:r=>{delete r.requestSearchParams;},
  paramsNull:r=>{r.requestSearchParams=null;},
}))test(`route normalization rejects ${name}`,()=>{const r=routeRow();mutate(r);assert.throws(()=>normalizeRuntimeRow(r),/PRODUCTION_RELEASE63_RUNTIME_(PARAM_|UNKNOWN_ROUTE_PARAM)/);});

test('stable captures accept only the asynchronous derived parameter and retain every original raw page',()=>{
  const f=fixture();addRow(f,routeRow());const before=structuredClone(f.captures);
  for(const rows of [f.captures[1].raw.rows,f.captures[1].pages[0].raw.rows])rows.at(-1).requestSearchParams.nxtPcode=sessionCode;
  const expected=structuredClone(f.captures),e=verified(f);assert.deepEqual(f.captures,expected);assert.deepEqual(e.captures,expected);
  assert.equal(Object.hasOwn(e.captures[0].pages[0].raw.rows.at(-1).requestSearchParams,'nxtPcode'),false);
  assert.equal(before[0].raw.rows.at(-1).requestSearchParams.view,'full');
});

for(const [name,mutate] of Object.entries({
  otherQuery:r=>{r.requestSearchParams.view='changed';},
  unknownQuery:r=>{r.requestSearchParams.unreviewed='new';},
  metadata:r=>{r.providerMetadata.nested[0].preserve=false;},
  logs:r=>{r.logs.push({level:'info',message:'late log'});},
  event:r=>{r.events.push({source:'static'});},
  arrayOrder:r=>{r.providerMetadata.nested.reverse();},
  missingKey:r=>{delete r.providerMetadata;},
}))test(`derived-field compatibility cannot hide ${name} drift`,()=>{
  const f=fixture(),r=routeRow();r.providerMetadata.nested.push({second:true});addRow(f,r);
  for(const rows of [f.captures[1].raw.rows,f.captures[1].pages[0].raw.rows]){rows.at(-1).requestSearchParams.nxtPcode=sessionCode;mutate(rows.at(-1));}
  assert.throws(()=>evidence(f),/PRODUCTION_RELEASE63_RUNTIME_INGESTION_NOT_STABLE/);
});

test('overlapping bisection may derive the parameter while preserving the parent and leaf raw values',async()=>{
  const boundary={...routeRow(),timestamp:start+1500};
  const collected=await captureRuntimeWindow(scope,since,until,{now:()=>iso(start+13000),fetchPage:async(_s,left,right)=>{
    const r=structuredClone(boundary),parent=left===since&&right===until;
    if(left!==since)r.requestSearchParams.nxtPcode=sessionCode;
    return page([r],{left,right,hasMoreRows:parent});
  }});
  assert.equal(collected.pages.length,3);assert.equal(collected.raw.rows.length,1);
  assert.equal(Object.hasOwn(collected.pages[0].raw.rows[0].requestSearchParams,'nxtPcode'),false);
  assert.equal(Object.hasOwn(collected.pages[1].raw.rows[0].requestSearchParams,'nxtPcode'),false);
  assert.equal(collected.pages[2].raw.rows[0].requestSearchParams.nxtPcode,sessionCode);
});

for(const level of ['info','warning','error','fatal'])test(`protected runtime rejects uncorrelated freeze diagnostics at ${level}`,()=>{
  const f=fixture();addRow(f,row('/api/other',5,200,[{level,message:freeze}]));
  const e=evidence(f);assert.equal(e.unexpectedFreezeFailureCount,1);assert.throws(()=>validateRuntimeEvidence(e,scope,f.smoke),/RUNTIME_EVIDENCE_INVALID/);
});

for(const [name,level,message] of [
  ['info on correlated probe','info',freeze],['warning on correlated probe','warning',freeze],
  ['fatal on correlated probe','fatal',freeze],['wrong release marker','error',freeze.replace('63_','62_')],
  ['mixed release markers','error',`${freeze} PRODUCTION_RELEASE62_WRITES_FROZEN`],
  ['missing storage classification','error','SQLITE_CONSTRAINT PRODUCTION_RELEASE63_WRITES_FROZEN'],
  ['different SQLite constraint','error','Rate limit storage error SQLITE_CONSTRAINT_NOTNULL PRODUCTION_RELEASE63_WRITES_FROZEN'],
  ['suffixed marker','error',`${freeze}_OTHER`],
  ['missing constraint code','error','Rate limit storage error PRODUCTION_RELEASE63_WRITES_FROZEN'],
  ['schema failure as well','error',`${freeze} no such table: User`],
])test(`protected runtime rejects ${name}`,()=>{
  const f=fixture();replaceLogs(f,1,[{level,message}]);assert.throws(()=>verified(f),/RUNTIME_EVIDENCE_INVALID/);
});

test('only one expected frozen rate-limit error per probe may be classified',()=>{
  const f=fixture();replaceLogs(f,1,[{level:'error',message:freeze},{level:'error',message:freeze}]);
  const e=evidence(f);assert.equal(e.expectedFreezeErrors.length,2);assert.equal(e.unexpectedErrorCount,1);assert.equal(e.unexpectedFreezeFailureCount,1);
  assert.throws(()=>verified(f),/RUNTIME_EVIDENCE_INVALID/);
});

test('public smoke rejects authorization and obsolete freeze markers at any level',()=>{
  const f=publicFixture();f.smoke.smokeResults[0].authorizationSent=true;assert.throws(()=>publicVerified(f),/RUNTIME_PUBLIC_SMOKE_REQUIRED/);
  for(const level of ['info','warning','error','fatal']) {const g=publicFixture();replaceLogs(g,1,[{level,message:'PRODUCTION_RELEASE62_WRITES_FROZEN'}]);assert.throws(()=>publicVerified(g),/RUNTIME_(PUBLIC_)?EVIDENCE_INVALID/);}
});

test('scope, explicit row completeness, timestamp and capture bindings fail closed',()=>{
  for(const mutate of [
    f=>{f.captures[1].query.page='1';},f=>{f.captures[1].query.level='error';},f=>{f.captures[1].query.source='serverless';},
    f=>{f.captures[1].raw.rows[0].deploymentId='dpl_other';},f=>{f.captures[1].raw.rows[0].environment='preview';},
    f=>{f.captures[1].raw.rows[0].timestamp=start-1;},f=>{f.captures[1].serverDate=iso(start-400000);},
    f=>{f.captures[1].raw.hasMoreRows=true;},f=>{f.captures[1].pages.push(structuredClone(f.captures[1].pages[0]));},
  ]) {const f=fixture();mutate(f);assert.throws(()=>evidence(f),/PRODUCTION_RELEASE63_RUNTIME_/);}
});


// Historical snapshots stay in ignored private/. Synthetic tests above are the
// portable suite; when the original artifacts exist, hash-pin and replay them
// directly so a normalized fixture copy cannot conceal lost raw evidence.
const manifestUrl=new URL('../private/production-release62/compatible-runtime-fixture-manifest.json',import.meta.url);
test('pinned historical provider pages stabilize without modifying the raw snapshots', {skip:!fs.existsSync(manifestUrl)},async()=>{
  const manifest=JSON.parse(fs.readFileSync(manifestUrl,'utf8'));
  const sha=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(sha(fs.readFileSync(new URL('./production-release62-runtime.mjs',import.meta.url))),manifest.nativeSourceSha256);
  const entries=Object.entries(manifest.fixtureHashes);assert.equal(entries.length,26);
  const records=entries.map(([name,expected])=>{
    assert.match(name,/^private\/production-release62\/runtime-diagnostic-1791867059557\/attempt-[01]-page-\d{3}\.json$/);
    const bytes=fs.readFileSync(new URL('../'+name,import.meta.url));assert.equal(sha(bytes),expected);
    return {name,page:JSON.parse(bytes)};
  });
  const opened=JSON.parse(fs.readFileSync(new URL('../private/production-release62/http-open-evidence.json',import.meta.url),'utf8'));
  const historicalScope=publicRuntimeScope(opened),captures=[];
  for(let attempt=0;attempt<2;attempt++) {
    const originals=records.filter(r=>r.name.includes(`attempt-${attempt}-`)).sort((a,b)=>a.name.localeCompare(b.name)).map(r=>r.page);
    const originalBytes=JSON.stringify(originals),since=iso(Number(originals[0].query.startDate)),until=iso(Number(originals[0].query.endDate));
    const collected=await captureRuntimeWindow(historicalScope,since,until,{now:()=>originals.at(-1).observedAt,fetchPage:async(_s,left,right)=>{
      const p=originals.find(p=>p.query.startDate===String(Date.parse(left))&&p.query.endDate===String(Date.parse(right)));
      assert.ok(p,'exact historical coverage page is required');return p;
    }});
    assert.equal(collected.raw.rows.length,136);assert.equal(collected.pages.length,13);
    assert.deepEqual(collected.pages,originals);assert.equal(JSON.stringify(originals),originalBytes);captures.push(collected);
  }
  assert.deepEqual(captures[0].raw.rows.map(normalizeRuntimeRow),captures[1].raw.rows.map(normalizeRuntimeRow));
});

for(const key of ['requestId','timestamp','deploymentId','environment','domain','requestMethod','requestPath','statusCode','logs','events'])test(`raw row requires ${key} even outside the smoke probes`,()=>{
  const f=fixture(),extra=row('/api/unrelated',5);delete extra[key];addRow(f,extra);
  assert.throws(()=>evidence(f),/PRODUCTION_RELEASE63_RUNTIME_/);
});

for(const mutate of [
  r=>{r.logs=[{level:'debug',message:'unreviewed level'}];},r=>{r.logs=[{level:'info'}];},r=>{r.events=[{source:'unknown'}];},
  r=>{r.statusCode=null;},r=>{r.statusCode=0;},r=>{r.logs=[{level:'info',message:'partial',messageTruncated:true}];},
])test('unavailable or unrecognized raw log detail cannot pass as complete evidence',()=>{
  const f=fixture(),extra=row('/api/unrelated',5);mutate(extra);addRow(f,extra);assert.throws(()=>evidence(f),/PRODUCTION_RELEASE63_RUNTIME_/);
});
