import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { LibsqlError } from "@libsql/core/api";
import {
  ClientError, ProtoError, ResponseError, ClosedError, HttpServerError,
  ProtocolVersionError, InternalError, MisuseError,
} from "@libsql/hrana-client";
import {
  assertPreviewConfirmation,
  assertPreviewTarget,
  canonicalPreviewManifestPayload,
  parsePreviewCredentialFile,
  previewManifestSha256,
  PREVIEW_CREDENTIAL_FILE_NAME,
} from "./preview-turso-target-guard.mjs";

const MIGRATION_TABLE = "_turso_sql_migrations";
const CONTROL_TABLE = "_preview_turso_migration_control";
const STATE_TABLE = "_preview_turso_migration_state";
const CHECKPOINT_TABLE = "_preview_turso_schema_checkpoint";
const GATE_TABLE = "_preview_turso_migration_gate";
const INTERNAL_TABLES = [
  MIGRATION_TABLE,
  CONTROL_TABLE,
  STATE_TABLE,
  CHECKPOINT_TABLE,
  GATE_TABLE,
];
const MANAGED_MIGRATION = "20261004120000_separate_accounts_players";
const MANAGED_MARKER = "-- ACCOUNT_PLAYER_MANAGED_TRANSACTION";
const LEDGER_MARKER = "-- ACCOUNT_PLAYER_LEDGER_INSERT";
const SESSION_REBUILD_MIGRATION = "20260403075615_add_test_sessions";
const SESSION_REBUILD_COLUMNS = [
  ["poolsEnabled", "BOOLEAN NOT NULL DEFAULT false"],
  ["poolAName", "TEXT"],
  ["poolBName", "TEXT"],
  ["poolACourtAssignments", "INTEGER NOT NULL DEFAULT 0"],
  ["poolBCourtAssignments", "INTEGER NOT NULL DEFAULT 0"],
  ["poolAMissedTurns", "INTEGER NOT NULL DEFAULT 0"],
  ["poolBMissedTurns", "INTEGER NOT NULL DEFAULT 0"],
  ["crossoverMissThreshold", "INTEGER NOT NULL DEFAULT 1"],
];

const CONTROL_DDL = `CREATE TABLE "${CONTROL_TABLE}" (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL CHECK (version = 1),
  target_name TEXT NOT NULL,
  endpoint_sha256 TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  migration_count INTEGER NOT NULL,
  applied_count INTEGER NOT NULL DEFAULT 0,
  last_migration TEXT,
  bootstrap_empty INTEGER NOT NULL CHECK (bootstrap_empty = 1)
)`;
const STATE_DDL = `CREATE TABLE "${STATE_TABLE}" (
  name TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE,
  sql_sha256 TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  endpoint_sha256 TEXT NOT NULL
)`;
const CHECKPOINT_DDL = `CREATE TABLE "${CHECKPOINT_TABLE}" (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  migration_name TEXT NOT NULL,
  schema_json TEXT NOT NULL
)`;
const GATE_DDL = `CREATE TABLE "${GATE_TABLE}" (
  ok INTEGER NOT NULL CHECK (ok = 1)
)`;

const DIAGNOSTIC_STAGES = new Set([
  "credential-validation",
  "target-validation",
  "connection",
  "first-read",
  "schema-verification",
  "migration-application",
]);
const DIAGNOSTIC_OPERATIONS = new Set([
  "migration-ledger-presence",
  "control-table-presence",
  "state-table-presence",
  "schema-checkpoint-presence",
  "migration-gate-presence",
  "migration-state-presence-check",
  "schema-object-list",
  "schema-object-check",
  "application-table-check",
  "control-row",
  "control-row-check",
  "migration-ledger",
  "migration-state",
  "migration-prefix-check",
  "schema-checkpoint",
  "checkpoint-consistency-check",
  "schema-snapshot",
  "schema-snapshot-check",
  "state-foreign-key-check",
  "application-table-list",
  "application-row-count",
  "bootstrap-count-check",
  "integrity-foreign-key-check",
  "integrity-check",
  "identity-trigger-list",
  "identity-trigger-check",
]);
const DIAGNOSTIC_OPERATION_PHASES = new Set(["query", "result", "check"]);
const PREVIEW_FAILURE_BRAND = Symbol("previewFailure");
const PREVIEW_FAILURE_DIAGNOSTICS = new WeakMap();
const MANAGED_BATCH_DIAGNOSTICS = new WeakMap();
const BATCH_FAILURE_CLASSES = new Set([
  "pre-send", "transport", "http-rejection", "protocol-error", "server-sql-error", "unclassified",
]);
const responseStatusGetter = Object.getOwnPropertyDescriptor(Response.prototype, "status").get;
const ERROR_FAMILIES = new Map([
  [LibsqlError.prototype, "LibsqlError"], [ProtoError.prototype, "ProtoError"],
  [ResponseError.prototype, "ResponseError"], [ClosedError.prototype, "ClosedError"],
  [HttpServerError.prototype, "HttpServerError"], [ProtocolVersionError.prototype, "ProtocolVersionError"],
  [InternalError.prototype, "InternalError"], [MisuseError.prototype, "MisuseError"],
  [ClientError.prototype, "ClientError"], [SyntaxError.prototype, "SyntaxError"],
  [TypeError.prototype, "TypeError"], [RangeError.prototype, "RangeError"], [Error.prototype, "Error"],
]);
const ERROR_FAMILY_NAMES = new Set([...ERROR_FAMILIES.values(), "unrecognized"]);
const PROTOCOL_EVIDENCE = new Set(["completed", "structured-server-error", "recognized-protocol-error", "unknown"]);
const SAFE_PREVIEW_CODES = new Set([
  "PREVIEW_ARGUMENTS_INVALID",
  "PREVIEW_BOOTSTRAP_DATA_NOT_EMPTY",
  "PREVIEW_CLIENT_FACTORY_REQUIRED",
  "PREVIEW_CLIENT_UNAVAILABLE",
  "PREVIEW_CONFIRMATION_MISMATCH",
  "PREVIEW_CONFIRMATION_REQUIRED",
  "PREVIEW_CONFIRMATION_INVALID",
  "PREVIEW_CONTROL_STATE_INCOMPLETE",
  "PREVIEW_CONTROL_STATE_INVALID",
  "PREVIEW_CONTROL_TARGET_OR_CHAIN_MISMATCH",
  "PREVIEW_CREDENTIAL_ACL_UNVERIFIED",
  "PREVIEW_CREDENTIAL_FILE_INVALID",
  "PREVIEW_CREDENTIAL_FILE_NOT_PROTECTED",
  "PREVIEW_CREDENTIAL_FILE_UNAVAILABLE",
  "PREVIEW_CREDENTIAL_LOCATION_INVALID",
  "PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED",
  "PREVIEW_CREDENTIAL_PATH_UNSAFE",
  "PREVIEW_CREDENTIAL_PLATFORM_UNSUPPORTED",
  "PREVIEW_EMPTY_CONFIRMATION_REQUIRED",
  "PREVIEW_ENDPOINT_INVALID",
  "PREVIEW_ENDPOINT_REQUIRED",
  "PREVIEW_FOREIGN_KEY_CHECK_FAILED",
  "PREVIEW_IDENTITY_GUARD_MISSING",
  "PREVIEW_INITIAL_DATABASE_NOT_EMPTY",
  "PREVIEW_INTEGRITY_CHECK_FAILED",
  "PREVIEW_MANAGED_MIGRATION_SHAPE_INVALID",
  "PREVIEW_MANAGED_MIGRATION_UNEXPECTED",
  "PREVIEW_MANIFEST_DIGEST_MISMATCH",
  "PREVIEW_MANIFEST_INVALID",
  "PREVIEW_MANIFEST_TARGET_MISMATCH",
  "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED",
  "PREVIEW_MIGRATION_CHAIN_MISMATCH",
  "PREVIEW_MIGRATION_HASH_MISMATCH",
  "PREVIEW_MIGRATION_PREFIX_CHANGED",
  "PREVIEW_MIGRATION_PREFIX_INVALID",
  "PREVIEW_MIGRATION_PROGRESS_STALLED",
  "PREVIEW_MIGRATION_SOURCE_UNAVAILABLE",
  "PREVIEW_MIGRATION_TRANSACTION_FAILED",
  "PREVIEW_POST_MIGRATION_VERIFICATION_FAILED",
  "PREVIEW_RESUME_STATE_MISSING",
  "PREVIEW_RUN_FAILED",
  "PREVIEW_SCHEMA_CHECKPOINT_INVALID",
  "PREVIEW_SCHEMA_DRIFT",
  "PREVIEW_SCHEMA_INVALID",
  "PREVIEW_SESSION_REBUILD_TABLE_MISSING",
  "PREVIEW_TARGET_MISMATCH",
  "PREVIEW_TARGET_POLICY_INVALID",
  "PREVIEW_UNTRACKED_DATABASE_STATE",
]);
const GUARD_ERROR_CODES = new Set([
  "PREVIEW_CONFIRMATION_MISMATCH",
  "PREVIEW_CONFIRMATION_REQUIRED",
  "PREVIEW_CREDENTIAL_FILE_INVALID",
  "PREVIEW_EMPTY_CONFIRMATION_REQUIRED",
  "PREVIEW_ENDPOINT_INVALID",
  "PREVIEW_ENDPOINT_REQUIRED",
  "PREVIEW_MANIFEST_INVALID",
  "PREVIEW_TARGET_MISMATCH",
  "PREVIEW_TARGET_POLICY_INVALID",
]);
const DATABASE_ERROR_CODES = new Set([
  "AUTHENTICATION_ERROR",
  "AUTHENTICATION_FAILED",
  "AUTH_ERROR",
  "BLOCKED",
  "FORBIDDEN",
  "PERMISSION_DENIED",
  "SQL_INPUT_ERROR",
  "SQL_MANY_STATEMENTS",
  "SQL_PARSE_ERROR",
  "SQLITE_INTERNAL",
  "SQLITE_PERM",
  "UNAUTHORIZED",
  "SQLITE_ABORT",
  "SQLITE_AUTH",
  "SQLITE_BUSY",
  "SQLITE_CANTOPEN",
  "SQLITE_CONSTRAINT",
  "SQLITE_CONSTRAINT_CHECK",
  "SQLITE_CONSTRAINT_FOREIGNKEY",
  "SQLITE_CONSTRAINT_NOTNULL",
  "SQLITE_CONSTRAINT_PRIMARYKEY",
  "SQLITE_CONSTRAINT_TRIGGER",
  "SQLITE_CONSTRAINT_UNIQUE",
  "SQLITE_CORRUPT",
  "SQLITE_ERROR",
  "SQLITE_FULL",
  "SQLITE_IOERR",
  "SQLITE_LOCKED",
  "SQLITE_MISMATCH",
  "SQLITE_NOTADB",
  "SQLITE_READONLY",
  "SQLITE_SCHEMA",
  "SQLITE_TOOBIG",
  "P1000",
  "P1001",
  "P1002",
  "P1008",
  "P1010",
  "P1011",
  "P1012",
  "P1013",
  "P1017",
]);
const LIBSQL_CLIENT_ERROR_CODES = new Set([
  "HRANA_CLOSED_ERROR",
  "HRANA_PROTO_ERROR",
  "HRANA_WEBSOCKET_ERROR",
  "INTERNAL_ERROR",
  "PROTOCOL_VERSION_ERROR",
  "SERVER_ERROR",
  "UNKNOWN",
]);
const TRANSPORT_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_RESPONSE_STATUS_CODE",
  "UND_ERR_SOCKET",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

