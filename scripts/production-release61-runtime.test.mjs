import assert from 'node:assert/strict';
import test from 'node:test';
import {buildRuntimeEvidence,validateRuntimeEvidence,collectRuntimeEvidence,runtimeQuery,REQUEST_LOG_ENDPOINT} from './production-release61-runtime.mjs';

const scope={projectId:'prj_test',teamId:'team_test',deploymentId:'dpl_test',host:'anti-selek-test.vercel.app'};
function fixture() {
  const start=Date.now()-40000,since=new Date(start).toISOString(),until=new Date(start+10000).toISOString();
  const paths=['/','/api/auth/session','/api/clubs/release-smoke/removed-players'];
  const rows=paths.map((path,i)=>({requestId:`request-${i}`,deploymentId:scope.deploymentId,environment:'production',domain:scope.host,timestamp:new Date(start+1000+i).toISOString(),requestMethod:'GET',requestPath:path,statusCode:i===2?401:200,events:[{source:i?'serverless':'static'}],logs:[]}));
  const smoke={deploymentId:scope.deploymentId,host:scope.host,smokeStartedAt:since,smokeResults:rows.map(row=>({host:scope.host,path:row.requestPath,status:row.statusCode,method:'GET',appResponse:true,observedAt:new Date(start+5000).toISOString()}))};
  const captures=[0,1].map(i=>({endpoint:REQUEST_LOG_ENDPOINT,method:'GET',query:runtimeQuery(scope,since,until),httpStatus:200,serverDate:new Date(start+20000+i*11000).toUTCString(),observedAt:new Date(start+20000+i*11000).toISOString(),raw:{rows:structuredClone(rows),hasMoreRows:false}}));
  return {smoke,captures};
}
const freezeMessage='Rate limit storage error: SQLITE_CONSTRAINT: PRODUCTION_RELEASE61_WRITES_FROZEN';
test('two authenticated complete stable raw windows bind scope, HTTP visibility and exact counts',()=>{
  const {smoke,captures}=fixture();const evidence=buildRuntimeEvidence(captures,scope,smoke);validateRuntimeEvidence(evidence,scope,smoke);
  assert.equal(evidence.errorCount,0);assert.equal(evidence.httpErrorCount,0);assert.equal(evidence.collection.captureComplete,true);
});
test('frozen rate-limit errors are derived from raw messages and matching request metadata',()=>{
  const {smoke,captures}=fixture();for(const c of captures)for(const r of c.raw.rows.filter(row=>row.requestPath.startsWith('/api/')))r.logs.push({level:'error',message:freezeMessage,messageTruncated:false});
  const evidence=buildRuntimeEvidence(captures,scope,smoke);assert.equal(evidence.errorCount,2);assert.equal(evidence.unexpectedErrorCount,0);validateRuntimeEvidence(evidence,scope,smoke);
  const forged=structuredClone(evidence);forged.errorCount=0;assert.throws(()=>validateRuntimeEvidence(forged,scope,smoke),/EVIDENCE_INVALID/);
});
test('incomplete/truncated captures, wrong source/window/scope and missing request visibility fail closed',()=>{
  for(const mutate of [
    c=>{c[0].raw.hasMoreRows=true;},c=>{c[0].query.ownerId='team_other';},c=>{c[0].httpStatus=403;},
    c=>{c[0].raw.rows[0].deploymentId='dpl_other';},c=>{c[0].raw.rows[0].domain='other.vercel.app';},
    c=>{c[0].raw.rows[0].timestamp='1999-01-01';},c=>{c[0].raw.rows[0].logs=[{level:'error',message:freezeMessage,messageTruncated:true}];},
    c=>{c[1].observedAt=c[0].observedAt;},c=>{c[1].raw.rows[1].statusCode=500;},
    c=>{for(const p of c)p.raw.rows=p.raw.rows.filter(r=>r.requestPath!='/api/auth/session');},
  ]) {const {smoke,captures}=fixture();mutate(captures);assert.throws(()=>buildRuntimeEvidence(captures,scope,smoke));}
});
test('HTTP500 without console messages and unrelated fatal/missing-table errors are rejected',()=>{
  for(const modify of [r=>{r.statusCode=500;},r=>{r.logs.push({level:'fatal',message:freezeMessage});},r=>{r.logs.push({level:'error',message:'no such table: CommunityMember'});},r=>{r.logs.push({level:'error',message:freezeMessage+' no such table'});}]) {
    const {smoke,captures}=fixture();for(const c of captures)modify(c.raw.rows[0]);
    const evidence=buildRuntimeEvidence(captures,scope,smoke);assert.throws(()=>validateRuntimeEvidence(evidence,scope,smoke),/EVIDENCE_INVALID/);
  }
});
test('collector fixes a shared window and uses two settled authenticated fetches',async()=>{
  const {smoke,captures}=fixture();const waits=[],calls=[];const until=new Date(Number(captures[0].query.endDate)).toISOString();
  const result=await collectRuntimeEvidence(scope,smoke,{now:()=>until,wait:async ms=>waits.push(ms),fetchPage:async(s,start,end)=>{calls.push({s,start,end});return captures[calls.length-1];}});
  assert.deepEqual(waits,[10000,10000]);assert.equal(calls.length,2);assert.equal(calls[0].end,calls[1].end);assert.equal(result.errorCount,0);
});
