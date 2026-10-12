import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {collectInventory,validateInventory,inventoryHash,readyDenyHosts,permanentDenyHosts,permanentDenyConditions,HOSTS_PER_GROUP,MAX_HOST_GROUPS} from './production-release61-inventory.mjs';

const projectId='project-test',teamId='team-test',plan={commit:'1'.repeat(40),planSha256:'2'.repeat(64)},clock=()=>1791770000000;
const old={uid:'old',url:'anti-selek-old.vercel.app',target:'production',readyState:'READY',meta:{githubCommitSha:'3'.repeat(40)}};
const reviewed={uid:'new',url:'anti-selek-new.vercel.app',target:'production',readyState:'READY',meta:{githubCommitSha:plan.commit}};
const expected={deploymentId:'new',host:reviewed.url,commit:plan.commit};
const historic='anti-selek-historic.vercel.app';
const initial=[{id:'third',active:true,action:{mitigate:{action:'deny'}},conditionGroup:[{conditions:[{type:'host',op:'inc',value:[historic]}]}]}];
function mock(rows,{pageSize=2,detail={},transform=page=>page}={}) {
  const requests=[];let scans=0;
  const api=async route=>{
    requests.push(route);const url=new URL(route,'https://api.vercel.com');
    assert.equal(url.searchParams.get('teamId'),teamId);
    if(url.pathname==='/v6/deployments') {
      assert.equal(url.searchParams.get('projectId'),projectId);assert.equal(url.searchParams.has('state'),false);assert.equal(url.searchParams.has('target'),false);
      const cursor=url.searchParams.get('until');if(cursor===null)scans++;
      const index=cursor===null?0:1000-Number(cursor),page={deployments:rows.slice(index*pageSize,(index+1)*pageSize),pagination:{next:(index+1)*pageSize<rows.length?1000-index-1:null}};
      return structuredClone(transform(page,{scans,index}));
    }
    const id=decodeURIComponent(url.pathname.match(/^\/v13\/deployments\/([^/]+)$/)?.[1]??'');
    assert.ok(id,'No deployment or firewall write authority is exposed to the mock');
    const row=detail[id]??rows.find(d=>d.uid===id);
    return {id,projectId,...structuredClone(row)};
  };
  return {api,requests};
}
const collect=(rows,options={})=>{const {api}=mock(rows,options.mock);return collectInventory({api,projectId,teamId,plan,expected,now:clock,...options});};
const validate=(inventory,options={})=>validateInventory(inventory,{projectId,teamId,plan,expected,now:clock(),...options});
const rehash=inventory=>{inventory.sha256=inventoryHash(inventory);return inventory;};

