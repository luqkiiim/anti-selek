import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertProductionBaseline,demand,loadPlan } from './production-release59.mjs';
import { protectedArtifact,sealArtifact } from './production-release59-security.mjs';
import { parseRecoveryCredentials,loadRecoverySource,restoreRecoveryTarget,validateRecoveryTarget,RECOVERY_TARGET } from './production-release59-recovery.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function parseRecoveryArguments(argv) {
  const values=new Map();let mode;
  for(let index=0;index<argv.length;index++) {
    const key=argv[index];demand(!values.has(key),'RECOVERY_ARGUMENTS_INVALID');
    if(key==='--restore' || key==='--verify-only') {demand(!mode,'RECOVERY_ARGUMENTS_INVALID');mode=key==='--restore'?'apply':'verify-only';values.set(key,true);}
    else {
      demand(['--release-commit','--confirm-recovery-name','--confirm-recovery-endpoint-sha256'].includes(key) && argv[index+1] && !argv[index+1].startsWith('--'),'RECOVERY_ARGUMENTS_INVALID');
      values.set(key,argv[++index]);
    }
  }
  demand(mode && values.size===4 && /^[0-9a-f]{40}$/.test(values.get('--release-commit')??''),'RECOVERY_CONFIRMATIONS_REQUIRED');
  return {mode,releaseCommit:values.get('--release-commit'),confirmation:{databaseName:values.get('--confirm-recovery-name'),endpointSha256:values.get('--confirm-recovery-endpoint-sha256')}};
}
async function main() {
  const args=parseRecoveryArguments(process.argv.slice(2));
  const plan=loadPlan(root,{releaseCommit:args.releaseCommit});
  for(const name of ['production-release59-recovery.mjs','run-production-release59-recovery.mjs']) {
    const committed=execFileSync('git',['show',`${args.releaseCommit}:scripts/${name}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    demand(committed.replaceAll('\r\n','\n')===fs.readFileSync(path.join(root,'scripts',name),'utf8').replaceAll('\r\n','\n'),'RECOVERY_HELPER_NOT_COMMITTED');
  }
  const target=validateRecoveryTarget(RECOVERY_TARGET,args.confirmation);
  const report=JSON.parse(fs.readFileSync(protectedArtifact('rehearsal.json'),'utf8'));assertProductionBaseline(report.before);
  const source=await loadRecoverySource(protectedArtifact('source.db'),plan,report);
  const output=protectedArtifact('restore-evidence.json',{exists:false});
  const credentials=parseRecoveryCredentials(fs.readFileSync(protectedArtifact('recovery.env'),'utf8'),target,args.confirmation);
  const {createClient}=await import('@libsql/client');const client=createClient(credentials);
  try {
    const result=await restoreRecoveryTarget(client,{target,confirmation:args.confirmation,source,plan,report,mode:args.mode});
    fs.writeFileSync(output,JSON.stringify(result.evidence,null,2));sealArtifact(output);
    console.log(JSON.stringify({stage:'hosted-nonproduction-recovery-verified',outcome:result.outcome,backupSha256:report.backupSha256,integrity:'ok',foreignKeyViolations:0}));
  }finally{client.close();}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{
  console.error(/^PRODUCTION_RELEASE59_[A-Z0-9_]+$/.test(error?.code??'')?error.code:'PRODUCTION_RELEASE59_RECOVERY_STOPPED');process.exitCode=1;
});