const SCHEMA_JSON_QUERY = `SELECT json_group_array(json_array("type", "name", "tbl_name", "sql")) AS schema_json
FROM (
  SELECT "type", "name", "tbl_name", "sql"
  FROM sqlite_schema
  WHERE "sql" IS NOT NULL
    AND "name" NOT LIKE 'sqlite_%'
    AND "name" NOT IN (${INTERNAL_TABLES.map(sqlString).join(", ")})
  ORDER BY "type", "name"
)`;

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(code, diagnostic) {
  const error = new Error(code);
  error.code = code;
  Object.defineProperty(error, PREVIEW_FAILURE_BRAND, { value: true });
  if (diagnostic) PREVIEW_FAILURE_DIAGNOSTICS.set(error, diagnostic);
  throw error;
}

function readOwnDataProperty(value, key) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function recognizedErrorFamily(value) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return "unrecognized";
  let current = value;
  try {
    for (let depth = 0; current !== null && depth < 16; depth += 1) {
      current = Object.getPrototypeOf(current);
      if (ERROR_FAMILIES.has(current)) return ERROR_FAMILIES.get(current);
    }
  } catch { /* Hostile/revoked proxies remain unrecognized. */ }
  return "unrecognized";
}

function batchErrorShape(error) {
  const shape = {
    exceptionFamily: recognizedErrorFamily(error), codePresent: false,
    nestedCausePresent: false, protoPresent: false, structuredServerErrorPresent: false,
    protocolEvidence: "unknown", failureBoundary: "sdk-execute-multiple",
  };
  const pending = [error];
  const visited = new Set();
  for (let count = 0; pending.length && count < 16; count += 1) {
    const current = pending.shift();
    if ((typeof current !== "object" && typeof current !== "function") || current === null || visited.has(current)) continue;
    visited.add(current);
    const family = recognizedErrorFamily(current);
    if (current !== error && !shape.nestedExceptionFamily && family !== "unrecognized") shape.nestedExceptionFamily = family;
    try {
      if (Object.getOwnPropertyDescriptor(current, "code")) shape.codePresent = true;
    } catch { /* Never evaluate accessors. */ }
    for (const key of ["cause", "originalError", "error", "proto"]) {
      const child = readOwnDataProperty(current, key);
      if ((typeof child !== "object" && typeof child !== "function") || child === null) continue;
      if (key === "cause") shape.nestedCausePresent = true;
      if (key === "proto") {
        shape.protoPresent = true;
        if (family === "ResponseError") shape.structuredServerErrorPresent = true;
      }
      pending.push(child);
    }
    if (family === "ProtoError") shape.protocolEvidence = "recognized-protocol-error";
  }
  if (shape.structuredServerErrorPresent) shape.protocolEvidence = "structured-server-error";
  return shape;
}

function safeDiagnostic(error, stage, operationContext) {
  const result = { stage: DIAGNOSTIC_STAGES.has(stage) ? stage : "connection" };
  if (
    operationContext &&
    DIAGNOSTIC_OPERATIONS.has(operationContext.operationId) &&
    DIAGNOSTIC_OPERATION_PHASES.has(operationContext.phase)
  ) {
    result.operationId = operationContext.operationId;
    result.operationPhase = operationContext.phase;
  }
  const pending = [error];
  const visited = new Set();
  let nodeCount = 0;

  while (pending.length > 0 && nodeCount < 16) {
    const current = pending.shift();
    if ((typeof current !== "object" && typeof current !== "function") || current === null || visited.has(current)) continue;
    visited.add(current);
    nodeCount += 1;

    const code = readOwnDataProperty(current, "code");
    if (typeof code === "string") {
      if (!result.databaseCode && DATABASE_ERROR_CODES.has(code)) result.databaseCode = code;
      if (!result.clientCode && LIBSQL_CLIENT_ERROR_CODES.has(code)) result.clientCode = code;
      if (!result.transportCode && TRANSPORT_ERROR_CODES.has(code)) result.transportCode = code;
    }

    for (const key of ["status", "statusCode"]) {
      const status = readOwnDataProperty(current, key);
      if (!result.httpStatus && Number.isInteger(status) && status >= 100 && status <= 599) {
        result.httpStatus = status;
      }
    }

    for (const key of ["cause", "originalError", "error", "response", "errors", "proto"]) {
      const child = readOwnDataProperty(current, key);
      let isChildArray = false;
      try { isChildArray = Array.isArray(child); } catch { /* Ignore revoked or hostile proxies. */ }
      if (isChildArray) {
        let childLength = 0;
        try { childLength = Math.min(Number(readOwnDataProperty(child, "length")) || 0, 8); } catch { /* Ignore hostile array proxies. */ }
        for (let index = 0; index < childLength; index += 1) {
          pending.push(readOwnDataProperty(child, String(index)));
        }
      } else if (child !== undefined) {
        pending.push(child);
      }
    }
  }

  const batch = (typeof error === "object" && error !== null) || typeof error === "function"
    ? MANAGED_BATCH_DIAGNOSTICS.get(error) : undefined;
  if (batch) Object.assign(result, batch);
  return Object.freeze(result);
}