test('two complete unfiltered paginated scans retain all project hosts with stable IDs and no write authority',async()=>{
  const preview={...old,uid:'preview',url:'anti-selek-preview.vercel.app',target:null};const {api,requests}=mock([reviewed,old,preview],{pageSize:1});
  const inventory=await collectInventory({api,projectId,teamId,plan,expected,now:clock,requireResolved:true});
  assert.equal(inventory.deployments.length,3);assert.equal(inventory.scans.length,2);assert.equal(inventory.scans[0].pages.length,3);
  assert.deepEqual(readyDenyHosts(inventory,'new'),[old.url,preview.url].sort());
  assert.deepEqual(permanentDenyHosts(inventory,initial,'third',expected),[historic,old.url,preview.url].sort());
  assert.ok(requests.every(route=>route.startsWith('/v6/deployments?')||route.startsWith('/v13/deployments/')));
});
test('initial BUILDING with no URL remains known and late READY host enters permanent union',async()=>{
  const pending={uid:'building',target:'production',readyState:'BUILDING',meta:{githubCommitSha:old.meta.githubCommitSha}};
  const baseline=await collect([old,pending]);assert.equal(baseline.knownDeployments.find(d=>d.id==='building').host,null);
  await assert.rejects(()=>collect([old,pending,reviewed],{previous:[baseline],requireResolved:true}),/INVENTORY_UNRESOLVED_DEPLOYMENT/);
  const ready={...pending,url:'anti-selek-late-ready.vercel.app',readyState:'READY'};
  const completed=await collect([old,ready,reviewed],{previous:[baseline],requireResolved:true});
  assert.ok(permanentDenyHosts(completed,initial,'third',expected).includes(ready.url));
  assert.ok(readyDenyHosts(completed,'new').includes(ready.url));
});
test('missing queued target/state/URL are resolved by authenticated detail and unresolved jobs block completion',async()=>{
  const pending={uid:'queued'};const snapshot=await collect([old,pending],{mock:{detail:{queued:{}}}});
  assert.deepEqual(snapshot.knownDeployments.find(d=>d.id==='queued'),{id:'queued',host:null,target:null,state:null,commit:null});
  await assert.rejects(()=>collect([old,pending,reviewed],{previous:[snapshot],requireResolved:true}),/INVENTORY_UNRESOLVED_DEPLOYMENT/);
  const done={...pending,url:'anti-selek-was-queued.vercel.app',target:'production',readyState:'READY',meta:old.meta};
  const completed=await collect([old,done,reviewed],{previous:[snapshot],requireResolved:true});assert.ok(readyDenyHosts(completed,'new').includes(done.url));
});
test('concurrent late deployment between full scans fails rather than producing partial complete proof',async()=>{
  await assert.rejects(()=>collect([old,reviewed],{mock:{transform:(page,{scans})=>scans===2?{...page,deployments:[...page.deployments,{...old,uid:'concurrent',url:'anti-selek-concurrent.vercel.app'}]}:page}}),/INVENTORY_CONCURRENT_CHANGE/);
});
test('a future deployment observed after verification is rejected even with reviewed source SHA',async()=>{
  const verified=await collect([old,reviewed],{requireResolved:true});
  const future={...reviewed,uid:'future',url:'anti-selek-future.vercel.app'};
  await assert.rejects(()=>collect([old,reviewed,future],{previous:[verified],requireResolved:true,rejectNew:true}),/INVENTORY_UNEXPECTED_DEPLOYMENT/);
  const refresh=await collect([old,reviewed],{previous:[verified],requireResolved:true,rejectNew:true});validate(refresh,{previous:[verified],requireResolved:true,rejectNew:true});
});
test('a previously terminal deployment changing to READY during denial probes also blocks thaw/open',async()=>{
  const error={...old,readyState:'ERROR'},verified=await collect([error,reviewed],{requireResolved:true});
  await assert.rejects(()=>collect([old,reviewed],{previous:[verified],requireResolved:true,rejectNew:true}),/INVENTORY_DEPLOYMENT_STATE_CHANGED/);
});
test('initial deployments cannot disappear or change immutable host/source/project binding',async()=>{
  const baseline=await collect([old,reviewed],{requireResolved:true});
  await assert.rejects(()=>collect([reviewed],{previous:[baseline]}),/INVENTORY_KNOWN_DEPLOYMENT_OMITTED/);
  await assert.rejects(()=>collect([{...old,url:'anti-selek-replaced.vercel.app'},reviewed],{previous:[baseline]}),/INVENTORY_IDENTITY_CHANGED/);
  await assert.rejects(()=>collect([{...old,meta:{githubCommitSha:'4'.repeat(40)}},reviewed],{previous:[baseline]}),/INVENTORY_IDENTITY_CHANGED/);
  await assert.rejects(()=>collect([{...old,projectId:'foreign'},reviewed]),/INVENTORY_PROJECT_CHANGED/);
  const conflicting=structuredClone(baseline);conflicting.knownDeployments.find(d=>d.id==='old').commit='4'.repeat(40);
  await assert.rejects(()=>collect([old,reviewed],{previous:[baseline,conflicting]}),/INVENTORY_IDENTITY_CHANGED/);
});
test('new host exclusion requires exact READY production ID and matching reviewed source, with no host collisions',async()=>{
  for(const changes of [{readyState:'BUILDING'},{target:null},{meta:{githubCommitSha:old.meta.githubCommitSha}},{url:old.url}]) {
    const inventory=await collect([old,{...reviewed,...changes}]);
    assert.throws(()=>{validate(inventory,{requireResolved:true});permanentDenyHosts(inventory,initial,'third',expected);});
  }
  const inventory=await collect([old,reviewed]);
  assert.throws(()=>permanentDenyHosts(inventory,[{...initial[0],conditionGroup:[{conditions:[{type:'host',op:'inc',value:[reviewed.url]}]}]}],'third',expected),/INVENTORY_REVIEWED_DEPLOYMENT_REQUIRED/);
});
test('pagination duplicates, missing completion cursor and cursor loops fail closed',async()=>{
  for(const transform of [page=>({...page,pagination:{}}),page=>({...page,deployments:[...page.deployments,page.deployments[0]]}),page=>({...page,pagination:{next:999}})])
    await assert.rejects(()=>collect([old,reviewed],{mock:{transform}}));
});
test('stale or future timestamps and wrong plan/project/team/deployment bindings are rejected',async()=>{
  const inventory=await collect([old,reviewed]);
  for(const changes of [{projectId:'foreign'},{teamId:'foreign'},{planSha256:'wrong'},{binding:{...expected,commit:'4'.repeat(40)}},{complete:false},{consistentScans:1},{completedAt:new Date(clock()+1).toISOString()},{startedAt:new Date(clock()-60001).toISOString()}])
    assert.throws(()=>validate(rehash({...structuredClone(inventory),...changes})));
});
test('digest, known union and scanned-ID omissions cannot be authored into completion evidence',async()=>{
  const inventory=await collect([old,reviewed]);
  assert.throws(()=>validate({...inventory,sha256:'0'.repeat(64)}),/INVENTORY_DIGEST_INVALID/);
  assert.throws(()=>validate(rehash({...inventory,knownDeployments:inventory.knownDeployments.slice(1)})),/INVENTORY_KNOWN_HOSTS_CHANGED/);
  const omitted=structuredClone(inventory);omitted.deployments=omitted.deployments.slice(1);omitted.knownDeployments=omitted.deployments;
  for(const scan of omitted.scans)scan.deploymentsSha256=inventoryHash(omitted); // Cannot explain the scanned ID even with a replaced digest.
  assert.throws(()=>validate(rehash(omitted)));
});
test('permanent rule chunks OR groups with path AND host, preserves every host and rejects capacity overflow',()=>{
  const hosts=Array.from({length:HOSTS_PER_GROUP*MAX_HOST_GROUPS},(_,i)=>`anti-selek-limit-${i}.vercel.app`),groups=permanentDenyConditions(hosts);
  assert.equal(groups.length,MAX_HOST_GROUPS);assert.deepEqual(groups.flatMap(g=>g.conditions[1].value),hosts);
  assert.ok(groups.every(g=>g.conditions.length===2&&g.conditions[0].type==='path'&&g.conditions[0].value==='/'&&g.conditions[1].op==='inc'&&g.conditions[1].value.length===HOSTS_PER_GROUP));
  assert.throws(()=>permanentDenyConditions([...hosts,'anti-selek-overflow.vercel.app']),/INVENTORY_FIREWALL_CAPACITY_EXCEEDED/);
  assert.throws(()=>permanentDenyConditions([old.url,old.url]),/INVENTORY_DENY_HOSTS_INVALID/);
});
test('inventory module has no command, credential, database, network or mutation capability',()=>{
  const source=fs.readFileSync(new URL('./production-release61-inventory.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/node:child_process|node:fs|createClient|credentials\(|fetch\(|firewall.*(?:edit|publish)|process\.env/);
});
