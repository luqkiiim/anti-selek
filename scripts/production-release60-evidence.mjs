import {demand,hash,stable,PREDECESSOR} from './production-release60.mjs';
export const PROJECT='prj_qouB4g5zkv4d8nL2g4NjLfdvjfeY';
export const TEAM='team_sS6kaZurbqCwtgU9VGhynSMR';
export const ALIASES=['antiselek.com','anti-selek.vercel.app','anti-selek-luqkiiims-projects.vercel.app','anti-selek-git-main-luqkiiims-projects.vercel.app'];
export const PREVIOUS_DEPLOYMENT='dpl_3LiP8Tp1YtYkrVAQLZRWB542wFDX';
export const PREVIOUS_HOST='anti-selek-beyne8kvo-luqkiiims-projects.vercel.app';
export const LEGACY_IDS=['rule_block_legacy_preview_database_access_rnoMzQ','rule_block_pre_phase1_production_deployments_aGIB0C'];
export const LEGACY_HASH='387b70652a5e91b45ee83ae90032ff051df5bf533118bc6d75514b580e08ff54';
export const canonicalRules=rules=>rules.map(({id,name,action,active,conditionGroup})=>({id,name,action,active,conditionGroup})).sort((a,b)=>a.id.localeCompare(b.id));
const fresh=(value,maxAge,now)=>{const age=now-Date.parse(value);return Number.isFinite(age)&&age>=0&&age<maxAge;};
const deny=rule=>rule?.active===true&&rule.action?.mitigate?.action==='deny'&&typeof rule.id==='string';
function baseline(e,plan,now) {
  demand(e?.version===1 && e.source==='authenticated-vercel-api-and-http' && e.projectId===PROJECT && e.teamId===TEAM && e.planSha256===plan.planSha256,'EVIDENCE_TARGET_INVALID');
  demand(fresh(e.observedAt,3600000,now),'EVIDENCE_EXPIRED');
  demand(typeof e.activeConfigId==='string' && e.activeConfigId.length>0 && Array.isArray(e.pendingDraftChanges) && e.pendingDraftChanges.length===0,'ACTIVE_FIREWALL_REQUIRED');
  demand(Array.isArray(e.legacyRules) && e.legacyRules.length===2 && LEGACY_IDS.every(id=>e.legacyRules.some(r=>r.id===id && deny(r)))
    && hash(stable(canonicalRules(e.legacyRules)))===LEGACY_HASH,'LEGACY_RULES_CHANGED');
}
function inventory(e) {
  demand(e.inventory?.complete===true && e.inventory.nextCursor===null && e.inventory.source==='authenticated-vercel-api'
    && Array.isArray(e.inventory.deployments) && e.inventory.deployments.length>=30
    && e.inventory.deployments.every(d=>typeof d.id==='string' && /^anti-selek-[a-z0-9-]+\.vercel\.app$/.test(d.host) && d.target==='production' && d.state==='READY'),'PRODUCTION_INVENTORY_REQUIRED');
  demand(e.inventory.deployments.some(d=>d.id===PREVIOUS_DEPLOYMENT && d.host===PREVIOUS_HOST && d.commit===PREDECESSOR),'PREVIOUS_DEPLOYMENT_CHANGED');
  return [...new Set(e.inventory.deployments.map(d=>d.host))];
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
  baseline(e,plan,now);const hosts=[...new Set([...ALIASES,...inventory(e)])];
  demand(e.independentReview?.passed===true && e.independentReview.commit===plan.commit && typeof e.independentReview.reviewer==='string','SEPARATE_REVIEW_REQUIRED');
  demand(deny(e.maintenanceRule) && stable(e.maintenanceRule.conditionGroup)===stable([{conditions:[{type:'path',op:'pre',value:'/'}]}]),'PROJECT_WIDE_HTTP_FENCE_REQUIRED');
  checkDenials(e.denials,hosts,now);
  demand(Number.isFinite(Date.parse(e.drainNotBefore)) && Date.parse(e.drainNotBefore)>=Date.parse(e.observedAt)+330000,'DRAIN_WINDOW_INVALID');
  if(requireDrained)demand(now>=Date.parse(e.drainNotBefore),'HTTP_DRAIN_NOT_COMPLETE');
  return hosts;
}
export function validateDeployment(e,plan,maintenance,now=Date.now()) {
  baseline(e,plan,now);
  demand(fresh(e.observedAt,900000,now) && e.commit===plan.commit && e.target==='production' && e.state==='READY' && typeof e.deploymentId==='string'
    && /^anti-selek-[a-z0-9-]+\.vercel\.app$/.test(e.host) && e.host!==PREVIOUS_HOST,'MATCHING_DEPLOYMENT_REQUIRED');
  demand(Array.isArray(e.aliasChecks) && e.aliasChecks.length===ALIASES.length && ALIASES.every(host=>e.aliasChecks.some(a=>a.host===host&&a.deploymentId===e.deploymentId)),'CONCRETE_ALIAS_CHECKS_REQUIRED');
  const oldHosts=inventory(e);demand(stable(e.inventory)===stable(maintenance.inventory) && !oldHosts.includes(e.host),'OLD_INVENTORY_CHANGED');
  demand(deny(e.previousGenerationRule) && stable(e.previousGenerationRule.conditionGroup)===stable([{conditions:[{type:'host',op:'inc',value:[...oldHosts].sort()}]}]),'OLD_GENERATION_RULE_REQUIRED');
  checkDenials(e.oldHostDenials,oldHosts,now);
  demand(deny(e.maintenanceRule) && stable(e.maintenanceRule.conditionGroup)===stable([{conditions:[{type:'path',op:'pre',value:'/'},{type:'host',op:'neq',value:e.host}]}]),'MAINTENANCE_FENCE_CHANGED');
  demand(e.runtime?.source==='authenticated-vercel-runtime-logs' && e.runtime.errorCount===0 && e.runtime.since===e.smokeStartedAt
    && fresh(e.runtime.observedAt,900000,now) && fresh(e.smokeStartedAt,900000,now),'FRESH_RUNTIME_LOGS_REQUIRED');
  demand(Array.isArray(e.smokeResults) && e.smokeResults.some(r=>r.host===e.host&&r.path==='/'&&r.status===200)
    && e.smokeResults.some(r=>r.host===e.host&&r.path==='/api/auth/session'&&r.status===200)
    && e.smokeResults.every(r=>r.method==='GET'&&r.status<500 && r.appResponse===true && r.protectionBypassSent===true
      && r.redirectsFollowed===false && fresh(r.observedAt,900000,now)),'READ_ONLY_SMOKE_REQUIRED');
}