// The scope covers only this top-level sequence call. Fetch invocation proves
// local dispatch was attempted; it does not prove receipt by the server.
// No response is cloned, consumed, or modified, and no body is retained.
export function createPreviewHttpBatchDiagnostics(fetchFunction) {
  let active;
  let lastSnapshot;
  const fetch = async (...args) => {
    const batch = active;
    if (batch) {
      batch.fetchInvoked = true;
      batch.httpAttempts = Math.min(batch.httpAttempts + 1, 999);
    }
    let response;
    try {
      response = await fetchFunction(...args);
    } catch (error) {
      if (batch) {
        batch.transportException = true;
        const code = safeDiagnostic(error, "migration-application").transportCode;
        if (code) batch.transportCode = code;
      }
      throw error;
    }
    if (batch) {
      batch.responseReceived = true;
      // Invoke only the native Response getter, never an arbitrary accessor.
      try {
        const status = responseStatusGetter.call(response);
        if (Number.isInteger(status) && status >= 100 && status <= 599) batch.httpStatus = status;
      } catch { /* Non-native responses have no safely known status. */ }
    }
    return response;
  };
  return {
    fetch,
    getLastSnapshot: () => lastSnapshot,
    instrument(client) {
      const executeMultiple = client.executeMultiple.bind(client);
      client.executeMultiple = async (...args) => {
        const batch = {
          sdkEntered: true, fetchInvoked: false, httpAttempts: 0,
          responseReceived: false, transportException: false, sdkOutcome: "unclassified",
        };
        active = batch;
        try {
          const result = await executeMultiple(...args);
          batch.sdkOutcome = "completed";
          batch.protocolEvidence = "completed";
          return result;
        } catch (error) {
          Object.assign(batch, batchErrorShape(error));
          if (!batch.responseReceived || batch.transportException) batch.protocolEvidence = "unknown";
          const codes = safeDiagnostic(error, "migration-application");
          if (codes.databaseCode) batch.sdkOutcome = "database-error";
          else if (codes.clientCode === "HRANA_PROTO_ERROR" || codes.clientCode === "PROTOCOL_VERSION_ERROR") {
            batch.sdkOutcome = "protocol-error";
          }
          batch.batchFailureClass = !batch.fetchInvoked ? "pre-send"
            : batch.transportException ? "transport"
              : batch.httpStatus >= 400 ? "http-rejection"
                : batch.sdkOutcome === "protocol-error" ? "protocol-error"
                  : batch.responseReceived && /^(SQLITE_|SQL_)/.test(codes.databaseCode ?? "") ? "server-sql-error"
                    : "unclassified";
          if ((typeof error === "object" && error !== null) || typeof error === "function") {
            MANAGED_BATCH_DIAGNOSTICS.set(error, Object.freeze({ ...batch }));
          }
          throw error;
        } finally {
          lastSnapshot = Object.freeze({ ...batch });
          active = undefined;
        }
      };
      return client;
    },
  };
}

function isBrandedPreviewFailure(error) {
  return readOwnDataProperty(error, PREVIEW_FAILURE_BRAND) === true &&
    SAFE_PREVIEW_CODES.has(readOwnDataProperty(error, "code"));
}

function preservePreviewFailure(error, stage, operationContext) {
  if (isBrandedPreviewFailure(error)) {
    const existing = PREVIEW_FAILURE_DIAGNOSTICS.get(error) ?? {};
    const operation = operationContext &&
      DIAGNOSTIC_OPERATIONS.has(operationContext.operationId) &&
      DIAGNOSTIC_OPERATION_PHASES.has(operationContext.phase)
      ? operationContext
      : undefined;
    PREVIEW_FAILURE_DIAGNOSTICS.set(error, Object.freeze({
      ...existing,
      stage: existing.stage ?? stage,
      ...(existing.operationId || !operation ? {} : {
        operationId: operation.operationId,
        operationPhase: operation.phase,
      }),
    }));
    throw error;
  }
}

function failFromUnderlying(error, code, stage, operationContext) {
  preservePreviewFailure(error, stage, operationContext);
  fail(code, safeDiagnostic(error, stage, operationContext));
}

function failFromGuard(error, fallbackCode, stage) {
  preservePreviewFailure(error, stage);
  const message = readOwnDataProperty(error, "message");
  if (typeof message === "string" && GUARD_ERROR_CODES.has(message)) {
    fail(message, Object.freeze({ stage }));
  }
  fail(fallbackCode, safeDiagnostic(error, stage));
}

function safePreviewFailureCode(error) {
  if (isBrandedPreviewFailure(error)) return readOwnDataProperty(error, "code");
  const message = readOwnDataProperty(error, "message");
  return typeof message === "string" && SAFE_PREVIEW_CODES.has(message)
    ? message
    : "PREVIEW_RUN_FAILED";
}

export function formatPreviewFailure(error) {
  const code = safePreviewFailureCode(error);
  const isObject = (typeof error === "object" && error !== null) || typeof error === "function";
  const diagnostic = isObject ? PREVIEW_FAILURE_DIAGNOSTICS.get(error) ??
    (MANAGED_BATCH_DIAGNOSTICS.has(error) ? safeDiagnostic(error, "migration-application") : undefined) : undefined;
  const details = [];
  if (diagnostic && DIAGNOSTIC_STAGES.has(diagnostic.stage)) details.push(`stage=${diagnostic.stage}`);
  if (diagnostic && DIAGNOSTIC_OPERATIONS.has(diagnostic.operationId)) {
    details.push(`operation=${diagnostic.operationId}`);
  }
  if (diagnostic && DIAGNOSTIC_OPERATION_PHASES.has(diagnostic.operationPhase)) {
    details.push(`phase=${diagnostic.operationPhase}`);
  }
  if (diagnostic && DATABASE_ERROR_CODES.has(diagnostic.databaseCode)) {
    details.push(`databaseCode=${diagnostic.databaseCode}`);
  }
  if (diagnostic && LIBSQL_CLIENT_ERROR_CODES.has(diagnostic.clientCode)) {
    details.push(`clientCode=${diagnostic.clientCode}`);
  }
  if (diagnostic && Number.isInteger(diagnostic.httpStatus) && diagnostic.httpStatus >= 100 && diagnostic.httpStatus <= 599) {
    details.push(`httpStatus=${diagnostic.httpStatus}`);
  }
  if (diagnostic && TRANSPORT_ERROR_CODES.has(diagnostic.transportCode)) {
    details.push(`transportCode=${diagnostic.transportCode}`);
  }
  if (diagnostic && BATCH_FAILURE_CLASSES.has(diagnostic.batchFailureClass)) {
    details.push(`batchFailureClass=${diagnostic.batchFailureClass}`);
  }
  for (const key of ["sdkEntered", "fetchInvoked", "responseReceived", "transportException", "codePresent", "nestedCausePresent", "protoPresent", "structuredServerErrorPresent"]) {
    if (diagnostic && typeof diagnostic[key] === "boolean") details.push(`${key}=${diagnostic[key]}`);
  }
  if (diagnostic && Number.isInteger(diagnostic.httpAttempts) && diagnostic.httpAttempts >= 0 && diagnostic.httpAttempts <= 999) {
    details.push(`httpAttempts=${diagnostic.httpAttempts}`);
  }
  if (diagnostic && ["completed", "database-error", "protocol-error", "unclassified"].includes(diagnostic.sdkOutcome)) {
    details.push(`sdkOutcome=${diagnostic.sdkOutcome}`);
  }
  for (const key of ["exceptionFamily", "nestedExceptionFamily"]) {
    if (diagnostic && ERROR_FAMILY_NAMES.has(diagnostic[key])) details.push(`${key}=${diagnostic[key]}`);
  }
  if (diagnostic && PROTOCOL_EVIDENCE.has(diagnostic.protocolEvidence)) details.push(`protocolEvidence=${diagnostic.protocolEvidence}`);
  if (diagnostic?.failureBoundary === "sdk-execute-multiple") details.push("failureBoundary=sdk-execute-multiple");
  return `Preview migration stopped safely: ${code}${details.length ? ` (${details.join("; ")})` : ""}.`;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateTargetManifestBinding(target, manifest) {
  if (
    !isRecord(target) ||
    typeof target.databaseName !== "string" ||
    !target.databaseName.trim() ||
    !/^[0-9a-f]{64}$/.test(target.endpointSha256 ?? "") ||
    !Number.isInteger(target.migrationCount) ||
    target.migrationCount < 1
  ) {
    fail("PREVIEW_TARGET_POLICY_INVALID");
  }
  const payload = canonicalPreviewManifestPayload(manifest);
  if (
    payload.target.databaseName !== target.databaseName ||
    payload.target.endpointSha256 !== target.endpointSha256 ||
    manifest.migrations.length !== target.migrationCount
  ) {
    fail("PREVIEW_MANIFEST_TARGET_MISMATCH");
  }
  const digest = previewManifestSha256(manifest);
  if (manifest.manifestSha256 !== digest) {
    fail("PREVIEW_MANIFEST_DIGEST_MISMATCH");
  }
  return digest;
}

function loadAndVerifyMigrations(migrationsRoot, manifest) {
  let directoryEntries;
  try {
    directoryEntries = fs
      .readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    fail("PREVIEW_MIGRATION_SOURCE_UNAVAILABLE");
  }

  const expectedNames = manifest.migrations.map((entry) => entry.name);
  if (
    directoryEntries.length !== expectedNames.length ||
    directoryEntries.some((name, index) => name !== expectedNames[index])
  ) {
    fail("PREVIEW_MIGRATION_CHAIN_MISMATCH");
  }

  return manifest.migrations.map((entry) => {
    const filename = path.join(migrationsRoot, entry.name, "migration.sql");
    let bytes;
    try {
      bytes = fs.readFileSync(filename);
    } catch {
      fail("PREVIEW_MIGRATION_SOURCE_UNAVAILABLE");
    }
    if (sha256(bytes) !== entry.sqlSha256) {
      fail("PREVIEW_MIGRATION_HASH_MISMATCH");
    }
    return { name: entry.name, sql: bytes.toString("utf8"), sqlSha256: entry.sqlSha256 };
  });
}

const WINDOWS_KNOWN_FOLDERS_QUERY = `$ErrorActionPreference = 'Stop';
$source = @'
using System;
using System.Runtime.InteropServices;
public static class PreviewKnownFolders {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid folderId, uint flags, IntPtr token, out IntPtr path);
}
'@;
$null = Add-Type -TypeDefinition $source -ErrorAction Stop;
function Get-KnownFolder([string]$id) {
  $pointer = [IntPtr]::Zero;
  $result = [PreviewKnownFolders]::SHGetKnownFolderPath([Guid]$id, 0, [IntPtr]::Zero, [ref]$pointer);
  if ($result -ne 0 -or $pointer -eq [IntPtr]::Zero) { throw 'Known folder unavailable' }
  try { [Runtime.InteropServices.Marshal]::PtrToStringUni($pointer) }
  finally { [Runtime.InteropServices.Marshal]::FreeCoTaskMem($pointer) }
}
$profilePath = Get-KnownFolder '5E6C858F-0E22-4760-9AFE-EA3317B67173';
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
[PSCustomObject]@{ profilePath = $profilePath; currentSid = $currentSid } | ConvertTo-Json -Compress -Depth 3`;

const WINDOWS_ACL_QUERY = `$ErrorActionPreference = 'Stop';
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop;
$itemPath = [Console]::In.ReadToEnd();
$item = Get-Item -LiteralPath $itemPath -Force;
$acl = Get-Acl -LiteralPath $itemPath;
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
$ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;
$entries = @($acl.Access | ForEach-Object {
  $sid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;
  $inheritOnly = (($_.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0);
  [PSCustomObject]@{
    sid = $sid;
    access = $_.AccessControlType.ToString();
    rightsMask = [int64]$_.FileSystemRights;
    isInherited = [bool]$_.IsInherited;
    isInheritOnly = [bool]$inheritOnly
  }
});
[PSCustomObject]@{
  currentSid = $currentSid;
  ownerSid = $ownerSid;
  daclProtected = [bool]$acl.AreAccessRulesProtected;
  reparsePoint = (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0);
  entries = $entries
} | ConvertTo-Json -Compress -Depth 4`;

function runPowerShell(script, input = "", failureCode = "PREVIEW_CREDENTIAL_ACL_UNVERIFIED") {
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      input,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    fail(failureCode);
  }
}

