import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { tursoEndpointFingerprint } from "./turso-local-target-guard.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateRoot = path.join(projectRoot, "private");
const DEFAULT_CREDENTIAL_PATH = path.join(privateRoot, "production-rehearsal.env");
const DEFAULT_DEVELOPMENT_TARGET_PATH = path.join(privateRoot, "development-target.json");
const REQUIRED_KEYS = ["PRODUCTION_REHEARSAL_TURSO_URL", "PRODUCTION_REHEARSAL_TURSO_TOKEN"];
const TOKEN_PERMISSION_KEYS = new Set(["ro", "rw", "roa", "rwa", "ddl"]);
const TOKEN_WRITE_PERMISSIONS = ["rw", "rwa", "ddl"];

function fail(message) {
  throw new Error(`Production rehearsal credentials rejected: ${message}`);
}

function validateReadOnlyScope(scope) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return false;
  const allowed = new Set(["ns", "tags"]);
  if (Object.keys(scope).some((key) => !allowed.has(key))) return false;
  const values = [scope.ns, scope.tags].filter((value) => value !== undefined && value !== null);
  if (values.length === 0) return false;
  return values.every((value) => Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim().length > 0));
}

export function validateReadOnlyTursoToken(token, nowMilliseconds = Date.now()) {
  if (typeof token !== "string") fail("the access token is missing");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) fail("the access token is not a JWT");

  let claims;
  try { claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { fail("the access token payload is invalid"); }
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) fail("the access token payload is invalid");

  const nowSeconds = Math.floor(nowMilliseconds / 1000);
  if (claims.exp !== undefined && claims.exp !== null &&
      (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= nowSeconds)) {
    fail("the access token exp claim is invalid or expired");
  }
  if (Object.prototype.hasOwnProperty.call(claims, "nbf") &&
      (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > nowSeconds)) {
    fail("the access token has an invalid or future nbf claim");
  }

  if (claims.p === undefined || claims.p === null) {
    if (claims.a !== "ro") fail("the access token is not read-only");
    return;
  }

  if (typeof claims.p !== "object" || Array.isArray(claims.p)) fail("the access token permission claim is invalid");
  if (Object.keys(claims.p).some((key) => !TOKEN_PERMISSION_KEYS.has(key))) fail("the access token permission claim contains an unknown permission");
  if (TOKEN_WRITE_PERMISSIONS.some((key) => claims.p[key] !== undefined && claims.p[key] !== null)) {
    fail("the access token grants a write, create, or DDL permission");
  }
  if (!validateReadOnlyScope(claims.p.ro)) fail("the access token has no valid read-only scope");
}

function readDevelopmentFingerprint(filename) {
  let registration;
  try { registration = JSON.parse(fs.readFileSync(filename, "utf8")); } catch { fail("the local development endpoint registration is unavailable or invalid"); }
  if (registration?.version !== 1 || typeof registration.endpointSha256 !== "string" || !/^[0-9a-f]{64}$/.test(registration.endpointSha256)) {
    fail("the local development endpoint registration is invalid");
  }
  return registration.endpointSha256;
}

function assertProtectedCredentialFile(filename) {
  let directoryStat;
  let fileStat;
  try {
    directoryStat = fs.statSync(path.dirname(filename));
    fileStat = fs.lstatSync(filename);
  } catch { fail("the protected credential file is missing"); }
  if (!directoryStat.isDirectory() || (directoryStat.mode & 0o077) !== 0 || !fileStat.isFile() || (fileStat.mode & 0o077) !== 0) {
    fail("the credential file and its directory must be private to the current user");
  }
}

export function validateProductionRehearsalCredentials({ url, authToken }, {
  developmentTargetPath = DEFAULT_DEVELOPMENT_TARGET_PATH,
  nowMilliseconds = Date.now(),
} = {}) {
  if (typeof url !== "string" || !url.trim() || typeof authToken !== "string" || !authToken.trim()) {
    fail("both production rehearsal endpoint and token must be configured");
  }
  let endpointSha256;
  try { endpointSha256 = tursoEndpointFingerprint(url); } catch { fail("the endpoint must be a secure remote Turso/libSQL URL"); }
  const developmentSha256 = readDevelopmentFingerprint(developmentTargetPath);
  if (endpointSha256 === developmentSha256) fail("the endpoint matches the registered development database");
  validateReadOnlyTursoToken(authToken.trim(), nowMilliseconds);
  return Object.freeze({ url: url.trim(), authToken: authToken.trim() });
}

export function loadProductionRehearsalCredentials(options = {}) {
  const allowedOptions = new Set(["credentialPath", "developmentTargetPath", "nowMilliseconds"]);
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some((key) => !allowedOptions.has(key))) {
    fail("the loader options contain an unsupported key");
  }
  const {
    credentialPath = DEFAULT_CREDENTIAL_PATH,
    developmentTargetPath = DEFAULT_DEVELOPMENT_TARGET_PATH,
    nowMilliseconds = Date.now(),
  } = options;
  assertProtectedCredentialFile(credentialPath);
  let entries;
  try { entries = parse(fs.readFileSync(credentialPath)); } catch { fail("the credential file could not be parsed"); }
  const unknownKeys = Object.keys(entries).filter((key) => !REQUIRED_KEYS.includes(key));
  if (unknownKeys.length > 0) fail("the credential file contains unsupported keys");
  const missingKeys = REQUIRED_KEYS.filter((key) => !entries[key]?.trim());
  if (missingKeys.length > 0) fail("the protected credential file is incomplete");
  return validateProductionRehearsalCredentials({
    url: entries.PRODUCTION_REHEARSAL_TURSO_URL,
    authToken: entries.PRODUCTION_REHEARSAL_TURSO_TOKEN,
  }, { developmentTargetPath, nowMilliseconds });
}
