// Reviewed three-rule HTTP cutover; never imported by builds and never persists bypass secrets.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {loadPlan,hash,stable,demand,thaw,inspect,validateReviewReceipt,PREDECESSOR} from './production-release62.mjs';
import {seal,protectedFile,credentials} from './production-release62-security.mjs';
import {PROJECT,TEAM,ALIASES,LEGACY_IDS,LEGACY_HASH,PREVIOUS_DEPLOYMENT,PREVIOUS_HOST,canonicalRules,sameConditions,validateMaintenance} from './production-release62-evidence.mjs';
import {validateDeployment,validateLiveMaintenance} from './production-release62-evidence.mjs';
import {collectInventory,validateInventory,readyDenyHosts,permanentDenyHosts,permanentDenyConditions} from './production-release62-inventory.mjs';
import {createClient} from '@libsql/client';
import {collectRuntimeEvidence,validateRuntimeEvidence,requestIdFromVercelHeader,publicRuntimeScope} from './production-release62-runtime.mjs';
const root=process.cwd(),[mode,commit,approval]=process.argv.slice(2),plan=loadPlan(root,commit);
const INITIAL_FIREWALL_HASH='bb2a5bed2e378bcf3984d8035414befafd136d59c64d4361980a9885477de706';
const FENCE_ID='rule_temporary_ownership_release_maintenance_6EdivN';
const cli=process.env.PRODUCTION_RELEASE62_VERCEL_CLI_PATH;
demand(typeof cli==='string'&&cli.startsWith('/')&&fs.lstatSync(cli).isFile()&&!fs.lstatSync(cli).isSymbolicLink(),'VERCEL_CLI_PATH_REQUIRED');
const name='Temporary club pairing preferences maintenance',oldName='Block production generations before club pairing preferences';
const pathCondition={type:'path',op:'pre',value:'/'};
function run(args){return execFileSync(process.execPath,[cli,...args,'--scope',TEAM,'--global-config',`${root}/private/vercel-cli`,'--non-interactive'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']});}
const json=args=>JSON.parse(run(args));
const firewall=()=>json(['firewall','overview','--json','--project',PROJECT]);
const diff=()=>json(['firewall','diff','--json','--project',PROJECT]);
const api=p=>json(['api',p.includes('teamId=')?p:`${p}${p.includes('?')?'&':'?'}teamId=${TEAM}`,'--raw']);
const location=n=>`private/production-release62/${n}`;
const read=n=>JSON.parse(fs.readFileSync(protectedFile(root,location(n)),'utf8'));
const write=(n,v)=>{fs.writeFileSync(protectedFile(root,location(n),{exists:false}),JSON.stringify(v,null,2),{flag:'wx'});seal(root,location(n));};
function baseline(o){const legacy=canonicalRules(o.active.rules.filter(r=>LEGACY_IDS.includes(r.id)));demand(hash(stable(legacy))===LEGACY_HASH,'LEGACY_RULES_CHANGED');return legacy;}
function cleanDraft(){demand(diff().changes?.length===0,'UNRELATED_DRAFT');}
function publish(expected){
 const changes=diff().changes;
 demand(Array.isArray(changes)&&changes.length===expected.length&&expected.every(wanted=>changes.filter(change=>{
  if(change.action!==wanted.action||(wanted.id!==undefined&&change.id!==wanted.id))return false;
  if(!wanted.value)return true;
  const v=change.value;return v?.name===wanted.value.name&&v.active===true&&v.action?.mitigate?.action==='deny'
   &&sameConditions(v.conditionGroup,wanted.value.conditionGroup);
 }).length===1),'UNEXPECTED_DRAFT');
 run(['firewall','publish','--yes','--project',PROJECT]);cleanDraft();
}
function target(){const p=api(`/v9/projects/${PROJECT}`);demand(p.id===PROJECT&&p.accountId===TEAM&&p.name==='anti-selek','PROJECT_MISMATCH');return p;}
function tokenFrom(p){const token=Object.keys(p.protectionBypass??{}).find(k=>p.protectionBypass[k]?.scope==='automation-bypass'&&p.protectionBypass[k]?.isEnvVar===true);demand(token,'EXISTING_BYPASS_MISSING');return token;}
async function probe(host,path,token,{denied=false,correlate=false}={}){
 const r=await fetch(`https://${host}${path}`,{method:'GET',headers:token?{'x-vercel-protection-bypass':token}:{},redirect:'manual',signal:AbortSignal.timeout(20000)});
 const vercelId=correlate?r.headers.get('x-vercel-id'):undefined;
 const requestId=correlate?requestIdFromVercelHeader(vercelId):undefined;
 const body=await r.text();let appResponse=false;
 if(!denied && path==='/')appResponse=r.status===200 && /Anti.?Selek|antiselek/i.test(body) && !/Authentication Required|Log in to Vercel/i.test(body);
 if(!denied && path==='/api/auth/session') {try {const data=JSON.parse(body);appResponse=r.status===200 && (!data || (typeof data==='object'&&!data.user));}catch{}}
 if(!denied && path==='/api/clubs/release-smoke/removed-players') {try {const data=JSON.parse(body);appResponse=r.status===401&&typeof data.error==='string';}catch{}}
 return {host,path,...(correlate?{vercelId,requestId}:{}),method:'GET',status:r.status,denyMarker:/Forbidden|Access Denied|request blocked|firewall/i.test(body),appResponse,protectionBypassSent:typeof token==='string'&&token.length>0,redirectsFollowed:false,observedAt:new Date().toISOString()};
}
const binding=d=>({deploymentId:d.id,host:d.url,commit:d.meta?.githubCommitSha});
function currentProduction(d) {
 demand(d.projectId===PROJECT&&d.target==='production'&&d.readyState==='READY','DEPLOYMENT_CHANGED');
 const p=target();demand(p.targets?.production?.id===d.id,'ACTIVE_PRODUCTION_CHANGED');
 for(const host of ALIASES){const a=api(`/v4/aliases/${host}`);demand(a.projectId===PROJECT&&a.deploymentId===d.id,'ALIAS_CHANGED');}
 const current=api(`/v13/deployments/${d.id}?withGitRepoInfo=true`);
 demand(current.projectId===PROJECT&&current.readyState==='READY'&&current.target==='production'&&current.url===d.url&&current.meta?.githubCommitSha===d.meta?.githubCommitSha,'DEPLOYMENT_CHANGED');
}
async function inventory(d,{previous=[],requireResolved=false,rejectNew=false}={}) {
 currentProduction(d);
 const inv=await collectInventory({api,projectId:PROJECT,teamId:TEAM,plan,expected:binding(d),previous,requireResolved,rejectNew});
 currentProduction(d);
 validateInventory(inv,{projectId:PROJECT,teamId:TEAM,plan,expected:binding(d),previous,requireResolved,rejectNew});return inv;
}
const permanentHosts=(inv,m,d)=>{const hosts=permanentDenyHosts(inv,m.initialFirewallRules,FENCE_ID,binding(d));permanentDenyConditions(hosts);return hosts;};
async function inventoryDenials(inv,d,token) {
 const results=await Promise.all(readyDenyHosts(inv,d.id).flatMap(host=>['/favicon.ico','/api/auth/session'].map(path=>probe(host,path,token,{denied:true}))));
 demand(results.every(r=>r.status===403&&r.denyMarker===true),'CONCRETE_HOST_DENIAL_REQUIRED');return results;
}
function base(o){return {version:1,source:'authenticated-vercel-api-and-http',projectId:PROJECT,teamId:TEAM,planSha256:plan.planSha256,activeConfigId:o.active.id,legacyRules:baseline(o),pendingDraftChanges:diff().changes};}
let openingHttp=false;
function recloseAfterOpeningFailure() {
 const observed=firewall();baseline(observed);demand(observed.active.rules.length===3,'EXACT_THREE_RULE_CONFIG_REQUIRED');
 const changes=diff().changes;demand(Array.isArray(changes)&&changes.every(c=>c.action==='rules.update'&&c.id===FENCE_ID),'UNRELATED_DRAFT');
 const fenceValue={name,active:true,conditionGroup:[{conditions:[pathCondition]}],action:{mitigate:{action:'deny'}}};
 run(['firewall','rules','edit',FENCE_ID,'--json',JSON.stringify(fenceValue),'--yes','--project',PROJECT]);publish([{action:'rules.update',id:FENCE_ID,value:fenceValue}]);
 const closed=firewall();baseline(closed);demand(closed.active.rules.length===3&&sameConditions(canonicalRules(closed.active.rules.filter(r=>r.id===FENCE_ID)),canonicalRules([{id:FENCE_ID,...fenceValue}])),'HTTP_FENCE_RESTORE_NOT_VERIFIED');
}
try {
 const review=read('independent-review.json');
 validateReviewReceipt(review,plan);
 demand(['fence','pre-writer','allow-new','smoke','runtime','public-runtime','verify-deployment','thaw','open-http'].includes(mode),'MODE_INVALID');
 if(['fence','allow-new','thaw','open-http'].includes(mode))demand(approval==='--approved-production-release','APPROVAL_REQUIRED');
 target();
 if(mode==='fence') {
  const predecessorProject=target();demand(predecessorProject.targets?.production?.id===PREVIOUS_DEPLOYMENT,'ACTIVE_PREDECESSOR_CHANGED');
  const predecessor=api(`/v13/deployments/${PREVIOUS_DEPLOYMENT}?withGitRepoInfo=true`);
  demand(predecessor.projectId===PROJECT&&predecessor.id===PREVIOUS_DEPLOYMENT&&predecessor.url===PREVIOUS_HOST&&predecessor.meta?.githubCommitSha===PREDECESSOR&&predecessor.target==='production'&&predecessor.readyState==='READY','ACTIVE_PREDECESSOR_CHANGED');
  for(const host of ALIASES){const a=api(`/v4/aliases/${host}`);demand(a.projectId===PROJECT&&a.deploymentId===PREVIOUS_DEPLOYMENT,'PREDECESSOR_ALIAS_CHANGED');}
  let o=firewall();baseline(o);cleanDraft();
  const initialFirewallRules=o.active.rules;
  demand(initialFirewallRules.length===3&&hash(stable(canonicalRules(initialFirewallRules)))===INITIAL_FIREWALL_HASH,'INITIAL_FIREWALL_CHANGED');
  const inv=await inventory(predecessor),initialRule=initialFirewallRules.find(r=>r.id===FENCE_ID);
  demand(initialRule?.active&&initialRule.action?.mitigate?.action==='deny','INITIAL_DENY_MISSING');
  const fenceValue={name,active:true,conditionGroup:[{conditions:[pathCondition]}],action:{mitigate:{action:'deny'}}};
  run(['firewall','rules','edit',FENCE_ID,'--json',JSON.stringify(fenceValue),'--yes','--project',PROJECT]);
  publish([{action:'rules.update',id:FENCE_ID,value:fenceValue}]);
  o=firewall();const maintenanceRule=o.active.rules.find(r=>r.id===FENCE_ID);demand(maintenanceRule,'FENCE_NOT_ACTIVE');
  let p=target(),token=tokenFrom(p);p=null;
  const hosts=[...new Set([...ALIASES,...readyDenyHosts(inv)])];
  const denials=await Promise.all(hosts.flatMap(host=>['/favicon.ico','/api/auth/session'].map(path=>probe(host,path,token,{denied:true}))));token=null;
  const observedAt=new Date().toISOString(),e={...base(o),initialFirewallRules,firewallRules:o.active.rules,inventory:inv,maintenanceRule,denials,independentReview:review,observedAt,drainNotBefore:new Date(Date.parse(observedAt)+330000).toISOString()};
  validateMaintenance(e,plan,Date.now(),{requireDrained:false});write('maintenance-evidence.json',e);
  console.log(JSON.stringify({stage:'http-fenced',hosts:hosts.length,denials:denials.length,drainNotBefore:e.drainNotBefore}));
 } else if(mode==='pre-writer') {
  const m=read('maintenance-evidence.json');validateMaintenance(m,plan);
  const predecessor=api(`/v13/deployments/${PREVIOUS_DEPLOYMENT}?withGitRepoInfo=true`);
  demand(predecessor.url===PREVIOUS_HOST&&predecessor.meta?.githubCommitSha===PREDECESSOR,'ACTIVE_PREDECESSOR_CHANGED');
  const inv=await inventory(predecessor,{previous:[m.inventory],rejectNew:true});
  let token=tokenFrom(target());
  const hosts=[...new Set([...ALIASES,...readyDenyHosts(inv)])];
  const denials=await Promise.all(hosts.flatMap(host=>['/favicon.ico','/api/auth/session'].map(path=>probe(host,path,token,{denied:true}))));token=null;
  const completed=await inventory(predecessor,{previous:[m.inventory,inv],rejectNew:true});
  const o=firewall();cleanDraft();currentProduction(predecessor);
  const aliasChecks=ALIASES.map(host=>{const a=api(`/v4/aliases/${host}`);return {host,deploymentId:a.deploymentId};});
  const live={source:'authenticated-vercel-api-and-http-pre-writer',planSha256:plan.planSha256,commit,
   activeConfigId:o.active.id,firewallRules:o.active.rules,pendingDraftChanges:diff().changes,inventory:completed,
   deploymentId:predecessor.id,host:predecessor.url,predecessorCommit:predecessor.meta?.githubCommitSha,
   aliasChecks,denials,observedAt:new Date().toISOString()};
  validateLiveMaintenance(live,m,plan);console.log(JSON.stringify(live));
 } else if(mode==='allow-new') {
  const report=read('rehearsal.json'),reader=createClient(credentials(root,'reader'));
  try {const state=await inspect(reader,plan,report);demand(state.phase===62&&state.writesFrozen===true,'MIGRATION_AND_FREEZE_REQUIRED');}finally {reader.close();}
  const m=read('maintenance-evidence.json');const p=target();const d=api(`/v13/deployments/${p.targets.production.id}?withGitRepoInfo=true`);
  demand(d.meta?.githubCommitSha===commit&&d.target==='production'&&d.readyState==='READY','NEW_PRODUCTION_NOT_READY');
  const inv=await inventory(d,{previous:[m.inventory],requireResolved:true});permanentHosts(inv,m,d);
  const o=firewall();baseline(o);cleanDraft();const rule=o.active.rules.find(r=>r.id===m.maintenanceRule.id);demand(rule?.active&&o.active.rules.length===3&&sameConditions(canonicalRules([rule]),canonicalRules([m.maintenanceRule])),'FENCE_MISSING');
  const fenceValue={name:rule.name,active:true,conditionGroup:[{conditions:[pathCondition,{type:'host',op:'neq',value:d.url}]}],action:{mitigate:{action:'deny'}}};
  run(['firewall','rules','edit',rule.id,'--condition',JSON.stringify(pathCondition),'--condition',JSON.stringify({type:'host',op:'neq',value:d.url}),'--yes','--project',PROJECT]);publish([{action:'rules.update',id:rule.id,value:fenceValue}]);
  write('allow-new-inventory.json',inv);
  console.log(JSON.stringify({stage:'matching-protected-host-enabled',deploymentId:d.id,host:d.url}));
 } else if(mode==='smoke') {
  const p=target(),d=api(`/v13/deployments/${p.targets.production.id}?withGitRepoInfo=true`);demand(d.meta?.githubCommitSha===commit&&d.target==='production'&&d.readyState==='READY','NEW_PRODUCTION_NOT_READY');
  let token=tokenFrom(p);const smokeStartedAt=new Date().toISOString();const smokeResults=await Promise.all(['/','/api/auth/session','/api/clubs/release-smoke/removed-players'].map(path=>probe(d.url,path,token,{correlate:true})));token=null;
  demand(smokeResults.every(r=>r.appResponse&&r.status<500),'SMOKE_FAILED');write('smoke.json',{deploymentId:d.id,host:d.url,smokeStartedAt,smokeResults});console.log(JSON.stringify({stage:'read-only-new-deployment-smoke-passed',deploymentId:d.id,statuses:smokeResults.map(r=>({path:r.path,status:r.status}))}));
 } else if(mode==='runtime') {
  const smoke=read('smoke.json'),p=target(),d=api(`/v13/deployments/${smoke.deploymentId}?withGitRepoInfo=true`);
  demand(d.id===smoke.deploymentId&&d.url===smoke.host&&d.meta?.githubCommitSha===commit&&d.readyState==='READY'&&d.target==='production','DEPLOYMENT_CHANGED');currentProduction(d);
  const scope={projectId:PROJECT,teamId:TEAM,deploymentId:d.id,host:d.url};
  const runtime=await collectRuntimeEvidence(scope,smoke);validateRuntimeEvidence(runtime,scope,smoke);currentProduction(d);
  write('runtime-evidence.json',runtime);console.log(JSON.stringify({stage:'authenticated-complete-runtime-captured',deploymentId:d.id,requests:runtime.captures[1].raw.rows.length,errors:runtime.errorCount,httpErrors:runtime.httpErrorCount}));
 } else if(mode==='verify-deployment') {
  const m=read('maintenance-evidence.json'),smoke=read('smoke.json'),runtime=read('runtime-evidence.json');let p=target(),token=tokenFrom(p);const d=api(`/v13/deployments/${smoke.deploymentId}?withGitRepoInfo=true`);p=null;
  const aliasChecks=ALIASES.map(host=>{const a=api(`/v4/aliases/${host}`);demand(a.projectId===PROJECT,'ALIAS_PROJECT_CHANGED');return {host,deploymentId:a.deploymentId};});
  const allowed=read('allow-new-inventory.json'),inv=await inventory(d,{previous:[m.inventory,allowed],requireResolved:true});
  const o=firewall();cleanDraft();const oldHostDenials=await inventoryDenials(inv,d,token);token=null;
  // A deployment created while probes ran cannot silently escape the saved proof.
  const completed=await inventory(d,{previous:[inv],requireResolved:true,rejectNew:true});
  const e={...base(o),inventory:completed,permanentDenyHosts:permanentHosts(completed,m,d),observedAt:new Date().toISOString(),commit:d.meta?.githubCommitSha,target:d.target,state:d.readyState,deploymentId:d.id,host:d.url,aliasChecks,maintenanceRule:o.active.rules.find(r=>r.id===m.maintenanceRule.id),firewallRules:o.active.rules,oldHostDenials,...smoke,runtime};
  validateDeployment(e,plan,m);write('deployment-evidence.json',e);console.log(JSON.stringify({stage:'deployment-aliases-old-denials-and-runtime-verified',deploymentId:d.id,oldHosts:readyDenyHosts(completed,d.id).length}));
 } else if(mode==='thaw') {
  demand(process.argv[4]==='--approved-production-release','APPROVAL_REQUIRED');
  const e=read('deployment-evidence.json'),m=read('maintenance-evidence.json');validateDeployment(e,plan,m);
  const o=firewall();baseline(o);cleanDraft();demand(sameConditions(canonicalRules(o.active.rules),canonicalRules(e.firewallRules)),'VERIFIED_FIREWALL_CHANGED');
  const p=target(),d=api(`/v13/deployments/${p.targets.production.id}?withGitRepoInfo=true`);
  demand(d.id===e.deploymentId&&d.meta?.githubCommitSha===commit&&d.readyState==='READY'&&d.target==='production','DEPLOYMENT_CHANGED');
  for(const host of ALIASES){const a=api(`/v4/aliases/${host}`);demand(a.projectId===PROJECT&&a.deploymentId===d.id,'ALIAS_CHANGED');}
  const inv=await inventory(d,{previous:[m.inventory,e.inventory],requireResolved:true,rejectNew:true});
  demand(JSON.stringify(permanentHosts(inv,m,d))===JSON.stringify(e.permanentDenyHosts),'INVENTORY_DENY_HOSTS_CHANGED');
  let token=tokenFrom(p);await inventoryDenials(inv,d,token);token=null;
  const completed=await inventory(d,{previous:[inv],requireResolved:true,rejectNew:true});
  const report=read('rehearsal.json');demand(hash(fs.readFileSync(protectedFile(root,location('source.db'))))===report.backupSha256,'BACKUP_CHANGED');
  const client=createClient(credentials(root,'writer'));
  try {validateDeployment(e,plan,m);validateInventory(completed,{projectId:PROJECT,teamId:TEAM,plan,expected:binding(d),previous:[inv],requireResolved:true,rejectNew:true});const result=await thaw(client,plan,report);const state=await inspect(client,plan,report);demand(state.phase===62&&state.writesFrozen===false,'THAW_NOT_VERIFIED');write('thaw-evidence.json',{phase:state.phase,writesFrozen:state.writesFrozen,planSha256:plan.planSha256,deploymentId:d.id,inventory:completed,observedAt:new Date().toISOString()});console.log(JSON.stringify({stage:'database-freeze-removed-and-verified',outcome:result.outcome}));}finally {client.close();}
 } else if(mode==='open-http') {
  const e=read('deployment-evidence.json');validateDeployment(e,plan,read('maintenance-evidence.json'));const t=read('thaw-evidence.json');demand(t.phase===62&&t.writesFrozen===false&&t.planSha256===plan.planSha256,'VERIFIED_DATABASE_THAW_REQUIRED');
  const o=firewall();baseline(o);cleanDraft();demand(sameConditions(canonicalRules(o.active.rules),canonicalRules(e.firewallRules)),'VERIFIED_FIREWALL_CHANGED');
  const p=target(),d=api(`/v13/deployments/${p.targets.production.id}?withGitRepoInfo=true`);demand(d.id===e.deploymentId&&d.meta?.githubCommitSha===commit&&d.readyState==='READY'&&d.target==='production','DEPLOYMENT_CHANGED');
  for(const host of ALIASES){const a=api(`/v4/aliases/${host}`);demand(a.projectId===PROJECT&&a.deploymentId===d.id,'ALIAS_CHANGED');}
  const m=read('maintenance-evidence.json');
  demand(t.deploymentId===d.id&&t.inventory?.binding?.deploymentId===d.id,'THAW_INVENTORY_REQUIRED');
  validateInventory(t.inventory,{projectId:PROJECT,teamId:TEAM,plan,expected:binding(d),previous:[m.inventory,e.inventory],requireResolved:true,rejectNew:true,maxAge:900000});
  const inv=await inventory(d,{previous:[m.inventory,e.inventory,t.inventory],requireResolved:true,rejectNew:true});
  let token=tokenFrom(p);await inventoryDenials(inv,d,token);token=null;
  const completed=await inventory(d,{previous:[inv],requireResolved:true,rejectNew:true});
  const hosts=permanentHosts(completed,m,d);demand(JSON.stringify(hosts)===JSON.stringify(e.permanentDenyHosts),'INVENTORY_DENY_HOSTS_CHANGED');
  const permanent={name:oldName,active:true,conditionGroup:permanentDenyConditions(hosts),action:{mitigate:{action:'deny'}}};
  openingHttp=true;
  run(['firewall','rules','edit',e.maintenanceRule.id,'--json',JSON.stringify(permanent),'--yes','--project',PROJECT]);publish([{action:'rules.update',id:e.maintenanceRule.id,value:permanent}]);
  const after=firewall();baseline(after);demand(after.active.rules.length===3&&sameConditions(canonicalRules(after.active.rules.filter(r=>r.id===e.maintenanceRule.id)),canonicalRules([{id:e.maintenanceRule.id,...permanent}])),'HTTP_THAW_FAILED');
  const finalInventory=await inventory(d,{previous:[completed],requireResolved:true,rejectNew:true});
  let finalToken=tokenFrom(target());const finalDenials=await inventoryDenials(finalInventory,d,finalToken);finalToken=null;
  const finalCompleted=await inventory(d,{previous:[finalInventory],requireResolved:true,rejectNew:true});
  write('http-open-evidence.json',{...base(after),observedAt:new Date().toISOString(),deploymentId:d.id,commit,host:d.url,inventory:finalCompleted,permanentDenyHosts:hosts,firewallRules:after.active.rules,oldHostDenials:finalDenials});
  openingHttp=false;
  console.log(JSON.stringify({stage:'public-http-reopened',oldGenerationsRemainDenied:true}));
 } else if(mode==='public-runtime') {
  const opened=read('http-open-evidence.json'),thawed=read('thaw-evidence.json');
  demand(opened.projectId===PROJECT&&opened.teamId===TEAM&&opened.commit===commit&&thawed.phase===62&&thawed.writesFrozen===false&&thawed.deploymentId===opened.deploymentId,'PUBLIC_CUTOVER_EVIDENCE_REQUIRED');
  const d=api(`/v13/deployments/${opened.deploymentId}?withGitRepoInfo=true`);
  demand(d.id===opened.deploymentId&&d.url===opened.host&&d.meta?.githubCommitSha===commit,'DEPLOYMENT_CHANGED');currentProduction(d);
  const before=firewall();baseline(before);cleanDraft();demand(sameConditions(canonicalRules(before.active.rules),canonicalRules(opened.firewallRules)),'PUBLIC_FIREWALL_CHANGED');
  const scope=publicRuntimeScope({projectId:PROJECT,teamId:TEAM,deploymentId:d.id,host:d.url});
  const smokeStartedAt=new Date().toISOString();demand(Date.parse(smokeStartedAt)>=Date.parse(opened.observedAt),'PUBLIC_WINDOW_BEFORE_OPEN');
  const smokeResults=await Promise.all(['/','/api/auth/session'].map(path=>probe(ALIASES[0],path,undefined,{correlate:true})));
  demand(smokeResults.every(result=>result.appResponse&&result.status===200&&result.protectionBypassSent===false),'PUBLIC_SMOKE_FAILED');
  const smoke={deploymentId:d.id,host:d.url,smokeStartedAt,smokeResults};
  const runtime=await collectRuntimeEvidence(scope,smoke);validateRuntimeEvidence(runtime,scope,smoke);currentProduction(d);
  const after=firewall();baseline(after);cleanDraft();demand(sameConditions(canonicalRules(after.active.rules),canonicalRules(opened.firewallRules)),'PUBLIC_FIREWALL_CHANGED');
  write('public-runtime-evidence.json',{...base(after),observedAt:new Date().toISOString(),commit,deploymentId:d.id,host:d.url,smoke,runtime});
  console.log(JSON.stringify({stage:'fresh-public-runtime-verified',deploymentId:d.id,requests:runtime.captures[1].raw.rows.length,errors:runtime.errorCount,schemaFailures:runtime.schemaFailureCount,httpErrors:runtime.httpErrorCount,freezeErrors:runtime.freezeFailureCount}));
 } else throw Error('Unknown operator mode');
} catch(e){
 if(openingHttp) {try {recloseAfterOpeningFailure();}catch {console.error('PRODUCTION_RELEASE62_HTTP_FENCE_RESTORE_NOT_VERIFIED');process.exitCode=1;}}
 console.error(/^PRODUCTION_RELEASE62_[A-Z0-9_]+$/.test(e.message)?e.message:'PRODUCTION_RELEASE62_VERCEL_STOPPED_KEEP_HTTP_FENCE');process.exitCode=1;
}