export function resolveWindowsKnownFolders() {
  if (process.platform !== "win32") fail("PREVIEW_CREDENTIAL_PLATFORM_UNSUPPORTED");
  const serialized = runPowerShell(WINDOWS_KNOWN_FOLDERS_QUERY, "", "PREVIEW_CREDENTIAL_LOCATION_INVALID");
  try { return JSON.parse(serialized); } catch { fail("PREVIEW_CREDENTIAL_LOCATION_INVALID"); }
}

function normalizeKnownFolderPath(value) {
  if (
    typeof value !== "string" || !value.trim() || /[\0\r\n]/.test(value) ||
    value.startsWith("\\\\") || value.startsWith("\\?\\") || value.startsWith("\\.\\")
  ) {
    fail("PREVIEW_CREDENTIAL_LOCATION_INVALID");
  }
  const rawSegments = value.replaceAll("/", "\\").split("\\").filter(Boolean);
  if (rawSegments.some((segment) => segment === "." || segment === "..")) {
    fail("PREVIEW_CREDENTIAL_LOCATION_INVALID");
  }
  const normalized = path.win32.normalize(value);
  const parsed = path.win32.parse(normalized);
  if (!path.win32.isAbsolute(normalized) || !/^[A-Za-z]:\\$/.test(parsed.root)) {
    fail("PREVIEW_CREDENTIAL_LOCATION_INVALID");
  }
  const segments = normalized.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    fail("PREVIEW_CREDENTIAL_LOCATION_INVALID");
  }
  return normalized.replace(/[\\/]+$/, "") || parsed.root;
}

export function resolvePreviewCredentialLocation({
  platform = process.platform,
  knownFolderResolver = resolveWindowsKnownFolders,
} = {}) {
  if (platform !== "win32") fail("PREVIEW_CREDENTIAL_PLATFORM_UNSUPPORTED");
  let known;
  try { known = knownFolderResolver(); } catch { fail("PREVIEW_CREDENTIAL_LOCATION_INVALID"); }
  const profilePath = normalizeKnownFolderPath(known?.profilePath);
  if (
    typeof known?.currentSid !== "string" || !/^S-1-(?:\d+-)+\d+$/.test(known.currentSid)
  ) {
    fail("PREVIEW_CREDENTIAL_LOCATION_INVALID");
  }
  const migrationDirectory = path.win32.join(profilePath, "AntiSelekPreviewMigration");
  return Object.freeze({
    profilePath,
    migrationDirectory,
    credentialPath: path.win32.join(migrationDirectory, PREVIEW_CREDENTIAL_FILE_NAME),
    currentSid: known.currentSid,
  });
}

function parseWindowsAcl(serialized) {
  let acl;
  try { acl = JSON.parse(serialized); } catch { fail("PREVIEW_CREDENTIAL_ACL_UNVERIFIED"); }
  if (
    typeof acl?.currentSid !== "string" || !/^S-1-(?:\d+-)+\d+$/.test(acl.currentSid) ||
    typeof acl?.ownerSid !== "string" || !/^S-1-(?:\d+-)+\d+$/.test(acl.ownerSid) ||
    typeof acl?.daclProtected !== "boolean" || typeof acl?.reparsePoint !== "boolean" ||
    !Array.isArray(acl.entries) || acl.entries.length === 0 ||
    acl.entries.some((entry) =>
      !entry ||
      typeof entry.sid !== "string" || !/^S-1-(?:\d+-)+\d+$/.test(entry.sid) ||
      !["Allow", "Deny"].includes(entry.access) ||
      !Number.isSafeInteger(entry.rightsMask) ||
      typeof entry.isInherited !== "boolean" ||
      typeof entry.isInheritOnly !== "boolean"
    )
  ) {
    fail("PREVIEW_CREDENTIAL_ACL_UNVERIFIED");
  }
  return acl;
}

const TRUSTED_SIDS = new Set(["S-1-5-18", "S-1-5-32-544"]);
const TRUSTED_INSTALLER_SID = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
const UNSAFE_ANCESTOR_ALLOW_MASK =
  0x00000002 | 0x00000004 | 0x00000010 | 0x00000040 | 0x00000100 |
  0x00010000 | 0x00040000 | 0x00080000 | 0x10000000 | 0x40000000;
const UNSAFE_HIGHER_ANCESTOR_ALLOW_MASK =
  0x00000040 | 0x00010000 | 0x00040000 | 0x00080000 | 0x10000000;

function trustedSids(currentSid) {
  return new Set([...TRUSTED_SIDS, currentSid]);
}

function assertWindowsAclIdentity(acl, currentSid, { allowTrustedInstaller = false } = {}) {
  if (acl.currentSid !== currentSid || acl.reparsePoint) fail("PREVIEW_CREDENTIAL_PATH_UNSAFE");
  const ownerTrusted = trustedSids(currentSid).has(acl.ownerSid) ||
    (allowTrustedInstaller && acl.ownerSid === TRUSTED_INSTALLER_SID);
  if (!ownerTrusted) fail("PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED");
}

export function validateWindowsParentAclJson(serialized, expectedCurrentSid) {
  const acl = parseWindowsAcl(serialized);
  assertWindowsAclIdentity(acl, expectedCurrentSid);
  const trusted = trustedSids(expectedCurrentSid);
  if (!acl.entries.some((entry) => entry.access === "Allow" && trusted.has(entry.sid))) {
    fail("PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED");
  }
  for (const entry of acl.entries) {
    if (entry.access !== "Allow" || entry.isInheritOnly || trusted.has(entry.sid)) continue;
    if ((entry.rightsMask & UNSAFE_ANCESTOR_ALLOW_MASK) !== 0) {
      fail("PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED");
    }
  }
  return true;
}

