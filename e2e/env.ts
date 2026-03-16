import path from "node:path";

export const e2eBaseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3005";
export const e2eDatabaseFile = path.join(process.cwd(), "prisma", "e2e.db");
export const e2eDatabaseUrl = `file:${e2eDatabaseFile.replace(/\\/g, "/")}`;

const rawEnv = {
  ...process.env,
  DATABASE_URL: e2eDatabaseUrl,
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret",
  NEXTAUTH_URL: e2eBaseURL,
  AUTH_URL: e2eBaseURL,
  ADMIN_EMAILS: "",
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
};

export const e2eEnv = Object.fromEntries(
  Object.entries(rawEnv).filter(([, value]) => value !== undefined)
) as Record<string, string>;
