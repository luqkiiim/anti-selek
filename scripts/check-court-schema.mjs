import { createClient } from "@libsql/client/web";

/** Read-only: a Git push must not deploy an app against an unmigrated database. */
export async function assertDeployedCourtSchema(env = process.env, connect = createClient) {
  if (env.VERCEL !== "1") return;
  const preview = env.VERCEL_ENV === "preview";
  const url = preview ? env.PREVIEW_TURSO_DATABASE_URL : env.TURSO_DATABASE_URL;
  const authToken = preview ? env.PREVIEW_TURSO_AUTH_TOKEN : env.TURSO_AUTH_TOKEN;
  if (!["production", "preview"].includes(env.VERCEL_ENV) || !url || !authToken) {
    throw new Error("Deployment held: matching database credentials are required for the read-only court schema check.");
  }
  let client;
  try {
    client = connect({ url, authToken });
    const schema = await client.execute('PRAGMA table_info("Court")');
    if (!schema.rows.some(column => column.name === "isActive")) {
      throw new Error("Court availability migration is pending");
    }
  } catch {
    throw new Error("Deployment held: verify the court availability migration through the separately approved database release procedure. Builds never apply migrations.");
  } finally {
    client?.close();
  }
}
