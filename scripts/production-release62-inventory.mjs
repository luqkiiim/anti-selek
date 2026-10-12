// Read-only inventory collection. No credentials, deployment or firewall authority is accepted here.
import {demand,hash,stable} from './production-release62.mjs';

const HOST=/^anti-selek-[a-z0-9-]+\.vercel\.app$/;
const STATES=new Set(['READY','ERROR','CANCELED','QUEUED','BUILDING','INITIALIZING','BLOCKED','DELETED']);
const TERMINAL=new Set(['READY','ERROR','CANCELED','BLOCKED','DELETED']);
const timestamp=value=>Number.isFinite(Date.parse(value));
const same=(a,b)=>stable(a)===stable(b);
export const inventoryHash=inventory=>hash(stable(Object.fromEntries(Object.entries(inventory).filter(([key])=>key!=='sha256'))));
export const inventoryHosts=inventory=>[...new Set(inventory.knownDeployments.map(d=>d.host).filter(Boolean))].sort();
export const readyDenyHosts=(inventory,newId=null)=>[...new Set(inventory.knownDeployments.filter(d=>d.state==='READY'&&d.id!==newId).map(d=>d.host).filter(Boolean))].sort();

function identity(d) {
  demand(d&&typeof d.id==='string'&&d.id.length>0,'INVENTORY_DEPLOYMENT_ID_REQUIRED');
  demand(d.host===null||typeof d.host==='string'&&HOST.test(d.host),'INVENTORY_HOST_INVALID');
  demand(d.target===null||['production','preview','staging'].includes(d.target),'INVENTORY_TARGET_INVALID');
  demand(d.state===null||STATES.has(d.state),'INVENTORY_STATE_INVALID');
  demand(d.state!=='READY'||d.host,'INVENTORY_READY_HOST_UNRESOLVED');
  demand(d.commit===null||typeof d.commit==='string'&&/^[a-f0-9]{40}$/.test(d.commit),'INVENTORY_SOURCE_INVALID');
}
function merge(prior,current) {
  const known=new Map();
  for(const d of [...prior,...current]) {
    identity(d);const old=known.get(d.id);
    if(old)for(const key of ['host','target','commit'])demand(old[key]===null||d[key]===old[key],'INVENTORY_IDENTITY_CHANGED');
    known.set(d.id,{...old,...d});
  }
  return [...known.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
export function validateInventory(inventory,{projectId,teamId,plan,expected,previous=[],now=Date.now(),maxAge=60000,requireResolved=false,rejectNew=false}={}) {
  demand(inventory?.version===1&&inventory.source==='authenticated-vercel-api'&&inventory.projectId===projectId&&inventory.teamId===teamId
    &&inventory.planSha256===plan?.planSha256&&same(inventory.binding,expected),'INVENTORY_BINDING_INVALID');
  demand(timestamp(inventory.startedAt)&&timestamp(inventory.completedAt)&&Date.parse(inventory.completedAt)>=Date.parse(inventory.startedAt)
    &&now>=Date.parse(inventory.completedAt)&&now-Date.parse(inventory.startedAt)<maxAge,'INVENTORY_NOT_FRESH');
  demand(inventory.complete===true&&inventory.nextCursor===null&&inventory.query?.target===null&&inventory.query?.state===null
    &&inventory.query?.projectId===projectId&&inventory.query?.teamId===teamId&&inventory.consistentScans===2,'PRODUCTION_INVENTORY_REQUIRED');
  demand(Array.isArray(inventory.deployments)&&Array.isArray(inventory.knownDeployments)&&Array.isArray(inventory.scannedIds)
    &&new Set(inventory.scannedIds).size===inventory.scannedIds.length&&Array.isArray(inventory.scans)&&inventory.scans.length===2,'INVENTORY_PAGINATION_INVALID');
  for(const scan of inventory.scans) {
    demand(Array.isArray(scan.pages)&&scan.pages.length>0,'INVENTORY_PAGINATION_INVALID');
    const ids=[];let cursor=null;
    for(const [index,page] of scan.pages.entries()) {
      demand(page.cursor===cursor&&Array.isArray(page.ids)&&page.ids.every(id=>typeof id==='string'&&id.length>0),'INVENTORY_PAGINATION_INVALID');
      ids.push(...page.ids);
      if(page.nextCursor!==null)demand(Number.isSafeInteger(page.nextCursor)&&page.nextCursor>0&&(cursor===null||page.nextCursor<cursor)&&index<scan.pages.length-1,'INVENTORY_PAGINATION_INVALID');
      else demand(index===scan.pages.length-1,'INVENTORY_PAGINATION_INVALID');
      cursor=page.nextCursor;
    }
    demand(cursor===null&&new Set(ids).size===ids.length&&same([...ids].sort(),inventory.scannedIds),'INVENTORY_PAGINATION_INVALID');
    demand(scan.deploymentsSha256===hash(stable(inventory.deployments)),'INVENTORY_SCAN_CHANGED');
  }
  demand(new Set(inventory.deployments.map(d=>d.id)).size===inventory.deployments.length&&new Set(inventory.knownDeployments.map(d=>d.id)).size===inventory.knownDeployments.length,'INVENTORY_DUPLICATE_ID');
  inventory.deployments.forEach(identity);inventory.knownDeployments.forEach(identity);
  demand(same(inventory.deployments.map(d=>d.id).sort(),inventory.scannedIds),'INVENTORY_LIST_OMISSION');
  const prior=previous.flatMap(p=>p.knownDeployments??p.deployments??[]);
  demand(prior.every(d=>inventory.deployments.some(current=>current.id===d.id)),'INVENTORY_KNOWN_DEPLOYMENT_OMITTED');
  demand(same(merge(prior,inventory.deployments),inventory.knownDeployments),'INVENTORY_KNOWN_HOSTS_CHANGED');
  demand(inventory.sha256===inventoryHash(inventory),'INVENTORY_DIGEST_INVALID');
  if(requireResolved) {
    demand(expected.commit===plan.commit,'INVENTORY_REVIEWED_SOURCE_REQUIRED');
    demand(inventory.knownDeployments.every(d=>d.host&&TERMINAL.has(d.state)),'INVENTORY_UNRESOLVED_DEPLOYMENT');
    const current=inventory.deployments.filter(d=>d.id===expected.deploymentId);
    demand(current.length===1&&current[0].state==='READY'&&current[0].target==='production'&&current[0].commit===expected.commit&&current[0].host===expected.host,'INVENTORY_REVIEWED_DEPLOYMENT_REQUIRED');
  }
  if(rejectNew) {
    const knownIds=new Set(prior.map(d=>d.id));
    demand(inventory.deployments.every(d=>knownIds.has(d.id)),'INVENTORY_UNEXPECTED_DEPLOYMENT');
    demand(previous.length>0&&same(inventory.deployments,previous.at(-1).deployments),'INVENTORY_DEPLOYMENT_STATE_CHANGED');
  }
  return inventoryHosts(inventory);
}

export async function collectInventory({api,projectId,teamId,plan,expected,previous=[],now=()=>Date.now(),requireResolved=false,rejectNew=false}) {
  demand(typeof api==='function','AUTHENTICATED_INVENTORY_API_REQUIRED');
  const startedAt=new Date(now()).toISOString();
  const scans=[];let deployments,scannedIds;
  for(let scan=0;scan<2;scan++) {
    const pages=[],rows=[];let cursor=null;
    do {
      const page=await api(`/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=100${cursor===null?'':`&until=${cursor}`}`);
      demand(Array.isArray(page?.deployments)&&page.pagination&&Object.hasOwn(page.pagination,'next'),'INVENTORY_PAGE_INCOMPLETE');
      const ids=page.deployments.map(d=>d.uid??d.id);
      const nextCursor=page.pagination.next;
      demand(nextCursor===null||Number.isSafeInteger(nextCursor)&&nextCursor>0&&(cursor===null||nextCursor<cursor),'INVENTORY_PAGINATION_INVALID');
      pages.push({cursor,nextCursor,ids});rows.push(...page.deployments);cursor=nextCursor;
      demand(rows.length<10000&&pages.length<1000,'INVENTORY_TOO_LARGE');
    }while(cursor!==null);
    const ids=rows.map(d=>d.uid??d.id);
    demand(ids.every(id=>typeof id==='string'&&id.length>0)&&new Set(ids).size===ids.length,'INVENTORY_DUPLICATE_ID');
    const candidates=[];
    for(const row of rows) {
      // Retain the entire project as a conservative superset of Production, including
      // unknown-target queued jobs and previews that could be promoted concurrently.
      const id=row.uid??row.id;
      let d=row;
      demand(row.projectId===undefined||row.projectId===projectId,'INVENTORY_PROJECT_CHANGED');
      if(!row.url||!row.readyState||!Object.hasOwn(row,'target')) {
        d=await api(`/v13/deployments/${encodeURIComponent(id)}?withGitRepoInfo=true&teamId=${teamId}`);
        demand(d?.id===id&&d.projectId===projectId,'INVENTORY_PROJECT_CHANGED');
      }
      candidates.push({id,host:d.url??null,target:d.target??null,state:d.readyState??d.state??null,commit:d.meta?.githubCommitSha??null});
    }
    candidates.sort((a,b)=>a.id.localeCompare(b.id));const orderedIds=ids.sort();
    if(scan)demand(same(deployments,candidates)&&same(scannedIds,orderedIds),'INVENTORY_CONCURRENT_CHANGE');
    deployments=candidates;scannedIds=orderedIds;scans.push({pages,deploymentsSha256:hash(stable(candidates))});
  }
  const inventory={version:1,source:'authenticated-vercel-api',projectId,teamId,planSha256:plan.planSha256,binding:expected,
    startedAt,completedAt:new Date(now()).toISOString(),query:{projectId,teamId,target:null,state:null},complete:true,nextCursor:null,consistentScans:2,
    scans,scannedIds,deployments,knownDeployments:merge(previous.flatMap(p=>p.knownDeployments??p.deployments??[]),deployments)};
  inventory.sha256=inventoryHash(inventory);
  validateInventory(inventory,{projectId,teamId,plan,expected,previous,now:now(),requireResolved,rejectNew});return inventory;
}

export function permanentDenyHosts(inventory,initialRules,fenceId,expected) {
  const initial=initialRules.find(r=>r.id===fenceId);
  demand(initial?.active===true&&initial.action?.mitigate?.action==='deny','INITIAL_DENY_MISSING');
  const historic=initial.conditionGroup.flatMap(g=>g.conditions.flatMap(c=>c.type==='host'&&c.op==='inc'?c.value:[]));
  demand(historic.length>0&&historic.every(host=>typeof host==='string'&&HOST.test(host)),'HISTORIC_DENY_HOSTS_REQUIRED');
  const reviewed=inventory.knownDeployments.filter(d=>d.id===expected.deploymentId&&d.host===expected.host&&d.commit===expected.commit&&d.target==='production'&&d.state==='READY');
  demand(reviewed.length===1&&!historic.includes(expected.host),'INVENTORY_REVIEWED_DEPLOYMENT_REQUIRED');
  demand(inventory.knownDeployments.every(d=>d.id===expected.deploymentId||d.host!==expected.host),'INVENTORY_HOST_COLLISION');
  return [...new Set([...historic,...inventory.knownDeployments.filter(d=>d.id!==expected.deploymentId).map(d=>d.host)])].sort();
}

// The installed CLI accepts at most 25 OR groups. Thirty values per group is
// this release's conservative cap, already used by the pinned historical rule;
// it is not a claim about an undocumented platform inc-array limit.
export const HOSTS_PER_GROUP=30,MAX_HOST_GROUPS=25;
export function permanentDenyConditions(hosts) {
  demand(Array.isArray(hosts)&&hosts.length>0&&hosts.every(host=>typeof host==='string'&&HOST.test(host))
    &&new Set(hosts).size===hosts.length,'INVENTORY_DENY_HOSTS_INVALID');
  demand(hosts.length<=HOSTS_PER_GROUP*MAX_HOST_GROUPS,'INVENTORY_FIREWALL_CAPACITY_EXCEEDED');
  const groups=[];
  for(let i=0;i<hosts.length;i+=HOSTS_PER_GROUP)groups.push({conditions:[{type:'path',op:'pre',value:'/'},{type:'host',op:'inc',value:hosts.slice(i,i+HOSTS_PER_GROUP)}]});
  return groups;
}
