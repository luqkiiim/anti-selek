import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import databasePolicy from "../config/database-targets.json" with { type: "json" };

const DEFAULT_REGISTRATION_PATH = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  "private",
  "development-target.json",
);

export function isFileTursoUrl(value) {
  return typeof value === "string" && /^file:/i.test(value.trim());
}

export function tursoEndpointFingerprint(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("A Turso endpoint URL is required.");
  const trimmed = value.trim();
  const normalized = trimmed.replace(/^libsql:/i, "https:");
  let endpoint;
  try { endpoint = new URL(normalized); } catch { throw new Error("The Turso endpoint URL is invalid."); }
  if (endpoint.protocol !== "https:" || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || (endpoint.pathname !== "" && endpoint.pathname !== "/")) {
    throw new Error("The remote Turso endpoint must use a secure libSQL or HTTPS URL.");
  }
  return createHash("sha256").update(endpoint.origin).digest("hex");
}

function readRegistration(filename) {
  let registration;
  try { registration = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ filename, "utf8")); } catch {
    throw new Error("The local development Turso endpoint registration is missing or invalid.");
  }
  if (registration?.version !== 1 || typeof registration.endpointSha256 !== "string" || !/^[0-9a-f]{64}$/.test(registration.endpointSha256)) {
    throw new Error("The local development Turso endpoint registration is invalid.");
  }
  return registration.endpointSha256;
}

export function tursoTokenFingerprint(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("A Turso access token is required.");
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function assertNonProductionTursoCredentials(value, authToken, policy = databasePolicy) {
  const endpoint = tursoEndpointFingerprint(value);
  if (endpoint === policy.productionEndpointSha256) {
    throw new Error("Refusing remote Turso access: production database is forbidden outside the production deployment or explicit read-only production rehearsal.");
  }
  if (endpoint !== policy.nonProductionEndpointSha256) {
    throw new Error("Refusing remote Turso access: endpoint is not the approved non-production database.");
  }
  if (tursoTokenFingerprint(authToken) !== policy.nonProductionTokenSha256) {
    throw new Error("Refusing remote Turso access: token is not the approved non-production credential.");
  }
  return "approved-non-production";
}

export function assertLocalTursoEndpoint(value, {
  registrationPath = DEFAULT_REGISTRATION_PATH,
  authToken = "",
  policy = databasePolicy,
} = {}) {
  if (isFileTursoUrl(value)) return "file";
  const endpointSha256 = tursoEndpointFingerprint(value);
  assertNonProductionTursoCredentials(value, authToken, policy);
  if (fs.existsSync(/* turbopackIgnore: true */ registrationPath)) {
    if (readRegistration(registrationPath) !== endpointSha256) {
      throw new Error("Refusing remote Turso access: endpoint does not match this checkout's registered development database.");
    }
    return "registered-development";
  }
  throw new Error("Refusing unregistered remote Turso access from this checkout; register the development endpoint first.");
}

export function assertRuntimeTursoEndpoint(value, {
  authToken = "",
  env = process.env,
  registrationPath = DEFAULT_REGISTRATION_PATH,
  policy = databasePolicy,
} = {}) {
  // A local registration stays authoritative even if Vercel metadata is copied
  // into a shell. Tests never receive the production deployment exception.
  if (env.NODE_ENV === "test" || fs.existsSync(/* turbopackIgnore: true */ registrationPath)) {
    return assertLocalTursoEndpoint(value, { authToken, registrationPath, policy });
  }
  const deployed = env.VERCEL === "1" && !!env.VERCEL_URL && env.NODE_ENV === "production";
  if (deployed && env.VERCEL_ENV === "production") {
    if (tursoEndpointFingerprint(value) !== policy.productionEndpointSha256 || !authToken?.trim()) {
      throw new Error("Production Turso configuration does not match the approved production target.");
    }
    return "deployed-production";
  }
  if (deployed && env.VERCEL_ENV === "preview") {
    return assertNonProductionTursoCredentials(value, authToken, policy);
  }
  return assertLocalTursoEndpoint(value, { authToken, registrationPath, policy });
}

export function assertProductionRehearsalEnabled(policy = databasePolicy) {
  if (policy.productionRehearsalEnabled !== true) {
    throw new Error("Production rehearsal access is disabled pending credential-incident resolution.");
  }
}

export function developmentEndpointRegistrationPath() {
  return DEFAULT_REGISTRATION_PATH;
}
