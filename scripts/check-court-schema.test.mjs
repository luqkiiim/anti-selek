import assert from "node:assert/strict";
import test from "node:test";
import { assertDeployedCourtSchema } from "./check-court-schema.mjs";

const production = { VERCEL: "1", VERCEL_ENV: "production", TURSO_DATABASE_URL: "libsql://fixture.turso.io", TURSO_AUTH_TOKEN: "fixture" };

test("holds deployment on an old schema and closes the read-only connection", async () => {
  let closed = false;
  const connect = () => ({ execute: async sql => { assert.equal(sql, 'PRAGMA table_info("Court")'); return { rows: [{ name: "id" }] }; }, close: () => { closed = true; } });
  await assert.rejects(assertDeployedCourtSchema(production, connect), /Deployment held/);
  assert.equal(closed, true);
});

test("accepts the migrated schema without writing", async () => {
  await assertDeployedCourtSchema(production, () => ({ execute: async sql => { assert.match(sql, /^PRAGMA table_info/); return { rows: [{ name: "isActive" }] }; }, close() {} }));
});

test("uses isolated Preview credentials", async () => {
  const preview = { ...production, VERCEL_ENV: "preview", PREVIEW_TURSO_DATABASE_URL: "libsql://preview.turso.io", PREVIEW_TURSO_AUTH_TOKEN: "preview-fixture" };
  await assertDeployedCourtSchema(preview, config => {
    assert.deepEqual(config, { url: preview.PREVIEW_TURSO_DATABASE_URL, authToken: preview.PREVIEW_TURSO_AUTH_TOKEN });
    return { execute: async () => ({ rows: [{ name: "isActive" }] }), close() {} };
  });
});

test("local builds make no database connection", async () => {
  await assertDeployedCourtSchema({}, () => { throw new Error("Unexpected connection"); });
});
