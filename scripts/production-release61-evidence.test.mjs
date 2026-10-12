import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {hash,stable,PREDECESSOR} from './production-release61.mjs';
import {inventoryHash,permanentDenyHosts} from './production-release61-inventory.mjs';
import {buildRuntimeEvidence,runtimeQuery,REQUEST_LOG_ENDPOINT} from './production-release61-runtime.mjs';
import {PROJECT,TEAM,ALIASES,PREVIOUS_DEPLOYMENT,PREVIOUS_HOST,FENCE_ID,INITIAL_FIREWALL_HASH,LEGACY_IDS,canonicalRules,validateMaintenance,validateDeployment} from './production-release61-evidence.mjs';

const plan={commit:'1'.repeat(40),planSha256:'2'.repeat(64),reviewedFileHashes:{'synthetic-reviewed-source':'3'.repeat(64)}};
const initial=JSON.parse(fs.readFileSync(new URL('./fixtures/release61-firewall-baseline.json',import.meta.url),'utf8'));
function inventoryProof(deployments,binding,at) {
  deployments=structuredClone(deployments).sort((a,b)=>a.id.localeCompare(b.id));
  const scannedIds=deployments.map(d=>d.id).sort(),pages=[{cursor:null,nextCursor:null,ids:scannedIds}];
  const inventory={version:1,source:'authenticated-vercel-api',projectId:PROJECT,teamId:TEAM,planSha256:plan.planSha256,binding,startedAt:at,completedAt:at,
    query:{projectId:PROJECT,teamId:TEAM,target:null,state:null},complete:true,nextCursor:null,consistentScans:2,scannedIds,deployments,knownDeployments:deployments,
    scans:[{pages,deploymentsSha256:hash(stable(deployments))},{pages,deploymentsSha256:hash(stable(deployments))}]};
  inventory.sha256=inventoryHash(inventory);return inventory;
}
function evidence(now=Date.now()) {
  const at=new Date(now).toISOString(),observedAt=new Date(now-360000).toISOString();
  const deployments=Array.from({length:31},(_,i)=>({id:i?`old-${i}`:PREVIOUS_DEPLOYMENT,host:i?`anti-selek-test-old-${i}.vercel.app`:PREVIOUS_HOST,commit:PREDECESSOR,target:'production',state:'READY'}));
  const inventory=inventoryProof(deployments,{deploymentId:PREVIOUS_DEPLOYMENT,host:PREVIOUS_HOST,commit:PREDECESSOR},observedAt);
  const legacyRules=initial.filter(r=>LEGACY_IDS.includes(r.id));
  const fence={id:FENCE_ID,name:'Temporary independent club profiles maintenance',active:true,action:{mitigate:{action:'deny'}},conditionGroup:[{conditions:[{type:'path',op:'pre',value:'/'}]}]};
  const common={version:1,source:'authenticated-vercel-api-and-http',projectId:PROJECT,teamId:TEAM,planSha256:plan.planSha256,activeConfigId:'test-config',pendingDraftChanges:[],legacyRules,inventory};
  const denials=hosts=>hosts.flatMap(host=>['/favicon.ico','/api/auth/session'].map(path=>({host,path,status:403,denyMarker:true,redirectsFollowed:false,protectionBypassSent:true,observedAt:at})));
  const maintenance={...common,observedAt,initialFirewallRules:initial,firewallRules:[...legacyRules,fence],maintenanceRule:fence,independentReview:{passed:true,commit:plan.commit,reviewers:['ownership-review','release-review'],scopes:['ownership-migration','production-release'],fileHashes:plan.reviewedFileHashes},denials:denials([...ALIASES,...deployments.map(d=>d.host)]),drainNotBefore:new Date(now-30000).toISOString()};
  const host='anti-selek-test-new.vercel.app',deploymentId='dpl_syntheticnew';
  const newFence={...fence,conditionGroup:[{conditions:[{type:'path',op:'pre',value:'/'},{type:'host',op:'neq',value:host}]}]};
  const smokeStartedAt=new Date(now-30000).toISOString();
  const smokeResults=['/','/api/auth/session','/api/clubs/release-smoke/removed-players'].map(path=>({host,path,status:path.includes('removed-players')?401:200,method:'GET',appResponse:true,redirectsFollowed:false,protectionBypassSent:true,observedAt:new Date(now-25000).toISOString()}));
  const scope={projectId:PROJECT,teamId:TEAM,deploymentId,host};
  const rows=smokeResults.map((result,i)=>({requestId:`synthetic-request-${i}`,timestamp:now-28000,deploymentId,domain:host,environment:'production',requestMethod:'GET',requestPath:result.path,statusCode:result.status,events:[{source:i?'serverless':'static'}],logs:[]}));
  const captures=[now-15000,now-1000].map(time=>({endpoint:REQUEST_LOG_ENDPOINT,method:'GET',query:runtimeQuery(scope,smokeStartedAt,new Date(now-20000).toISOString()),httpStatus:200,observedAt:new Date(time).toISOString(),serverDate:new Date(time).toUTCString(),raw:{rows:structuredClone(rows),hasMoreRows:false}}));
  const runtime=buildRuntimeEvidence(captures,scope,{deploymentId,host,smokeStartedAt,smokeResults});
  const completion=inventoryProof([...deployments,{id:deploymentId,host,commit:plan.commit,target:'production',state:'READY'}],{deploymentId,host,commit:plan.commit},at);
  const deployment={...common,inventory:completion,permanentDenyHosts:permanentDenyHosts(completion,initial,FENCE_ID,{deploymentId,host,commit:plan.commit}),observedAt:at,commit:plan.commit,target:'production',state:'READY',deploymentId,host,aliasChecks:ALIASES.map(host=>({host,deploymentId})),maintenanceRule:newFence,firewallRules:[...legacyRules,newFence],oldHostDenials:denials(deployments.map(d=>d.host)),smokeStartedAt,runtime,smokeResults};
  return {now,maintenance,deployment};
}
test('observed existing three-rule baseline, complete fence and exact new deployment pass',()=>{
  assert.equal(hash(stable(canonicalRules(initial))),INITIAL_FIREWALL_HASH);
  const {now,maintenance,deployment}=evidence();assert.equal(validateMaintenance(maintenance,plan,now).length,35);validateDeployment(deployment,plan,maintenance,now);
});
test('wrong target, unreviewed source, modified baseline and unrelated drafts fail closed',()=>{
  const {now,maintenance}=evidence();
  for(const change of [{teamId:'wrong'},{projectId:'wrong'},{planSha256:'wrong'},{initialFirewallRules:[]},{pendingDraftChanges:[{}]},{independentReview:{passed:true,commit:plan.commit,reviewers:['/root','other']}}])assert.throws(()=>validateMaintenance({...maintenance,...change},plan,now));
});
test('drain, inventory, concrete hosts and actual three-rule fencing are required',()=>{
  const {now,maintenance}=evidence();
  for(const change of [{drainNotBefore:new Date(now+1).toISOString()},{inventory:{...maintenance.inventory,complete:false}},{denials:maintenance.denials.slice(1)},{firewallRules:[...maintenance.firewallRules,{id:'fourth'}]},{maintenanceRule:{...maintenance.maintenanceRule,active:false}}])assert.throws(()=>validateMaintenance({...maintenance,...change},plan,now));
});
test('matching aliases, retained old inventory and protected exact-host fence are required',()=>{
  const {now,maintenance,deployment}=evidence();
  for(const change of [{commit:'wrong'},{state:'BUILDING'},{target:'preview'},{host:PREVIOUS_HOST},{aliasChecks:[]},{firewallRules:[]},{maintenanceRule:{...deployment.maintenanceRule,active:false}}])assert.throws(()=>validateDeployment({...deployment,...change},plan,maintenance,now));
  const changed=structuredClone(deployment);changed.inventory=inventoryProof(changed.inventory.deployments.map(d=>d.id==='old-1'?{...d,host:'anti-selek-test-replaced.vercel.app'}:d),changed.inventory.binding,changed.observedAt);assert.throws(()=>validateDeployment(changed,plan,maintenance,now),/INVENTORY_IDENTITY_CHANGED/);
});
test('cached baseline cannot stand in for fresh completion and omitted historic denials block',()=>{
  const {now,maintenance,deployment}=evidence();
  assert.throws(()=>validateDeployment({...deployment,inventory:maintenance.inventory},plan,maintenance,now),/INVENTORY_BINDING_INVALID/);
  assert.throws(()=>validateDeployment({...deployment,permanentDenyHosts:deployment.permanentDenyHosts.slice(1)},plan,maintenance,now),/INVENTORY_PERMANENT_DENIALS_INCOMPLETE/);
});
test('initial in-flight deployment becoming READY is retained and must have concrete denials',()=>{
  const {now,maintenance,deployment}=evidence(),late={id:'late-old',host:null,target:'production',state:'BUILDING',commit:PREDECESSOR};
  maintenance.inventory=inventoryProof([...maintenance.inventory.deployments,late],maintenance.inventory.binding,maintenance.observedAt);
  validateMaintenance(maintenance,plan,now);
  const ready={...late,host:'anti-selek-late-old.vercel.app',state:'READY'};
  deployment.inventory=inventoryProof([...deployment.inventory.deployments,ready],deployment.inventory.binding,deployment.observedAt);
  deployment.permanentDenyHosts=permanentDenyHosts(deployment.inventory,initial,FENCE_ID,deployment.inventory.binding);
  assert.throws(()=>validateDeployment(deployment,plan,maintenance,now),/HOST_DENIALS_INCOMPLETE/);
  deployment.oldHostDenials.push(...['/favicon.ico','/api/auth/session'].map(path=>({host:ready.host,path,status:403,denyMarker:true,redirectsFollowed:false,protectionBypassSent:true,observedAt:deployment.observedAt})));
  validateDeployment(deployment,plan,maintenance,now);
});
test('read-only HTTP and complete matching runtime-log windows are required',()=>{
  const {now,maintenance,deployment}=evidence();
  for(const change of [{method:'POST'},{appResponse:false},{redirectsFollowed:true},{protectionBypassSent:false},{status:500}])assert.throws(()=>validateDeployment({...deployment,smokeResults:deployment.smokeResults.map((r,i)=>i?r:{...r,...change})},plan,maintenance,now));
  assert.throws(()=>validateDeployment({...deployment,smokeResults:deployment.smokeResults.slice(0,2)},plan,maintenance,now));
  for(const change of [{errorCount:1},{unexpectedErrorCount:1},{source:'unknown'},{since:'wrong'},{collection:{...deployment.runtime.collection,captureComplete:false}},{observedAt:new Date(now-901000).toISOString()}])assert.throws(()=>validateDeployment({...deployment,runtime:{...deployment.runtime,...change}},plan,maintenance,now));
});
test('only precisely correlated frozen rate-limit storage errors are allowed',()=>{
  const {now,maintenance,deployment}=evidence();
  for(const capture of deployment.runtime.captures)capture.raw.rows[1].logs.push({level:'error',message:'Rate limit storage error SQLITE_CONSTRAINT PRODUCTION_RELEASE61_WRITES_FROZEN'});
  deployment.runtime=buildRuntimeEvidence(deployment.runtime.captures,deployment.runtime.scope,deployment);
  const expected=deployment.runtime.expectedFreezeErrors[0];
  validateDeployment(deployment,plan,maintenance,now);
  for(const change of [{constraint:'SQLITE_OTHER'},{deploymentId:'wrong'},{path:'/api/mutation'},{method:'POST'}])assert.throws(()=>validateDeployment({...deployment,runtime:{...deployment.runtime,expectedFreezeErrors:[{...expected,...change}]}},plan,maintenance,now));
});
