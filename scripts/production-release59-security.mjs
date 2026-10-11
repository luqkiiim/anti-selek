import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveWindowsKnownFolders, validateWindowsPrivateAclJson, validateWindowsParentAclJson, validateWindowsHigherAncestorAclJson } from './preview-turso-migration-core.mjs';
import { tursoEndpointFingerprint } from './turso-local-target-guard.mjs';
import { validateReadOnlyTursoToken } from './production-rehearsal-credentials.mjs';
import { ENDPOINT_SHA256, demand } from './production-release59.mjs';

const aclScript=`$ErrorActionPreference='Stop';
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;
$p=[Console]::In.ReadToEnd(); $item=Get-Item -LiteralPath $p -Force; $acl=Get-Acl -LiteralPath $p;
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
$entries=@($acl.Access | ForEach-Object { [PSCustomObject]@{sid=$_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;access=$_.AccessControlType.ToString();rightsMask=[int64]$_.FileSystemRights;isInherited=[bool]$_.IsInherited;isInheritOnly=[bool](($_.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly)-ne 0)} });
[PSCustomObject]@{currentSid=$sid;ownerSid=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;daclProtected=[bool]$acl.AreAccessRulesProtected;reparsePoint=(($item.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0);entries=$entries}|ConvertTo-Json -Compress -Depth 4`;
const powershell=(script,input)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','ignore']});

export function releaseLocation() {
  demand(process.platform==='win32','WINDOWS_REQUIRED');
  const known=resolveWindowsKnownFolders();
  demand(typeof known.profilePath==='string' && /^[A-Za-z]:\\[^\0\r\n]*$/.test(known.profilePath)
    && !known.profilePath.split(/[\\/]/).some(part=>part==='.' || part==='..'),'KNOWN_FOLDER_INVALID');
  return {...known, directory:path.win32.join(known.profilePath,'AntiSelekProductionRelease59')};
}
export function protectedArtifact(basename,{exists=true}={}) {
  demand(/^[a-z0-9-]+\.(?:env|json|db)$/.test(basename),'ARTIFACT_NAME_INVALID');
  const location=releaseLocation(); const filename=path.join(location.directory,basename);
  const root=path.parse(filename).root; let current=root;
  const components=[root];
  for(const component of filename.slice(root.length).split(path.sep)) {current=path.join(current,component);components.push(current);}
  for(const component of components) {
    const isFile=component===filename;
    if(isFile && !exists) {demand(!fs.existsSync(component),'ARTIFACT_ALREADY_EXISTS');continue;}
    const stat=fs.lstatSync(component);
    demand(!stat.isSymbolicLink() && (isFile?stat.isFile():stat.isDirectory()),'ARTIFACT_PATH_UNSAFE');
    const acl=powershell(aclScript,component);
    if(component===location.directory || isFile) validateWindowsPrivateAclJson(acl,location.currentSid);
    else if(component===location.profilePath) validateWindowsParentAclJson(acl,location.currentSid);
    else validateWindowsHigherAncestorAclJson(acl,location.currentSid,{isVolumeRoot:component===root});
  }
  return filename;
}
export function sealArtifact(filename) {
  // Protected parent already denies other users during creation. Convert inherited
  // trusted ACEs to explicit ACEs, then verify the same strict Windows policy.
  powershell(`$ErrorActionPreference='Stop';Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;$p=[Console]::In.ReadToEnd();$a=Get-Acl -LiteralPath $p;$a.SetAccessRuleProtection($true,$true);Set-Acl -LiteralPath $p -AclObject $a`,filename);
  return protectedArtifact(path.basename(filename));
}
export function parseCredentials(text,role) {
  demand(role==='reader' || role==='writer','CREDENTIAL_ROLE_INVALID');
  const entries=new Map();
  for(const line of text.split(/\r?\n/)) {
    if(!line.trim() || line.trim().startsWith('#')) continue;
    const match=/^(PRODUCTION_RELEASE59_URL|PRODUCTION_RELEASE59_TOKEN)=([^\s'"#]+)$/.exec(line);
    demand(match && !entries.has(match[1]),'CREDENTIAL_FILE_INVALID');
    entries.set(match[1],match[2]);
  }
  demand(entries.size===2,'CREDENTIAL_FILE_INVALID');
  const url=entries.get('PRODUCTION_RELEASE59_URL'),authToken=entries.get('PRODUCTION_RELEASE59_TOKEN');
  demand(tursoEndpointFingerprint(url)===ENDPOINT_SHA256,'ENDPOINT_INVALID');
  if(role==='reader') validateReadOnlyTursoToken(authToken);
  else validateWriterToken(authToken);
  return {url,authToken};
}
export function loadCredentials(role) {return parseCredentials(fs.readFileSync(protectedArtifact(`${role}.env`),'utf8'),role);}
export function validateWriterToken(authToken) {
  let claims; try {claims=JSON.parse(Buffer.from(authToken.split('.')[1],'base64url'));}catch {demand(false,'WRITER_TOKEN_INVALID');}
  demand(authToken.split('.').length===3 && authToken.split('.').every(part=>part.length>0) && claims?.a==='rw'
    && (claims.exp===undefined || (Number.isFinite(claims.exp) && claims.exp>Date.now()/1000))
    && (claims.nbf===undefined || (Number.isFinite(claims.nbf) && claims.nbf<=Date.now()/1000)),'WRITER_TOKEN_INVALID');
}
