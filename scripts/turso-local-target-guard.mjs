import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  const normalized = trimmed.startsWith("libsql:") ? trimmed.replace(/^libsql:/, "https:") : trimmed;
  let endpoint;
  try { endpoint = new URL(normalized); } catch { throw new Error("The Turso endpoint URL is invalid."); }
  if (endpoint.protocol !== "https:" || !endpoint.hostname || endpoint.username || endpoint.password || endpoint.hash) {
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

export function assertLocalTursoEndpoint(value, {
  registrationPath = DEFAULT_REGISTRATION_PATH,
  env = process.env,
  allowDeployedVercelRuntime = false,
} = {}) {
  if (isFileTursoUrl(value)) return "file";
  const endpointSha256 = tursoEndpointFingerprint(value);
  if (fs.existsSync(/* turbopackIgnore: true */ registrationPath)) {
    if (readRegistration(registrationPath) !== endpointSha256) {
      throw new Error("Refusing remote Turso access: endpoint does not match this checkout's registered development database.");
    }
    return "registered-development";
  }
  if (allowDeployedVercelRuntime && env.VERCEL === "1" && env.VERCEL_ENV && env.VERCEL_URL) {
    return "deployed-vercel";
  }
  throw new Error("Refusing unregistered remote Turso access from this checkout; register the development endpoint first.");
}

export function developmentEndpointRegistrationPath() {
  return DEFAULT_REGISTRATION_PATH;
}
