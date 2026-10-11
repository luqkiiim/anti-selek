import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlan,ENDPOINT_SHA256,demand,inspectRelease,freezeRelease,applyRelease,rehearseBackup,thawRelease,hash,assertProductionBaseline,validateRestoreEvidence,validateDeploymentEvidence } from './production-release59.mjs';
import { protectedArtifact,sealArtifact,loadCredentials } from './production-release59-security.mjs';
import { backupLibsqlReadOnly } from './account-player-preservation.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function parseArguments(argv) {
  const modes=new Set(['--inspect','--backup','--rehearse','--freeze','--apply','--verify','--thaw']);
  const flags=new Map(); let mode;
  for(let index=0;index<argv.length;index++) {
    const key=argv[index];
    demand(!flags.has(key),'ARGUMENTS_INVALID');
    if(modes.has(key)) {demand(!mode,'ARGUMENTS_INVALID');mode=key;flags.set(key,true);}
    else if(key==='--approved-production-release' || key==='--old-generations-denied-and-deployment-verified') flags.set(key,true);
    else {demand(['--release-commit','--confirm-endpoint-sha256'].includes(key) && argv[index+1] && !argv[index+1].startsWith('--'),'ARGUMENTS_INVALID');flags.set(key,argv[++index]);}
  }
  demand(mode && flags.get('--confirm-endpoint-sha256')===ENDPOINT_SHA256 && /^[a-f0-9]{40}$/.test(flags.get('--release-commit')??''),'CONFIRMATION_REQUIRED');
  if(['--freeze','--apply','--thaw'].includes(mode)) demand(flags.get('--approved-production-release'),'APPROVAL_REQUIRED');
  if(mode==='--thaw') demand(flags.get('--old-generations-denied-and-deployment-verified'),'DEPLOYMENT_AND_OLD_HOST_DENIAL_REQUIRED');
  return {mode,releaseCommit:flags.get('--release-commit')};
}
function report() {
  const saved=JSON.parse(fs.readFileSync(protectedArtifact('rehearsal.json'),'utf8'));
  demand(hash(fs.readFileSync(protectedArtifact('source.db')))===saved.backupSha256,'BACKUP_HASH_INVALID');
  assertProductionBaseline(saved.before);
  return saved;
}
async function main() {
  const args=parseArguments(process.argv.slice(2)); const plan=loadPlan(root,{releaseCommit:args.releaseCommit});
  if(args.mode==='--rehearse') {
    const restored=protectedArtifact('restored.db',{exists:false});
    const result=await rehearseBackup(protectedArtifact('source.db'),restored,plan);
    assertProductionBaseline(result.before);
    sealArtifact(restored);
    const output=protectedArtifact('rehearsal.json',{exists:false});fs.writeFileSync(output,JSON.stringify(result,null,2));sealArtifact(output);
    console.log(JSON.stringify({stage:'offline-restored-rehearsal-passed',planSha256:plan.planSha256,guardCount:83,integrity:'ok',foreignKeyViolations:0}));return;
  }
  const role=['--freeze','--apply','--thaw'].includes(args.mode)?'writer':'reader';
  const credentials=loadCredentials(role); // No environment-variable or Dev credential fallback.
  const {createClient}=await import('@libsql/client'); const client=createClient(credentials);
  try {
    if(args.mode==='--backup') {
      const output=protectedArtifact('source.db',{exists:false});await backupLibsqlReadOnly(client,output);sealArtifact(output);
      console.log(JSON.stringify({stage:'read-only-consistent-backup-created',backupSha256:hash(fs.readFileSync(output))}));return;
    }
    if(args.mode==='--inspect') {
      const current=await inspectRelease(client,plan);
      assertProductionBaseline(current);
      const output=protectedArtifact('inspection.json',{exists:false});fs.writeFileSync(output,JSON.stringify(current,null,2));sealArtifact(output);
      console.log(JSON.stringify({stage:'read-only-inspected',applied:current.ledger.length,pending:5,dataSha256:current.dataSha256}));return;
    }
    const saved=report();
    if(['--freeze','--apply'].includes(args.mode)) validateRestoreEvidence(JSON.parse(fs.readFileSync(protectedArtifact('restore-evidence.json'),'utf8')),plan,saved);
    if(args.mode==='--thaw') validateDeploymentEvidence(JSON.parse(fs.readFileSync(protectedArtifact('deployment-evidence.json'),'utf8')),plan);
    if(args.mode==='--freeze') {await freezeRelease(client,plan,saved);console.log(JSON.stringify({stage:'writes-frozen',productionApplicationWrites:0}));}
    else if(args.mode==='--apply') console.log(JSON.stringify(await applyRelease(client,plan,saved)));
    else if(args.mode==='--verify') {const state=await inspectRelease(client,plan,saved);console.log(JSON.stringify({stage:'read-only-postverify',phase:state.phase,dataSha256:state.current.dataSha256,writesRemainFrozen:true}));}
    else {await thawRelease(client,plan,saved);console.log(JSON.stringify({stage:'freeze-triggers-removed'}));}
  } finally {client.close();}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{
  console.error(/^PRODUCTION_RELEASE59_[A-Z0-9_]+$/.test(error?.code??'')?error.code:'PRODUCTION_RELEASE59_STOPPED_KEEP_FREEZE');process.exitCode=1;
});
