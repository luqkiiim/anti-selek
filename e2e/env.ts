import path from "node:path";

export const e2eBaseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3005";
const e2eDatabasePath =
  process.env.E2E_DATABASE_FILE ?? path.join("prisma", "e2e.db");
export const e2eDatabaseFile = path.resolve(process.cwd(), e2eDatabasePath);
export const e2eDatabaseUrl = `file:${e2eDatabaseFile.replace(/\\/g, "/")}`;

const rawEnv = {
  ...process.env,
  DATABASE_URL: e2eDatabaseUrl,
  USE_TURSO: "false",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret-with-at-least-32-characters",
  NEXTAUTH_URL: e2eBaseURL,
  AUTH_URL: e2eBaseURL,
  E2E_DISABLE_RATE_LIMITS: "true",
  ADMIN_EMAILS: "",
  GLOBAL_CLUB_VIEWER_EMAILS: "global-viewer-e2e@example.com",
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
};

export const e2eEnv = Object.fromEntries(
  Object.entries(rawEnv).filter(([, value]) => value !== undefined)
) as Record<string, string>;
