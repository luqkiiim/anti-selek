import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { backupLibsqlReadOnly } from './account-player-preservation.mjs';
import { credentials,protectedFile,seal } from './production-release61-security.mjs';
import { loadPlan,ENDPOINT,demand,hash,inspect,freeze,apply,rehearse,thaw,validateReviewReceipt } from './production-release61.mjs';
import { validateMaintenance,validateDeployment } from './production-release61-evidence.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function argumentsFor(argv) {
  const flags=new Map();let mode;
  for(let i=0;i<argv.length;i++) {
    const k=argv[i];demand(!flags.has(k),'ARGUMENTS_INVALID');
    if(['--backup','--rehearse','--inspect','--freeze','--apply','--verify','--thaw'].includes(k)) {demand(!mode,'ARGUMENTS_INVALID');mode=k;flags.set(k,true);}
    else if(k==='--approved-production-release')flags.set(k,true);
    else {demand(['--release-commit','--confirm-endpoint-sha256'].includes(k) && argv[i+1] && !argv[i+1].startsWith('--'),'ARGUMENTS_INVALID');flags.set(k,argv[++i]);}
  }
  demand(mode && flags.get('--confirm-endpoint-sha256')===ENDPOINT && /^[a-f0-9]{40}$/.test(flags.get('--release-commit')??''),'PIN_REQUIRED');
  if(['--freeze','--apply','--thaw'].includes(mode))demand(flags.get('--approved-production-release'),'APPROVAL_REQUIRED');
  return {mode,commit:flags.get('--release-commit')};
}
const file=(name,options)=>protectedFile(root,`private/production-release61/${name}`,options);
const read=name=>JSON.parse(fs.readFileSync(file(name),'utf8'));
const write=(name,data)=>{fs.writeFileSync(file(name,{exists:false}),JSON.stringify(data,null,2),{flag:'wx',mode:0o600});seal(root,`private/production-release61/${name}`);};
export async function main(argv=process.argv.slice(2)) {
  const args=argumentsFor(argv),plan=loadPlan(root,args.commit);
  if(args.mode==='--rehearse') {
    const result=await rehearse(file('source.db'),file('restored.db',{exists:false}),plan);seal(root,'private/production-release61/restored.db');write('rehearsal.json',result);
    console.log(JSON.stringify({stage:'offline-full-row-rehearsal-passed',migrations:61,guards:result.afterSchema.filter(r=>r.type==='trigger').length,views:result.afterSchema.filter(r=>r.type==='view').length,integrity:'ok',foreignKeyViolations:0}));return;
  }
  const role=['--freeze','--apply','--thaw'].includes(args.mode)?'writer':'reader';
  const client=createClient(credentials(root,role));
  try {
    if(args.mode==='--backup') {await backupLibsqlReadOnly(client,file('source.db',{exists:false}));seal(root,'private/production-release61/source.db');console.log(JSON.stringify({stage:'read-only-consistent-backup',backupSha256:hash(fs.readFileSync(file('source.db')))}));return;}
    if(args.mode==='--inspect') {const s=await inspect(client,plan);write('inspection.json',s);console.log(JSON.stringify({stage:'read-only-inspected',migrations:60,guards:90,views:5}));return;}
    const report=read('rehearsal.json');demand(hash(fs.readFileSync(file('source.db')))===report.backupSha256,'BACKUP_CHANGED');
    if(args.mode==='--freeze'||args.mode==='--apply') {
      const fence=read('maintenance-evidence.json');
      validateReviewReceipt(fence.independentReview,plan);
      validateMaintenance(fence,plan);
    }
    if(args.mode==='--freeze') {await freeze(client,plan,report);console.log(JSON.stringify({stage:'database-writes-frozen'}));}
    else if(args.mode==='--apply')console.log(JSON.stringify(await apply(client,plan,report)));
    else if(args.mode==='--verify') {const s=await inspect(client,plan,report);console.log(JSON.stringify({stage:'read-only-verified',phase:s.phase,existingRowsPreserved:true,writesRemainFrozen:s.writesFrozen}));}
    else {
      demand(false,'THAW_REQUIRES_REVALIDATED_VERCEL_OPERATOR');
      const deployment=read('deployment-evidence.json');
      validateDeployment(deployment,plan,read('maintenance-evidence.json'));
      await thaw(client,plan,report);console.log(JSON.stringify({stage:'database-freeze-removed'}));
    }
  } finally {client.close();}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(/^PRODUCTION_RELEASE61_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'PRODUCTION_RELEASE61_STOPPED_KEEP_FREEZE');process.exitCode=1;});