export function validateWindowsHigherAncestorAclJson(serialized, expectedCurrentSid, { isVolumeRoot = false } = {}) {
  const acl = parseWindowsAcl(serialized);
  assertWindowsAclIdentity(acl, expectedCurrentSid, { allowTrustedInstaller: isVolumeRoot });
  const trusted = trustedSids(expectedCurrentSid);
  if (!acl.entries.some((entry) => entry.access === "Allow" && trusted.has(entry.sid))) {
    fail("PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED");
  }
  for (const entry of acl.entries) {
    if (entry.access !== "Allow" || entry.isInheritOnly || trusted.has(entry.sid)) continue;
    if ((entry.rightsMask & UNSAFE_HIGHER_ANCESTOR_ALLOW_MASK) !== 0) {
      fail("PREVIEW_CREDENTIAL_PARENT_NOT_PROTECTED");
    }
  }
  return true;
}

export function validateWindowsPrivateAclJson(serialized, expectedCurrentSid) {
  const acl = parseWindowsAcl(serialized);
  const currentSid = expectedCurrentSid ?? acl.currentSid;
  assertWindowsAclIdentity(acl, currentSid);
  const trusted = trustedSids(currentSid);
  if (
    acl.daclProtected !== true ||
    !acl.entries.some((entry) => entry.access === "Allow" && trusted.has(entry.sid)) ||
    acl.entries.some((entry) => entry.isInherited || !trusted.has(entry.sid))
  ) {
    fail("PREVIEW_CREDENTIAL_FILE_NOT_PROTECTED");
  }
  return true;
}

function readWindowsAclSnapshot(filename) {
  const serialized = runPowerShell(WINDOWS_ACL_QUERY, filename);
  return parseWindowsAcl(serialized);
}

function pathComponentsThrough(filename) {
  const parsed = path.win32.parse(filename);
  const components = [parsed.root];
  let current = parsed.root;
  for (const segment of filename.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean)) {
    current = path.win32.join(current, segment);
    components.push(current);
  }
  return components;
}

function inspectPathNode(filename, expectedKind) {
  let stat;
  try { stat = fs.lstatSync(filename); } catch { fail("PREVIEW_CREDENTIAL_FILE_UNAVAILABLE"); }
  if (stat.isSymbolicLink() || (expectedKind === "directory" && !stat.isDirectory()) || (expectedKind === "file" && !stat.isFile())) {
    fail("PREVIEW_CREDENTIAL_PATH_UNSAFE");
  }
}

export function readProtectedPreviewCredentialFile({
  platform = process.platform,
  knownFolderResolver = resolveWindowsKnownFolders,
  windowsAclReader = readWindowsAclSnapshot,
} = {}) {
  const location = resolvePreviewCredentialLocation({ platform, knownFolderResolver });
  const allComponents = pathComponentsThrough(location.credentialPath);
  const parentComponents = new Set([location.profilePath.toLowerCase()]);
  const higherAncestorComponents = new Set(pathComponentsThrough(location.profilePath).slice(0, -1).map((component) => component.toLowerCase()));
  for (const component of allComponents) {
    const normalizedComponent = component.toLowerCase();
    const isFile = normalizedComponent === location.credentialPath.toLowerCase();
    const isStrict = isFile || normalizedComponent === location.migrationDirectory.toLowerCase();
    inspectPathNode(component, isFile ? "file" : "directory");
    const isHigherAncestor = higherAncestorComponents.has(normalizedComponent);
    if (!isStrict && !parentComponents.has(normalizedComponent) && !isHigherAncestor) continue;
    const acl = windowsAclReader(component);
    if (!acl || acl.reparsePoint) fail("PREVIEW_CREDENTIAL_PATH_UNSAFE");
    const serialized = JSON.stringify(acl);
    if (isStrict) {
      validateWindowsPrivateAclJson(serialized, location.currentSid);
    } else if (parentComponents.has(normalizedComponent)) {
      validateWindowsParentAclJson(serialized, location.currentSid);
    } else if (isHigherAncestor) {
      const volumeRoot = path.win32.parse(location.profilePath).root.toLowerCase();
      validateWindowsHigherAncestorAclJson(serialized, location.currentSid, {
        isVolumeRoot: normalizedComponent === volumeRoot,
      });
    }
  }
  try { return fs.readFileSync(location.credentialPath, "utf8"); }
  catch { fail("PREVIEW_CREDENTIAL_FILE_UNAVAILABLE"); }
}

function value(row, key) {
  if (!row) return undefined;
  return row[key] ?? row[Object.keys(row)[0]];
}

function setDiagnosticOperation(diagnostics, operationId, phase) {
  if (
    diagnostics &&
    DIAGNOSTIC_OPERATIONS.has(operationId) &&
    DIAGNOSTIC_OPERATION_PHASES.has(phase)
  ) {
    diagnostics.setOperation(operationId, phase);
  }
}

async function executeReadOperation(db, operationId, query, diagnostics) {
  setDiagnosticOperation(diagnostics, operationId, "query");
  const result = await db.execute(query);
  setDiagnosticOperation(diagnostics, operationId, "result");
  return result;
}

async function tableExists(db, name, operationId, diagnostics) {
  const result = await executeReadOperation(db, operationId, {
    sql: "SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name=? LIMIT 1",
    args: [name],
  }, diagnostics);
  return result.rows.length === 1;
}

async function appSchemaObjects(db, diagnostics) {
  const result = await executeReadOperation(db, "schema-object-list", {
    sql: `SELECT type, name FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY type, name`,
    args: [],
  }, diagnostics);
  return result.rows;
}

async function currentSchemaJson(db, diagnostics) {
  const result = await executeReadOperation(db, "schema-snapshot", SCHEMA_JSON_QUERY, diagnostics);
  const rows = result.rows;
  const json = value(rows[0], "schema_json");
  setDiagnosticOperation(diagnostics, "schema-snapshot-check", "check");
  return typeof json === "string" ? json : "[]";
}

async function appRowCounts(db, diagnostics) {
  const result = await executeReadOperation(db, "application-table-list", {
    sql: `SELECT name FROM sqlite_schema
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
        AND name NOT IN (${INTERNAL_TABLES.map(sqlString).join(", ")})
      ORDER BY name`,
    args: [],
  }, diagnostics);
  const counts = [];
  for (const row of result.rows) {
    const name = String(value(row, "name"));
    setDiagnosticOperation(diagnostics, "application-table-check", "check");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fail("PREVIEW_SCHEMA_INVALID");
    const countResult = await executeReadOperation(db, "application-row-count", `SELECT COUNT(*) AS row_count FROM "${name}"`, diagnostics);
    const count = Number(value(countResult.rows[0], "row_count"));
    counts.push([name, count]);
  }
  return counts;
}

function assertEmptyBootstrapCounts(counts, diagnostics) {
  setDiagnosticOperation(diagnostics, "bootstrap-count-check", "check");
  if (counts.some(([, count]) => !Number.isFinite(count) || count !== 0)) {
    fail("PREVIEW_BOOTSTRAP_DATA_NOT_EMPTY");
  }
}

async function assertForeignKeysClear(db, operationId, diagnostics) {
  const result = await executeReadOperation(db, operationId, "PRAGMA foreign_key_check", diagnostics);
  const rows = result.rows;
  const rowCount = rows.length;
  setDiagnosticOperation(diagnostics, operationId, "check");
  if (rowCount !== 0) fail("PREVIEW_FOREIGN_KEY_CHECK_FAILED");
}

