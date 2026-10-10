import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  assertPreviewConfirmation,
  assertPreviewTarget,
  canonicalPreviewManifestPayload,
  endpointFingerprint,
  parsePreviewCredentialFile,
  previewManifestSha256,
} from "./preview-turso-target-guard.mjs";

const syntheticEndpoint = "libsql://preview-fixture.invalid";
const syntheticEndpointSha256 = endpointFingerprint(syntheticEndpoint);
const syntheticTarget = {
  databaseName: "preview-fixture",
  endpointSha256: syntheticEndpointSha256,
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function makeManifest(target = syntheticTarget, count = 58) {
  const migrations = Array.from({ length: count }, (_, index) => ({
    name: `20260101${String(index).padStart(6, "0")}_migration_${String(index).padStart(2, "0")}`,
    sqlSha256: sha256(`synthetic-migration-${index}`),
  }));
  const manifest = {
    version: 1,
    target: {
      databaseName: target.databaseName,
      endpointSha256: target.endpointSha256,
      migrationCount: count,
    },
    migrations,
  };
  return { ...manifest, manifestSha256: previewManifestSha256(manifest) };
}

test("normalizes only secure HTTPS and libSQL endpoint origins", () => {
  assert.equal(endpointFingerprint(syntheticEndpoint), syntheticEndpointSha256);
  assert.equal(endpointFingerprint("https://preview-fixture.invalid/"), syntheticEndpointSha256);
  assert.equal(assertPreviewTarget(syntheticEndpoint, syntheticTarget), syntheticEndpointSha256);
  assert.throws(
    () => assertPreviewTarget("libsql://other-fixture.invalid", syntheticTarget),
    /PREVIEW_TARGET_MISMATCH/,
  );
});

test("rejects endpoints with non-TLS schemes or embedded URL data", () => {
  for (const value of [
    "http://preview-fixture.invalid",
    "libsql://user@preview-fixture.invalid",
    "libsql://preview-fixture.invalid/path",
    "libsql://preview-fixture.invalid?token=not-allowed",
    "libsql://preview-fixture.invalid#fragment",
  ]) {
    assert.throws(() => endpointFingerprint(value), /PREVIEW_ENDPOINT_INVALID/);
  }
});

test("parses exactly the two Preview credential keys without generic credential fallback", () => {
  const parsed = parsePreviewCredentialFile(
    `PREVIEW_TURSO_DATABASE_URL=${syntheticEndpoint}\nPREVIEW_TURSO_AUTH_TOKEN=synthetic-test-token\n`,
  );
  assert.equal(parsed.url, syntheticEndpoint);
  assert.equal(sha256(parsed.authToken), sha256("synthetic-test-token"));
  assert.deepEqual(Object.keys(parsed).sort(), ["authToken", "url"]);

  for (const contents of [
    "TURSO_DATABASE_URL=libsql://generic.invalid\nTURSO_AUTH_TOKEN=synthetic-test-token\n",
    `PREVIEW_TURSO_DATABASE_URL=${syntheticEndpoint}\nTURSO_AUTH_TOKEN=synthetic-test-token\n`,
    `PREVIEW_TURSO_DATABASE_URL=${syntheticEndpoint}\nPREVIEW_TURSO_AUTH_TOKEN=synthetic-test-token\nTURSO_AUTH_TOKEN=synthetic-extra\n`,
    `PREVIEW_TURSO_DATABASE_URL=${syntheticEndpoint}\nPREVIEW_TURSO_DATABASE_URL=${syntheticEndpoint}\nPREVIEW_TURSO_AUTH_TOKEN=synthetic-test-token\n`,
    `PREVIEW_TURSO_DATABASE_URL=${syntheticEndpoint}\nPREVIEW_TURSO_AUTH_TOKEN=\n`,
    `PREVIEW_TURSO_DATABASE_URL=${syntheticEndpoint}\n`,
  ]) {
    assert.throws(() => parsePreviewCredentialFile(contents), /PREVIEW_CREDENTIAL_FILE_INVALID/);
  }
});

test("canonical manifest binds ordered migration hashes to one target", () => {
  const manifest = makeManifest();
  const payload = canonicalPreviewManifestPayload(manifest);
  assert.equal(payload.migrations.length, 58);
  assert.equal(payload.target.databaseName, syntheticTarget.databaseName);
  assert.equal(payload.target.endpointSha256, syntheticTarget.endpointSha256);
  assert.equal(previewManifestSha256(manifest), manifest.manifestSha256);

  const changed = {
    ...manifest,
    migrations: manifest.migrations.map((item, index) =>
      index === 31 ? { ...item, sqlSha256: sha256("changed migration") } : item,
    ),
  };
  assert.notEqual(previewManifestSha256(changed), manifest.manifestSha256);

  const unsorted = { ...manifest, migrations: [...manifest.migrations].reverse() };
  assert.throws(() => canonicalPreviewManifestPayload(unsorted), /PREVIEW_MANIFEST_INVALID/);
  const wrongCount = { ...manifest, target: { ...manifest.target, migrationCount: 57 } };
  assert.throws(() => canonicalPreviewManifestPayload(wrongCount), /PREVIEW_MANIFEST_INVALID/);
});

test("rejects malformed target identity inside a canonical manifest", () => {
  const manifest = makeManifest();
  const malformedTargets = [
    { ...manifest.target, databaseName: "" },
    { ...manifest.target, endpointSha256: "not-a-sha256" },
  ];
  for (const target of malformedTargets) {
    assert.throws(
      () => canonicalPreviewManifestPayload({ ...manifest, target }),
      /PREVIEW_MANIFEST_INVALID/,
    );
  }
});

test("requires exact target, endpoint and manifest confirmations before initial mode", () => {
  const manifest = makeManifest();
  const confirmation = {
    databaseName: syntheticTarget.databaseName,
    endpointSha256: syntheticTarget.endpointSha256,
    manifestSha256: manifest.manifestSha256,
    expectEmpty: true,
  };
  assert.equal(
    assertPreviewConfirmation({
      mode: "initial",
      confirmation,
      target: syntheticTarget,
      manifestSha256: manifest.manifestSha256,
    }),
    true,
  );

  for (const altered of [
    { ...confirmation, databaseName: "another-preview" },
    { ...confirmation, endpointSha256: sha256("wrong endpoint") },
    { ...confirmation, manifestSha256: sha256("wrong manifest") },
    { ...confirmation, expectEmpty: false },
  ]) {
    assert.throws(
      () => assertPreviewConfirmation({
        mode: "initial",
        confirmation: altered,
        target: syntheticTarget,
        manifestSha256: manifest.manifestSha256,
      }),
      /PREVIEW_(CONFIRMATION_MISMATCH|EMPTY_CONFIRMATION_REQUIRED)/,
    );
  }

  const nonInitial = {
    databaseName: syntheticTarget.databaseName,
    endpointSha256: syntheticTarget.endpointSha256,
    manifestSha256: manifest.manifestSha256,
  };
  for (const mode of ["resume", "verify-only"]) {
    assert.equal(
      assertPreviewConfirmation({
        mode,
        confirmation: nonInitial,
        target: syntheticTarget,
        manifestSha256: manifest.manifestSha256,
      }),
      true,
    );
    assert.throws(
      () => assertPreviewConfirmation({
        mode,
        confirmation: { ...nonInitial, expectEmpty: true },
        target: syntheticTarget,
        manifestSha256: manifest.manifestSha256,
      }),
      /PREVIEW_CONFIRMATION_MISMATCH/,
    );
  }
});
