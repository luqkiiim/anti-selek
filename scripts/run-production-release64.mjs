import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { backupLibsqlReadOnly } from './account-player-preservation.mjs';
import { credentials,protectedFile,seal } from './production-release64-security.mjs';
import { ENDPOINT,demand,hash,loadPlan,rehearse,apply,verify,validateReview } from './production-release64.mjs';
const root=path.resolve(import.meta.dirname,'..');
export function argumentsFor(argv){
 const flags=new Map();
 for(let i=0;i<argv.length;i++){
  const key=argv[i];demand(!flags.has(key),'ARGUMENTS_INVALID');
  if(key==='--approved-production-release')flags.set(key,true);
  else{demand(['--mode','--release-commit','--confirm-endpoint-sha256','--attempt'].includes(key)&&argv[i+1]&&!argv[i+1].startsWith('--'),'ARGUMENTS_INVALID');flags.set(key,argv[++i]);}
 }
 const mode=flags.get('--mode'),commit=flags.get('--release-commit'),attempt=flags.get('--attempt');
 demand(['backup','rehearse','apply','verify'].includes(mode)&&/^[a-f0-9]{40}$/.test(commit??'')&&/^[a-z][a-z0-9-]{0,39}$/.test(attempt??'')&&flags.get('--confirm-endpoint-sha256')===ENDPOINT,'PIN_REQUIRED');
 if(mode==='apply')demand(flags.get('--approved-production-release'),'APPROVAL_REQUIRED');
 return {mode,commit,attempt};
}
export async function main(argv=process.argv.slice(2)){
 const args=argumentsFor(argv),plan=loadPlan(root,args.commit,{clean:args.mode==='apply'});
 const location=name=>`private/production-release64/${args.attempt}-${name}`;
 const file=(name,options)=>protectedFile(root,location(name),options);
 const write=(name,data)=>{fs.writeFileSync(file(name,{exists:false}),JSON.stringify(data,null,2),{flag:'wx',mode:0o600});seal(root,location(name));};
 if(args.mode==='rehearse'){
  const result=await rehearse(file('source.db'),file('restored.db',{exists:false}),plan);seal(root,location('restored.db'));write('rehearsal.json',result);
  console.log(JSON.stringify({stage:'offline-rehearsal-passed',originalRows:result.before.tables.reduce((n,t)=>n+t.count,0),migrations:64,integrity:'ok'}));return;
 }
 const client=createClient(credentials(root,args.mode==='apply'?'writer':'reader'));
 try{
  if(args.mode==='backup'){
   await backupLibsqlReadOnly(client,file('source.db',{exists:false}));seal(root,location('source.db'));
   console.log(JSON.stringify({stage:'consistent-read-only-backup',backupSha256:hash(fs.readFileSync(file('source.db')))}));return;
  }
  if(args.mode==='apply'){
   const review=JSON.parse(fs.readFileSync(protectedFile(root,'private/production-release64/independent-review.json'),'utf8'));validateReview(review,plan);
   const approval=JSON.parse(fs.readFileSync(protectedFile(root,'private/production-release64/approval.json'),'utf8'));
   demand(approval.approved===true&&approval.commit===plan.commit&&approval.planSha256===plan.planSha256&&approval.endpoint===ENDPOINT,'APPROVAL_BINDING_INVALID');
   const report=JSON.parse(fs.readFileSync(file('rehearsal.json'),'utf8'));demand(hash(fs.readFileSync(file('source.db')))===report.backupSha256,'BACKUP_CHANGED');
   const result=await apply(client,plan,report);write('apply.json',result);console.log(JSON.stringify(result));return;
  }
  const report=JSON.parse(fs.readFileSync(file('rehearsal.json'),'utf8'));
  const result=await verify(client,plan,report);write(`verification-${Date.now()}.json`,result);
  console.log(JSON.stringify({stage:'read-only-verified',phase:result.phase,integrity:'ok',foreignKeyViolations:0}));
 }finally{client.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
 console.error(/^PRODUCTION_RELEASE(?:59|63|64)_[A-Z0-9_]+$/.test(error?.message??'')?error.message:'PRODUCTION_RELEASE64_STOPPED_INSPECT_BEFORE_RETRY');process.exitCode=1;
});