async function readMigrationState(db, { target, manifest, digest, diagnostics }) {
  const presence = [];
  const presenceTables = [
    [MIGRATION_TABLE, "migration-ledger-presence"],
    [CONTROL_TABLE, "control-table-presence"],
    [STATE_TABLE, "state-table-presence"],
    [CHECKPOINT_TABLE, "schema-checkpoint-presence"],
    [GATE_TABLE, "migration-gate-presence"],
  ];
  for (const [name, operationId] of presenceTables) {
    presence.push(await tableExists(db, name, operationId, diagnostics));
  }
  const [hasLedger, hasControl, hasState, hasCheckpoint, hasGate] = presence;
  const tables = [hasLedger, hasControl, hasState, hasCheckpoint, hasGate];
  setDiagnosticOperation(diagnostics, "migration-state-presence-check", "check");
  if (tables.every((present) => !present)) {
    const objects = await appSchemaObjects(db, diagnostics);
    const objectCount = objects.length;
    setDiagnosticOperation(diagnostics, "schema-object-check", "check");
    if (objectCount === 0) return { empty: true, prefixLength: 0 };
    fail("PREVIEW_UNTRACKED_DATABASE_STATE");
  }
  if (!tables.every(Boolean)) fail("PREVIEW_CONTROL_STATE_INCOMPLETE");

  const controlResult = await executeReadOperation(db, "control-row", `SELECT * FROM "${CONTROL_TABLE}" ORDER BY singleton`, diagnostics);
  const controlRows = controlResult.rows;
  const controlRowCount = controlRows.length;
  if (controlRowCount !== 1) {
    setDiagnosticOperation(diagnostics, "control-row-check", "check");
    fail("PREVIEW_CONTROL_STATE_INVALID");
  }
  const control = controlRows[0];
  const controlValues = {
    version: Number(value(control, "version")),
    targetName: String(value(control, "target_name")),
    endpointSha256: String(value(control, "endpoint_sha256")),
    manifestSha256: String(value(control, "manifest_sha256")),
    migrationCount: Number(value(control, "migration_count")),
    bootstrapEmpty: Number(value(control, "bootstrap_empty")),
  };
  setDiagnosticOperation(diagnostics, "control-row-check", "check");
  if (
    controlValues.version !== 1 ||
    controlValues.targetName !== target.databaseName ||
    controlValues.endpointSha256 !== target.endpointSha256 ||
    controlValues.manifestSha256 !== digest ||
    controlValues.migrationCount !== manifest.migrations.length ||
    controlValues.bootstrapEmpty !== 1
  ) {
    fail("PREVIEW_CONTROL_TARGET_OR_CHAIN_MISMATCH");
  }

  const ledgerResult = await executeReadOperation(db, "migration-ledger", `SELECT name FROM "${MIGRATION_TABLE}" ORDER BY name`, diagnostics);
  const ledgerRows = ledgerResult.rows;
  const ledgerNames = ledgerRows.map((row) => String(value(row, "name")));
  const stateResult = await executeReadOperation(db, "migration-state", `SELECT name, ordinal, sql_sha256, manifest_sha256, endpoint_sha256 FROM "${STATE_TABLE}" ORDER BY ordinal`, diagnostics);
  const stateRows = stateResult.rows;
  const checkpointResult = await executeReadOperation(db, "schema-checkpoint", `SELECT singleton, migration_name, schema_json FROM "${CHECKPOINT_TABLE}" ORDER BY singleton`, diagnostics);
  const checkpointRows = checkpointResult.rows;
  setDiagnosticOperation(diagnostics, "migration-prefix-check", "result");
  const ledgerCount = ledgerNames.length;
  const stateCount = stateRows.length;
  const appliedCount = Number(value(control, "applied_count"));
  setDiagnosticOperation(diagnostics, "migration-prefix-check", "check");
  if (
    ledgerCount !== stateCount ||
    ledgerCount > manifest.migrations.length ||
    appliedCount !== ledgerCount
  ) {
    fail("PREVIEW_MIGRATION_PREFIX_INVALID");
  }

  for (let index = 0; index < ledgerNames.length; index += 1) {
    const expected = manifest.migrations[index];
    const state = stateRows[index];
    setDiagnosticOperation(diagnostics, "migration-prefix-check", "result");
    const prefixMismatch =
      ledgerNames[index] !== expected.name ||
      String(value(state, "name")) !== expected.name ||
      Number(value(state, "ordinal")) !== index + 1 ||
      String(value(state, "sql_sha256")) !== expected.sqlSha256 ||
      String(value(state, "manifest_sha256")) !== digest ||
      String(value(state, "endpoint_sha256")) !== target.endpointSha256;
    setDiagnosticOperation(diagnostics, "migration-prefix-check", "check");
    if (prefixMismatch) fail("PREVIEW_MIGRATION_PREFIX_INVALID");
  }

  if (ledgerCount === 0) fail("PREVIEW_CONTROL_STATE_INVALID");
  setDiagnosticOperation(diagnostics, "checkpoint-consistency-check", "result");
  const lastMigration = String(value(control, "last_migration"));
  const checkpointCount = checkpointRows.length;
  const checkpointMigration = checkpointCount === 1 ? String(value(checkpointRows[0], "migration_name")) : undefined;
  const checkpointSingleton = checkpointCount === 1 ? Number(value(checkpointRows[0], "singleton")) : undefined;
  setDiagnosticOperation(diagnostics, "checkpoint-consistency-check", "check");
  if (
    lastMigration !== ledgerNames.at(-1) ||
    checkpointCount !== 1 ||
    checkpointMigration !== ledgerNames.at(-1) ||
    checkpointSingleton !== 1
  ) {
    fail("PREVIEW_SCHEMA_CHECKPOINT_INVALID");
  }

  setDiagnosticOperation(diagnostics, "schema-checkpoint", "result");
  const savedSchema = String(value(checkpointRows[0], "schema_json"));
  setDiagnosticOperation(diagnostics, "schema-snapshot-check", "check");
  if (!savedSchema || savedSchema !== (await currentSchemaJson(db, diagnostics))) {
    fail("PREVIEW_SCHEMA_DRIFT");
  }
  await assertForeignKeysClear(db, "state-foreign-key-check", diagnostics);
  const rowCounts = await appRowCounts(db, diagnostics);

  return { empty: false, prefixLength: ledgerNames.length, schemaSha256: sha256(savedSchema), rowCounts };
}

