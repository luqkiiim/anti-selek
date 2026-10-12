import {demand,hash,stable,PREDECESSOR,validateReviewReceipt} from './production-release62.mjs';
import {validateInventory,permanentDenyHosts,permanentDenyConditions,readyDenyHosts} from './production-release62-inventory.mjs';
import {validateRuntimeEvidence} from './production-release62-runtime.mjs';
export const PROJECT='prj_qouB4g5zkv4d8nL2g4NjLfdvjfeY';
export const TEAM='team_sS6kaZurbqCwtgU9VGhynSMR';
export const ALIASES=['antiselek.com','anti-selek.vercel.app','anti-selek-luqkiiims-projects.vercel.app','anti-selek-git-main-luqkiiims-projects.vercel.app'];
export const PREVIOUS_DEPLOYMENT='dpl_AE3NSziPepj8s8UKniYcTGA3VYb9';
export const PREVIOUS_HOST='anti-selek-lpfghadtp-luqkiiims-projects.vercel.app';
export const FENCE_ID='rule_temporary_ownership_release_maintenance_6EdivN';
export const INITIAL_FIREWALL_HASH='bb2a5bed2e378bcf3984d8035414befafd136d59c64d4361980a9885477de706';
export const LEGACY_IDS=['rule_block_legacy_preview_database_access_rnoMzQ','rule_block_pre_phase1_production_deployments_aGIB0C'];
export const LEGACY_HASH='387b70652a5e91b45ee83ae90032ff051df5bf533118bc6d75514b580e08ff54';
export const canonicalRules=rules=>rules.map(({id,name,action,active,conditionGroup})=>({id,name,action,active,conditionGroup})).sort((a,b)=>a.id.localeCompare(b.id));
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
export const sameConditions=(a,b)=>stable(ordered(a))===stable(ordered(b));
const fresh=(value,maxAge,now)=>{const age=now-Date.parse(value);return Number.isFinite(age)&&age>=0&&age<maxAge;};
const deny=rule=>rule?.active===true&&rule.action?.mitigate?.action==='deny'&&typeof rule.id==='string';
function baseline(e,plan,now) {
  demand(e?.version===1 && e.source==='authenticated-vercel-api-and-http' && e.projectId===PROJECT && e.teamId===TEAM && e.planSha256===plan.planSha256,'EVIDENCE_TARGET_INVALID');
  demand(fresh(e.observedAt,3600000,now),'EVIDENCE_EXPIRED');
  demand(typeof e.activeConfigId==='string' && e.activeConfigId.length>0 && Array.isArray(e.pendingDraftChanges) && e.pendingDraftChanges.length===0,'ACTIVE_FIREWALL_REQUIRED');
  demand(Array.isArray(e.legacyRules) && e.legacyRules.length===2 && LEGACY_IDS.every(id=>e.legacyRules.some(r=>r.id===id && deny(r)))
    && hash(stable(canonicalRules(e.legacyRules)))===LEGACY_HASH,'LEGACY_RULES_CHANGED');
}
function inventory(e,plan,now,{initial=false,previous=[],maxAge=60000}={}) {
  const expected=initial?{deploymentId:PREVIOUS_DEPLOYMENT,host:PREVIOUS_HOST,commit:PREDECESSOR}:{deploymentId:e.deploymentId,host:e.host,commit:e.commit};
  const hosts=validateInventory(e.inventory,{projectId:PROJECT,teamId:TEAM,plan,expected,previous,now,maxAge,requireResolved:!initial});
  demand(e.inventory.deployments.filter(d=>d.target==='production'&&d.state==='READY').length>=31,'PRODUCTION_INVENTORY_REQUIRED');
  demand(e.inventory.deployments.some(d=>d.id===PREVIOUS_DEPLOYMENT && d.host===PREVIOUS_HOST && d.commit===PREDECESSOR && d.target==='production' && d.state==='READY'),'PREVIOUS_DEPLOYMENT_CHANGED');
  return initial?readyDenyHosts(e.inventory):hosts;
}
function checkDenials(results,hosts,now) {
  demand(Array.isArray(results) && results.length===hosts.length*2,'HOST_DENIALS_INCOMPLETE');
  for(const host of hosts)for(const path of ['/favicon.ico','/api/auth/session']) {
    const matching=results.filter(r=>r.host===host&&r.path===path);
    demand(matching.length===1 && matching[0].status===403 && matching[0].denyMarker===true && matching[0].redirectsFollowed===false
      && matching[0].protectionBypassSent===true && fresh(matching[0].observedAt,900000,now),'CONCRETE_HOST_DENIAL_REQUIRED');
  }
}
export function validateMaintenance(e,plan,now=Date.now(),{requireDrained=true}={}) {
  baseline(e,plan,now);const hosts=[...new Set([...ALIASES,...inventory(e,plan,now,{initial:true,maxAge:3600000})])];
  validateReviewReceipt(e.independentReview,plan);
  demand(e.independentReview?.passed===true && e.independentReview.commit===plan.commit && Array.isArray(e.independentReview.reviewers)
    && e.independentReview.reviewers.length>=2 && new Set(e.independentReview.reviewers).size===e.independentReview.reviewers.length
    && e.independentReview.reviewers.every(r=>typeof r==='string'&&r.length>0&&r!=='/root'),'SEPARATE_REVIEW_REQUIRED');
  demand(Array.isArray(e.initialFirewallRules) && e.initialFirewallRules.length===3
    && hash(stable(canonicalRules(e.initialFirewallRules)))===INITIAL_FIREWALL_HASH,'INITIAL_FIREWALL_CHANGED');
  demand(e.maintenanceRule?.id===FENCE_ID && Array.isArray(e.firewallRules) && e.firewallRules.length===3 && e.firewallRules.every(r=>LEGACY_IDS.includes(r.id)||r.id===FENCE_ID) && sameConditions(canonicalRules(e.firewallRules.filter(r=>LEGACY_IDS.includes(r.id))),canonicalRules(e.legacyRules)) && sameConditions(canonicalRules(e.firewallRules.filter(r=>r.id===FENCE_ID)),canonicalRules([e.maintenanceRule])) && deny(e.maintenanceRule) && sameConditions(e.maintenanceRule.conditionGroup,[{conditions:[{type:'path',op:'pre',value:'/'}]}]),'PROJECT_WIDE_HTTP_FENCE_REQUIRED');
  checkDenials(e.denials,hosts,now);
  demand(Number.isFinite(Date.parse(e.drainNotBefore)) && Date.parse(e.drainNotBefore)>=Date.parse(e.observedAt)+330000,'DRAIN_WINDOW_INVALID');
  if(requireDrained)demand(now>=Date.parse(e.drainNotBefore),'HTTP_DRAIN_NOT_COMPLETE');
  return hosts;
}
export function validateLiveMaintenance(live,original,plan,now=Date.now()) {
  validateMaintenance(original,plan,now);
  demand(live?.source==='authenticated-vercel-api-and-http-pre-writer' && live.planSha256===plan.planSha256
    && live.commit===plan.commit && fresh(live.observedAt,60000,now),'LIVE_MAINTENANCE_REQUIRED');
  // Active config IDs identify immutable published configurations. A different
  // config cannot prove an uninterrupted drain, even if its rules look equal.
  demand(live.activeConfigId===original.activeConfigId
    && sameConditions(canonicalRules(live.firewallRules??[]),canonicalRules(original.firewallRules))
    && Array.isArray(live.pendingDraftChanges)&&live.pendingDraftChanges.length===0,'MAINTENANCE_CONTINUITY_LOST_RESTART_DRAIN');
  demand(live.deploymentId===PREVIOUS_DEPLOYMENT && live.host===PREVIOUS_HOST && live.predecessorCommit===PREDECESSOR
    && live.aliasChecks?.length===ALIASES.length
    && ALIASES.every(host=>live.aliasChecks.some(a=>a.host===host&&a.deploymentId===PREVIOUS_DEPLOYMENT)),'LIVE_PREDECESSOR_CHANGED');
  const expected={deploymentId:PREVIOUS_DEPLOYMENT,host:PREVIOUS_HOST,commit:PREDECESSOR};
  validateInventory(live.inventory,{projectId:PROJECT,teamId:TEAM,plan,expected,previous:[original.inventory],now,maxAge:60000,rejectNew:true});
  checkDenials(live.denials,[...new Set([...ALIASES,...readyDenyHosts(live.inventory)])],now);
  demand(live.denials.every(r=>fresh(r.observedAt,60000,now)),'LIVE_DENIALS_EXPIRED');
}
export function validateDeployment(e,plan,maintenance,now=Date.now()) {
  baseline(e,plan,now);
  demand(fresh(e.observedAt,900000,now) && e.commit===plan.commit && e.target==='production' && e.state==='READY' && typeof e.deploymentId==='string'
    && /^anti-selek-[a-z0-9-]+\.vercel\.app$/.test(e.host) && e.host!==PREVIOUS_HOST,'MATCHING_DEPLOYMENT_REQUIRED');
  demand(Array.isArray(e.aliasChecks) && e.aliasChecks.length===ALIASES.length && ALIASES.every(host=>e.aliasChecks.some(a=>a.host===host&&a.deploymentId===e.deploymentId)),'CONCRETE_ALIAS_CHECKS_REQUIRED');
  // The original complete baseline remains proof; completion uses a freshly collected
  // superset and includes initial in-flight deployments that became READY later.
  inventory(maintenance,plan,now,{initial:true,maxAge:Infinity});
  inventory(e,plan,now,{previous:[maintenance.inventory],maxAge:900000});
  const permanentHosts=permanentDenyHosts(e.inventory,maintenance.initialFirewallRules,FENCE_ID,{deploymentId:e.deploymentId,host:e.host,commit:e.commit});
  demand(sameConditions(e.permanentDenyHosts,permanentHosts),'INVENTORY_PERMANENT_DENIALS_INCOMPLETE');
  permanentDenyConditions(permanentHosts);
  const oldHosts=readyDenyHosts(e.inventory,e.deploymentId);
  // The one observed physical fence denies every host except the exact new deployment, including all old hosts.
  demand(e.maintenanceRule?.id===maintenance.maintenanceRule.id && Array.isArray(e.firewallRules) && e.firewallRules.length===3
    && sameConditions(canonicalRules(e.firewallRules.filter(r=>LEGACY_IDS.includes(r.id))),canonicalRules(e.legacyRules))
    && sameConditions(canonicalRules(e.firewallRules.filter(r=>r.id===e.maintenanceRule.id)),canonicalRules([e.maintenanceRule]))
    && e.firewallRules.every(r=>LEGACY_IDS.includes(r.id)||r.id===e.maintenanceRule.id),'EXACT_THREE_RULE_CONFIG_REQUIRED');
  checkDenials(e.oldHostDenials,oldHosts,now);
  demand(deny(e.maintenanceRule) && sameConditions(e.maintenanceRule.conditionGroup,[{conditions:[{type:'path',op:'pre',value:'/'},{type:'host',op:'neq',value:e.host}]}]),'MAINTENANCE_FENCE_CHANGED');
  validateRuntimeEvidence(e.runtime,{projectId:PROJECT,teamId:TEAM,deploymentId:e.deploymentId,host:e.host},{deploymentId:e.deploymentId,host:e.host,smokeStartedAt:e.smokeStartedAt,smokeResults:e.smokeResults});
  demand(e.runtime?.source==='authenticated-vercel-runtime-logs' && Number.isSafeInteger(e.runtime.errorCount) && e.runtime.errorCount>=0 && e.runtime.errorCount<=2 && e.runtime.unexpectedErrorCount===0
    && e.runtime.collection?.groupBy==='level' && sameConditions(e.runtime.collection.countedLevels,['error','fatal'])
    && e.runtime.collection.captureComplete===true && Number.isSafeInteger(e.runtime.collection.rawLimit) && e.runtime.collection.rawLimit>e.runtime.errorCount
    && e.runtime.collection.returnedErrorRows===e.runtime.errorCount
    && Number.isSafeInteger(e.runtime.collection.groupedErrorCount) && e.runtime.collection.groupedErrorCount>=0
    && Number.isSafeInteger(e.runtime.collection.groupedFatalCount) && e.runtime.collection.groupedFatalCount>=0
    && e.runtime.collection.groupedFatalCount===0 && e.runtime.collection.groupedErrorCount===e.runtime.errorCount
    && Array.isArray(e.runtime.expectedFreezeErrors) && e.runtime.expectedFreezeErrors.length===e.runtime.errorCount
    && new Set(e.runtime.expectedFreezeErrors.map(r=>r.requestId)).size===e.runtime.expectedFreezeErrors.length
    && new Set(e.runtime.expectedFreezeErrors.map(r=>r.path)).size===e.runtime.expectedFreezeErrors.length
    && e.runtime.expectedFreezeErrors.every(r=>typeof r.requestId==='string' && r.requestId.length>0 && r.deploymentId===e.deploymentId && r.method==='GET' && r.level==='error' && r.source==='function'
      && ['/api/auth/session','/api/clubs/release-smoke/removed-players'].includes(r.path) && r.classification==='Rate limit storage error'
      && r.code==='SQLITE_CONSTRAINT' && r.constraint==='PRODUCTION_RELEASE62_WRITES_FROZEN'
      && Date.parse(r.observedAt)>=Date.parse(e.smokeStartedAt) && Date.parse(r.observedAt)<=Date.parse(e.runtime.observedAt) && fresh(r.observedAt,900000,now)
      && e.smokeResults?.some(s=>s.host===e.host&&s.path===r.path&&s.method==='GET'&&s.appResponse===true
        && s.status===(r.path==='/api/auth/session'?200:401)))
    && e.runtime.since===e.smokeStartedAt && Date.parse(e.runtime.observedAt)>=Date.parse(e.smokeStartedAt)
    && e.smokeResults?.every(s=>Date.parse(e.runtime.observedAt)>=Date.parse(s.observedAt))
    && fresh(e.runtime.observedAt,900000,now) && fresh(e.smokeStartedAt,900000,now),'FRESH_RUNTIME_LOGS_REQUIRED');
  demand(Array.isArray(e.smokeResults) && e.smokeResults.length===3
    && [['/',200],['/api/auth/session',200],['/api/clubs/release-smoke/removed-players',401]].every(([path,status])=>e.smokeResults.filter(r=>r.host===e.host&&r.path===path&&r.status===status).length===1)
    && e.smokeResults.every(r=>r.method==='GET'&&r.status<500 && r.appResponse===true && r.protectionBypassSent===true
      && r.redirectsFollowed===false && fresh(r.observedAt,900000,now)),'READ_ONLY_SMOKE_REQUIRED');
}
