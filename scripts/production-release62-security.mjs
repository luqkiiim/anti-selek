import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';
import { validateWindowsPrivateAclJson, validateWindowsHigherAncestorAclJson } from './preview-turso-migration-core.mjs';
import { validateReadOnlyTursoToken } from './production-rehearsal-credentials.mjs';
import { tursoEndpointFingerprint } from './turso-local-target-guard.mjs';
import { ENDPOINT,demand } from './production-release62.mjs';

const aclScript=`$ErrorActionPreference='Stop';Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1');
$p=[Console]::In.ReadToEnd();$item=Get-Item -LiteralPath $p -Force;$acl=Get-Acl -LiteralPath $p;
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
$entries=@($acl.Access|ForEach-Object{[PSCustomObject]@{sid=$_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;access=$_.AccessControlType.ToString();rightsMask=[int64]$_.FileSystemRights;isInherited=[bool]$_.IsInherited;isInheritOnly=[bool](($_.PropagationFlags-band[System.Security.AccessControl.PropagationFlags]::InheritOnly)-ne 0)}});
[PSCustomObject]@{currentSid=$sid;ownerSid=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;daclProtected=[bool]$acl.AreAccessRulesProtected;reparsePoint=(($item.Attributes-band[IO.FileAttributes]::ReparsePoint)-ne 0);entries=$entries}|ConvertTo-Json -Compress -Depth 4`;
const ps=(script,input)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','ignore']});
export function protectedFile(root,relative,{exists=true}={}) {
  demand(/^private\/(?:production-rehearsal\.env|production-release62\/[a-z0-9-]+\.(?:env|json|db))$/.test(relative),'PRIVATE_PATH_INVALID');
  const filename=path.resolve(root,relative),privateRoot=path.join(root,'private');
  const volume=path.parse(filename).root;let current=volume;
  for(const part of [volume,...filename.slice(volume.length).split(path.sep)]) {
    if(part!==volume) current=path.join(current,part);
    const isFile=current===filename;
    if(isFile && !exists) {demand(!fs.existsSync(current),'ARTIFACT_EXISTS');continue;}
    const stat=fs.lstatSync(current);demand(!stat.isSymbolicLink() && (isFile?stat.isFile():stat.isDirectory()),'PRIVATE_PATH_UNSAFE');
    if(process.platform==='win32') {
      const acl=ps(aclScript,current);const sid=JSON.parse(acl).currentSid;
      if(current===privateRoot || current.startsWith(privateRoot+path.sep))validateWindowsPrivateAclJson(acl,sid);
      else validateWindowsHigherAncestorAclJson(acl,sid,{isVolumeRoot:current===volume});
    } else if(current===privateRoot || current.startsWith(privateRoot+path.sep)) demand((stat.mode&0o077)===0,'PRIVATE_MODE_INVALID');
  }
  return filename;
}
export function seal(root,relative) {
  const filename=path.resolve(root,relative);
  if(process.platform==='win32') ps(`$ErrorActionPreference='Stop';Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1');$p=[Console]::In.ReadToEnd();$a=Get-Acl -LiteralPath $p;$a.SetAccessRuleProtection($true,$true);Set-Acl -LiteralPath $p -AclObject $a`,filename);
  else fs.chmodSync(filename,0o600);
  return protectedFile(root,relative);
}
export function credentials(root,role) {
  demand(role==='reader'||role==='writer','CREDENTIAL_ROLE_INVALID');
  const relative=role==='reader'?'private/production-rehearsal.env':'private/production-release62/writer.env';
  const entries=parse(fs.readFileSync(protectedFile(root,relative),'utf8'));
  const keys=role==='reader'?['PRODUCTION_REHEARSAL_TURSO_URL','PRODUCTION_REHEARSAL_TURSO_TOKEN']:['PRODUCTION_RELEASE62_URL','PRODUCTION_RELEASE62_TOKEN'];
  demand(Object.keys(entries).length===2 && keys.every(k=>entries[k]),'CREDENTIAL_FILE_INVALID');
  const url=entries[keys[0]],authToken=entries[keys[1]];
  demand(tursoEndpointFingerprint(url)===ENDPOINT,'ENDPOINT_INVALID');
  if(role==='reader')validateReadOnlyTursoToken(authToken);
  else {
    let claims;try {claims=JSON.parse(Buffer.from(authToken.split('.')[1],'base64url'));}catch {demand(false,'TOKEN_INVALID');}
    demand(authToken.split('.').length===3 && claims?.a==='rw' && claims.p===undefined && Number.isFinite(claims.exp)
      && claims.exp>Date.now()/1000 && claims.exp<=Date.now()/1000+86400 && (claims.nbf===undefined || claims.nbf<=Date.now()/1000),'SHORT_LIVED_WRITER_REQUIRED');
  }
  return {url,authToken};
}