async function ensureControlTables(db, { target, digest, migrationCount }) {
  await db.execute(`CREATE TABLE "${MIGRATION_TABLE}" (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.execute(CONTROL_DDL);
  await db.execute(STATE_DDL);
  await db.execute(CHECKPOINT_DDL);
  await db.execute(GATE_DDL);
  await db.execute({
    sql: `INSERT INTO "${CONTROL_TABLE}" (singleton, version, target_name, endpoint_sha256, manifest_sha256, migration_count, applied_count, last_migration, bootstrap_empty)
      VALUES (1, 1, ?, ?, ?, ?, 0, NULL, 1)`,
    args: [target.databaseName, target.endpointSha256, digest, migrationCount],
  });
}

async function addSessionRebuildColumnsInTransaction(db) {
  const result = await db.execute('PRAGMA table_info("Session")');
  const existing = new Set(result.rows.map((row) => String(value(row, "name"))));
  if (existing.size === 0) fail("PREVIEW_SESSION_REBUILD_TABLE_MISSING");
  for (const [name, definition] of SESSION_REBUILD_COLUMNS) {
    if (!existing.has(name)) {
      await db.execute(`ALTER TABLE "Session" ADD COLUMN "${name}" ${definition}`);
    }
  }
}

async function recordMigration(db, { migration, ordinal, target, digest, schemaJson }) {
  await db.execute({
    sql: `INSERT INTO "${CHECKPOINT_TABLE}" (singleton, migration_name, schema_json)
      VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET migration_name=excluded.migration_name, schema_json=excluded.schema_json`,
    args: [migration.name, schemaJson],
  });
  await db.execute({
    sql: `INSERT INTO "${MIGRATION_TABLE}" (name, applied_at) VALUES (?, CURRENT_TIMESTAMP)`,
    args: [migration.name],
  });
  await db.execute({
    sql: `INSERT INTO "${STATE_TABLE}" (name, ordinal, sql_sha256, manifest_sha256, endpoint_sha256)
      VALUES (?, ?, ?, ?, ?)`,
    args: [migration.name, ordinal, migration.sqlSha256, digest, target.endpointSha256],
  });
  await db.execute({
    sql: `UPDATE "${CONTROL_TABLE}" SET applied_count=?, last_migration=? WHERE singleton=1`,
    args: [ordinal, migration.name],
  });
}

// Preserve every predicate while keeping expression depth logarithmic in the
// number of prefix rows/tables (hosted SQLite may enforce a depth limit of 100).
function balancedBooleanSql(expressions, operator) {
  if (expressions.length === 1) return expressions[0];
  const middle = Math.floor(expressions.length / 2);
  return `(${balancedBooleanSql(expressions.slice(0, middle), operator)} ${operator} ${balancedBooleanSql(expressions.slice(middle), operator)})`;
}

function makeManagedGateSql({ prefix, target, digest, appTables, migrationCount }) {
  const names = prefix.map((entry) => sqlString(entry.name));
  const expectedNames = names.length ? names.join(", ") : "''";
  const n = prefix.length;
  const expectedStateRows = prefix.length
    ? balancedBooleanSql(prefix.map((entry, index) => `("name"=${sqlString(entry.name)} AND "ordinal"=${index + 1}
      AND "sql_sha256"=${sqlString(entry.sqlSha256)}
      AND "manifest_sha256"=${sqlString(digest)}
      AND "endpoint_sha256"=${sqlString(target.endpointSha256)})`), "OR")
    : "0";
  const emptyTableChecks = appTables.length
    ? balancedBooleanSql(appTables.map((name) => `NOT EXISTS (SELECT 1 FROM "${name}" LIMIT 1)`), "AND")
    : "1";
  return `INSERT INTO "${GATE_TABLE}" (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM "${MIGRATION_TABLE}") = ${n}
  AND NOT EXISTS (SELECT 1 FROM "${MIGRATION_TABLE}" WHERE name NOT IN (${expectedNames}))
  AND (SELECT COUNT(*) FROM "${STATE_TABLE}") = ${n}
  AND NOT EXISTS (SELECT 1 FROM "${STATE_TABLE}" WHERE name NOT IN (${expectedNames}))
  AND NOT EXISTS (SELECT 1 FROM "${STATE_TABLE}" WHERE NOT (${expectedStateRows}))
  AND EXISTS (SELECT 1 FROM "${CONTROL_TABLE}" WHERE singleton=1 AND version=1
    AND target_name=${sqlString(target.databaseName)}
    AND endpoint_sha256=${sqlString(target.endpointSha256)}
    AND manifest_sha256=${sqlString(digest)}
    AND migration_count=${migrationCount}
    AND applied_count=${n}
    AND last_migration=${n ? sqlString(prefix.at(-1).name) : "NULL"}
    AND bootstrap_empty=1)
  AND EXISTS (SELECT 1 FROM "${CHECKPOINT_TABLE}" WHERE singleton=1
    AND migration_name=${n ? sqlString(prefix.at(-1).name) : "''"}
    AND schema_json IS (${SCHEMA_JSON_QUERY}))
  AND ${emptyTableChecks}
  THEN 1 ELSE 0 END;
DELETE FROM "${GATE_TABLE}";`;
}

function splitPreservingNewlines(sql) {
  return sql.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function injectManagedStatements(sql, { gateSql, beforeCommitSql, migrationName }) {
  if (migrationName !== MANAGED_MIGRATION) fail("PREVIEW_MANAGED_MIGRATION_UNEXPECTED");
  const lines = splitPreservingNewlines(sql);
  const contents = lines.map((line) => line.replace(/\r?\n$/, ""));
  const markerPositions = (marker) => contents.flatMap((line, index) => line.trim() === marker ? [index] : []);
  const transactionMarkers = markerPositions(MANAGED_MARKER);
  const ledgerMarkers = markerPositions(LEDGER_MARKER);
  const beginIndexes = markerPositions("BEGIN IMMEDIATE;");
  const commitIndexes = markerPositions("COMMIT;");
  const pragmaOffIndexes = markerPositions("PRAGMA foreign_keys=OFF;");
  const pragmaOnIndexes = markerPositions("PRAGMA foreign_keys=ON;");
  if (
    transactionMarkers.length !== 1 || ledgerMarkers.length !== 1 ||
    beginIndexes.length !== 1 || commitIndexes.length !== 1 ||
    pragmaOffIndexes.length !== 1 || pragmaOnIndexes.length !== 1 ||
    pragmaOffIndexes[0] + 1 !== beginIndexes[0] ||
    commitIndexes[0] + 1 !== pragmaOnIndexes[0] ||
    ledgerMarkers[0] + 1 !== commitIndexes[0] ||
    transactionMarkers[0] >= beginIndexes[0]
  ) {
    fail("PREVIEW_MANAGED_MIGRATION_SHAPE_INVALID");
  }

  lines.splice(beginIndexes[0] + 1, 0, `${gateSql}\n`);
  const shiftedLedgerIndex = ledgerMarkers[0] + 1;
  lines.splice(shiftedLedgerIndex, 1, `${beforeCommitSql}\n`);
  return lines.join("");
}

function managedBeforeCommitSql(migration, ordinal, target, digest) {
  return `INSERT INTO "${CHECKPOINT_TABLE}" (singleton, migration_name, schema_json)
SELECT 1, ${sqlString(migration.name)}, (${SCHEMA_JSON_QUERY})
ON CONFLICT(singleton) DO UPDATE SET migration_name=excluded.migration_name, schema_json=excluded.schema_json;
INSERT INTO "${MIGRATION_TABLE}" (name, applied_at) VALUES (${sqlString(migration.name)}, CURRENT_TIMESTAMP);
INSERT INTO "${STATE_TABLE}" (name, ordinal, sql_sha256, manifest_sha256, endpoint_sha256)
VALUES (${sqlString(migration.name)}, ${ordinal}, ${sqlString(migration.sqlSha256)}, ${sqlString(digest)}, ${sqlString(target.endpointSha256)});
UPDATE "${CONTROL_TABLE}" SET applied_count=${ordinal}, last_migration=${sqlString(migration.name)} WHERE singleton=1;`;
}

async function applyManagedMigration(client, {
  migration,
  prefix,
  target,
  digest,
  manifest,
  setDiagnosticStage,
  getDiagnosticStage,
}) {
  const observed = await readMigrationState(client, { target, manifest, digest });
  if (observed.empty || observed.prefixLength !== prefix.length) {
    fail("PREVIEW_MIGRATION_PREFIX_CHANGED");
  }
  assertEmptyBootstrapCounts(observed.rowCounts);
  const gateSql = makeManagedGateSql({
    prefix,
    target,
    digest,
    appTables: observed.rowCounts.map(([name]) => name),
    migrationCount: manifest.migrations.length,
  });
  const injected = injectManagedStatements(
    migration.sql,
    {
      gateSql,
      beforeCommitSql: managedBeforeCommitSql(migration, prefix.length + 1, target, digest),
      migrationName: migration.name,
    },
  );
  try {
    setDiagnosticStage("migration-application");
    await client.executeMultiple(injected);
  } catch (error) {
    try { await client.execute("PRAGMA foreign_keys=ON"); } catch { /* Preserve only the safe failure code. */ }
    failFromUnderlying(error, "PREVIEW_MIGRATION_ATOMIC_BATCH_FAILED", getDiagnosticStage());
  }
  try {
    setDiagnosticStage("schema-verification");
    await client.execute("PRAGMA foreign_keys=ON");
    await assertForeignKeysClear(client);
    const saved = await readMigrationState(client, { target, manifest, digest });
    if (saved.prefixLength !== prefix.length + 1) fail("PREVIEW_POST_MIGRATION_VERIFICATION_FAILED");
    if (saved.prefixLength < manifest.migrations.length) {
      assertEmptyBootstrapCounts(saved.rowCounts);
    }
    return saved;
  } catch (error) {
    if (isBrandedPreviewFailure(error)) preservePreviewFailure(error, getDiagnosticStage());
    failFromUnderlying(error, "PREVIEW_POST_MIGRATION_VERIFICATION_FAILED", getDiagnosticStage());
  }
}

async function applyTransactionalMigration(client, {
  migration,
  prefix,
  target,
  digest,
  manifest,
  initialize,
  setDiagnosticStage,
  getDiagnosticStage,
}) {
  let transaction;
  try {
    const readStage = getDiagnosticStage();
    setDiagnosticStage("connection");
    transaction = await client.transaction("write");
    setDiagnosticStage(readStage === "first-read" ? "first-read" : "schema-verification");
    const state = await readMigrationState(transaction, { target, manifest, digest });
    if (initialize) {
      if (!state.empty || prefix.length !== 0) fail("PREVIEW_INITIAL_DATABASE_NOT_EMPTY");
      await ensureControlTables(transaction, { target, digest, migrationCount: manifest.migrations.length });
    } else {
      if (state.empty) fail("PREVIEW_RESUME_STATE_MISSING");
      if (state.prefixLength > prefix.length) {
        if (state.prefixLength < manifest.migrations.length) assertEmptyBootstrapCounts(state.rowCounts);
        await transaction.commit();
        return { skippedByConcurrentWriter: true, prefixLength: state.prefixLength };
      }
      if (state.prefixLength !== prefix.length) fail("PREVIEW_MIGRATION_PREFIX_CHANGED");
      assertEmptyBootstrapCounts(state.rowCounts);
    }

    if (migration.name === SESSION_REBUILD_MIGRATION) {
      setDiagnosticStage("migration-application");
      await addSessionRebuildColumnsInTransaction(transaction);
    }
    setDiagnosticStage("migration-application");
    await transaction.executeMultiple(migration.sql);
    setDiagnosticStage("schema-verification");
    await assertForeignKeysClear(transaction);
    const counts = await appRowCounts(transaction);
    assertEmptyBootstrapCounts(counts);
    const schemaJson = await currentSchemaJson(transaction);
    setDiagnosticStage("migration-application");
    await recordMigration(transaction, {
      migration,
      ordinal: prefix.length + 1,
      target,
      digest,
      schemaJson,
    });
    await transaction.commit();
    return { skippedByConcurrentWriter: false, prefixLength: prefix.length + 1, schemaSha256: sha256(schemaJson) };
  } catch (error) {
    try { await transaction?.rollback(); } catch { /* No error details are emitted. */ }
    if (isBrandedPreviewFailure(error)) preservePreviewFailure(error, getDiagnosticStage());
    failFromUnderlying(error, "PREVIEW_MIGRATION_TRANSACTION_FAILED", getDiagnosticStage());
  } finally {
    try { transaction?.close(); } catch { /* Transaction may already be closed. */ }
  }
}

async function verifyIntegrityAndIdentity(db, migrations, diagnostics) {
  await assertForeignKeysClear(db, "integrity-foreign-key-check", diagnostics);
  const integrity = await executeReadOperation(db, "integrity-check", "PRAGMA integrity_check", diagnostics);
  const integrityRows = integrity.rows;
  const integrityRowCount = integrityRows.length;
  const integrityValue = integrityRowCount === 1 ? String(value(integrityRows[0], "integrity_check")) : undefined;
  setDiagnosticOperation(diagnostics, "integrity-check", "check");
  if (integrityRowCount !== 1 || integrityValue !== "ok") {
    fail("PREVIEW_INTEGRITY_CHECK_FAILED");
  }
  const expectedTriggers = new Set();
  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(/(CREATE\s+TRIGGER|DROP\s+TRIGGER(?:\s+IF\s+EXISTS)?)\s+"([^"]+)"/gi)) {
      if (/^CREATE/i.test(match[1])) expectedTriggers.add(match[2]);
      else expectedTriggers.delete(match[2]);
    }
  }
  const triggerResult = await executeReadOperation(db, "identity-trigger-list", "SELECT name FROM sqlite_schema WHERE type='trigger'", diagnostics);
  const actualTriggers = new Set(triggerResult.rows.map((row) => String(value(row, "name"))));
  setDiagnosticOperation(diagnostics, "identity-trigger-check", "check");
  if ([...expectedTriggers].some((name) => !actualTriggers.has(name))) {
    fail("PREVIEW_IDENTITY_GUARD_MISSING");
  }
}

async function readOnlyResult(client, { target, manifest, digest, migrations, diagnostics }) {
  const state = await readMigrationState(client, { target, manifest, digest, diagnostics });
  if (state.empty) {
    await verifyIntegrityAndIdentity(client, [], diagnostics);
    return { status: "EMPTY", applied: 0, total: manifest.migrations.length, schemaSha256: null, foreignKeyViolations: 0 };
  }
  if (state.prefixLength < manifest.migrations.length) assertEmptyBootstrapCounts(state.rowCounts, diagnostics);
  await verifyIntegrityAndIdentity(client, migrations.slice(0, state.prefixLength), diagnostics);
  return {
    status: state.prefixLength === manifest.migrations.length ? "COMPLETE" : "RESUMABLE_PREFIX",
    applied: state.prefixLength,
    total: manifest.migrations.length,
    lastMigration: manifest.migrations[state.prefixLength - 1].name,
    schemaSha256: state.schemaSha256,
    foreignKeyViolations: 0,
  };
}

function withDiagnosticStages(client, setDiagnosticStage) {
  let firstSuccessfulRead = true;
  const wrap = (database) => {
    const wrapped = {
      execute(...args) {
        return Promise.resolve()
          .then(() => database.execute(...args))
          .then((result) => {
            if (firstSuccessfulRead) {
              firstSuccessfulRead = false;
              setDiagnosticStage("schema-verification");
            }
            return result;
          });
      },
    };

    if (typeof database.executeMultiple === "function") {
      wrapped.executeMultiple = (...args) => {
        setDiagnosticStage("migration-application");
        return database.executeMultiple(...args);
      };
    }
    if (typeof database.transaction === "function") {
      wrapped.transaction = async (...args) => wrap(await database.transaction(...args));
    }
    if (typeof database.close === "function") {
      wrapped.close = (...args) => database.close(...args);
    }
    if (typeof database.rollback === "function") {
      wrapped.rollback = (...args) => database.rollback(...args);
    }
    if (typeof database.commit === "function") {
      wrapped.commit = (...args) => database.commit(...args);
    }
    return wrapped;
  };
  return wrap(client);
}

export function createPreviewMigrationRunner({ target, manifest, migrationsRoot }) {
  const digest = validateTargetManifestBinding(target, manifest);

  return async function runPreviewTursoMigration({
    mode,
    confirmation,
    readFile,
    clientFactory,
  }) {
    assertPreviewConfirmation({ mode, confirmation, target, manifestSha256: digest });
    const migrations = loadAndVerifyMigrations(migrationsRoot, manifest);
    if (typeof clientFactory !== "function") fail("PREVIEW_CLIENT_FACTORY_REQUIRED");

    let diagnosticStage = "credential-validation";
    let diagnosticOperation;
    const setDiagnosticStage = (stage) => {
      if (DIAGNOSTIC_STAGES.has(stage)) diagnosticStage = stage;
    };
    const getDiagnosticStage = () => diagnosticStage;
    const setOperation = (operationId, phase) => {
      if (DIAGNOSTIC_OPERATIONS.has(operationId) && DIAGNOSTIC_OPERATION_PHASES.has(phase)) {
        diagnosticOperation = Object.freeze({ operationId, phase });
      }
    };
    const getDiagnosticOperation = () => diagnosticOperation;
    let credentialText;
    try {
      credentialText = readFile
        ? await readFile()
        : readProtectedPreviewCredentialFile();
    } catch (error) {
      if (isBrandedPreviewFailure(error)) preservePreviewFailure(error, diagnosticStage);
      failFromUnderlying(error, "PREVIEW_CREDENTIAL_FILE_UNAVAILABLE", diagnosticStage);
    }
    let credentials;
    try {
      credentials = parsePreviewCredentialFile(credentialText);
    } catch (error) {
      failFromGuard(error, "PREVIEW_CREDENTIAL_FILE_INVALID", diagnosticStage);
    }
    diagnosticStage = "target-validation";
    try {
      assertPreviewTarget(credentials.url, target);
    } catch (error) {
      failFromGuard(error, "PREVIEW_TARGET_MISMATCH", diagnosticStage);
    }

    let client;
    try {
      diagnosticStage = "connection";
      client = await clientFactory({ url: credentials.url, authToken: credentials.authToken });
      if (!client || typeof client.execute !== "function") fail("PREVIEW_CLIENT_UNAVAILABLE");
    } catch (error) {
      if (isBrandedPreviewFailure(error)) preservePreviewFailure(error, diagnosticStage);
      failFromUnderlying(error, "PREVIEW_RUN_FAILED", diagnosticStage);
    }

    const stagedClient = withDiagnosticStages(client, setDiagnosticStage);
    try {
      if (mode === "verify-only") {
        diagnosticStage = "first-read";
        return await readOnlyResult(stagedClient, {
          target,
          manifest,
          digest,
          migrations,
          diagnostics: { setOperation },
        });
      }

      if (mode === "initial") {
        diagnosticStage = "first-read";
        const first = migrations[0];
        const firstState = await applyTransactionalMigration(stagedClient, {
          migration: first,
          prefix: [],
          target,
          digest,
          manifest,
          initialize: true,
          setDiagnosticStage,
          getDiagnosticStage,
        });
        if (firstState.skippedByConcurrentWriter) fail("PREVIEW_INITIAL_DATABASE_NOT_EMPTY");
      } else {
        diagnosticStage = "first-read";
        const existing = await readMigrationState(stagedClient, { target, manifest, digest });
        if (existing.empty) fail("PREVIEW_RESUME_STATE_MISSING");
        if (existing.prefixLength < manifest.migrations.length) assertEmptyBootstrapCounts(existing.rowCounts);
      }

      diagnosticStage = "schema-verification";
      let next = mode === "initial" ? 1 : (await readMigrationState(stagedClient, { target, manifest, digest })).prefixLength;
      while (next < migrations.length) {
        const prefix = migrations.slice(0, next);
        const migration = migrations[next];
        let applied;
        if (migration.sql.includes(MANAGED_MARKER)) {
          diagnosticStage = "schema-verification";
          applied = await applyManagedMigration(stagedClient, {
            migration,
            prefix,
            target,
            digest,
            manifest,
            setDiagnosticStage,
            getDiagnosticStage,
          });
        } else {
          diagnosticStage = "schema-verification";
          applied = await applyTransactionalMigration(stagedClient, {
            migration,
            prefix,
            target,
            digest,
            manifest,
            initialize: false,
            setDiagnosticStage,
            getDiagnosticStage,
          });
        }
        if (applied.prefixLength <= next) fail("PREVIEW_MIGRATION_PROGRESS_STALLED");
        next = applied.prefixLength;
      }

      diagnosticStage = "schema-verification";
      return await readOnlyResult(stagedClient, { target, manifest, digest, migrations });
    } catch (error) {
      const operationContext = mode === "verify-only" ? getDiagnosticOperation() : undefined;
      if (isBrandedPreviewFailure(error)) preservePreviewFailure(error, diagnosticStage, operationContext);
      failFromUnderlying(error, "PREVIEW_RUN_FAILED", diagnosticStage, operationContext);
    } finally {
      try { await client?.close?.(); } catch { /* Do not expose client errors or credentials. */ }
    }
  };
}
