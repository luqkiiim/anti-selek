import { createHash } from "node:crypto";

export const PREVIEW_CREDENTIAL_FILE_NAME = "preview-turso-writer.env";

export function endpointFingerprint(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("PREVIEW_ENDPOINT_REQUIRED");
  }

  const normalized = value.trim().replace(/^libsql:/i, "https:");
  let endpoint;
  try {
    endpoint = new URL(normalized);
  } catch {
    throw new Error("PREVIEW_ENDPOINT_INVALID");
  }

  if (
    endpoint.protocol !== "https:" ||
    !endpoint.hostname ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.search ||
    (endpoint.pathname !== "" && endpoint.pathname !== "/")
  ) {
    throw new Error("PREVIEW_ENDPOINT_INVALID");
  }

  return createHash("sha256").update(endpoint.origin).digest("hex");
}

export function assertPreviewTarget(url, target) {
  if (!target || typeof target !== "object") {
    throw new Error("PREVIEW_TARGET_POLICY_INVALID");
  }
  if (
    typeof target.databaseName !== "string" ||
    !target.databaseName.trim() ||
    !/^[0-9a-f]{64}$/.test(target.endpointSha256 ?? "")
  ) {
    throw new Error("PREVIEW_TARGET_POLICY_INVALID");
  }
  const actual = endpointFingerprint(url);
  if (actual !== target.endpointSha256) {
    throw new Error("PREVIEW_TARGET_MISMATCH");
  }
  return actual;
}

export function parsePreviewCredentialFile(contents) {
  if (typeof contents !== "string") {
    throw new Error("PREVIEW_CREDENTIAL_FILE_INVALID");
  }

  const accepted = new Set([
    "PREVIEW_TURSO_DATABASE_URL",
    "PREVIEW_TURSO_AUTH_TOKEN",
  ]);
  const values = new Map();

  for (const originalLine of contents.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(PREVIEW_TURSO_DATABASE_URL|PREVIEW_TURSO_AUTH_TOKEN)\s*=\s*(.*)$/.exec(line);
    if (!match || !accepted.has(match[1]) || values.has(match[1])) {
      throw new Error("PREVIEW_CREDENTIAL_FILE_INVALID");
    }

    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      if (value.length < 2 || value.at(-1) !== quote) {
        throw new Error("PREVIEW_CREDENTIAL_FILE_INVALID");
      }
      value = value.slice(1, -1);
    } else if (/[\s#]/.test(value)) {
      throw new Error("PREVIEW_CREDENTIAL_FILE_INVALID");
    }
    if (!value || /[\r\n]/.test(value)) {
      throw new Error("PREVIEW_CREDENTIAL_FILE_INVALID");
    }
    values.set(match[1], value);
  }

  if (values.size !== accepted.size) {
    throw new Error("PREVIEW_CREDENTIAL_FILE_INVALID");
  }
  return Object.freeze({
    url: values.get("PREVIEW_TURSO_DATABASE_URL"),
    authToken: values.get("PREVIEW_TURSO_AUTH_TOKEN"),
  });
}

export function canonicalPreviewManifestPayload(manifest) {
  if (
    !manifest ||
    manifest.version !== 1 ||
    !manifest.target ||
    typeof manifest.target.databaseName !== "string" ||
    !manifest.target.databaseName.trim() ||
    !/^[0-9a-f]{64}$/.test(manifest.target.endpointSha256 ?? "") ||
    !Array.isArray(manifest.migrations)
  ) {
    throw new Error("PREVIEW_MANIFEST_INVALID");
  }

  let previousName = "";
  const migrations = manifest.migrations.map((entry) => {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !/^\d{14}_[a-z0-9_]+$/.test(entry.name) ||
      entry.name <= previousName ||
      !/^[0-9a-f]{64}$/.test(entry.sqlSha256 ?? "")
    ) {
      throw new Error("PREVIEW_MANIFEST_INVALID");
    }
    previousName = entry.name;
    return { name: entry.name, sqlSha256: entry.sqlSha256 };
  });

  if (
    migrations.length === 0 ||
    (manifest.target.migrationCount !== undefined &&
      migrations.length !== manifest.target.migrationCount)
  ) {
    throw new Error("PREVIEW_MANIFEST_INVALID");
  }

  return {
    version: 1,
    target: {
      databaseName: manifest.target.databaseName,
      endpointSha256: manifest.target.endpointSha256,
    },
    migrations,
  };
}

export function previewManifestSha256(manifest) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalPreviewManifestPayload(manifest)))
    .digest("hex");
}

export function assertPreviewConfirmation({ mode, confirmation, target, manifestSha256 }) {
  const validMode = mode === "initial" || mode === "resume" || mode === "verify-only";
  if (!validMode || !confirmation || typeof confirmation !== "object") {
    throw new Error("PREVIEW_CONFIRMATION_REQUIRED");
  }
  if (
    confirmation.databaseName !== target.databaseName ||
    confirmation.endpointSha256 !== target.endpointSha256 ||
    confirmation.manifestSha256 !== manifestSha256
  ) {
    throw new Error("PREVIEW_CONFIRMATION_MISMATCH");
  }
  if (mode === "initial" && confirmation.expectEmpty !== true) {
    throw new Error("PREVIEW_EMPTY_CONFIRMATION_REQUIRED");
  }
  if (mode !== "initial" && confirmation.expectEmpty === true) {
    throw new Error("PREVIEW_CONFIRMATION_MISMATCH");
  }
  return true;
}
