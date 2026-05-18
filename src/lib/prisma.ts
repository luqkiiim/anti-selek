import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import { parseBooleanEnv, resolvePrismaRuntimeMode } from "./prismaRuntime";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function getPrisma() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  const runtimeMode = resolvePrismaRuntimeMode({
    nodeEnv: process.env.NODE_ENV,
    useTurso: process.env.USE_TURSO,
    tursoUrl,
    tursoToken,
  });

  if (
    parseBooleanEnv(process.env.USE_TURSO) === true &&
    runtimeMode === "sqlite"
  ) {
    console.warn(
      "USE_TURSO=true was requested, but TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are incomplete. Falling back to local SQLite."
    );
  }

  // 1. TURSO MODE
  if (runtimeMode === "turso") {
    console.log("Initializing Prisma with LibSQL adapter (Turso Mode)...");
    try {
      const libsql = createClient({
        url: tursoUrl as string,
        authToken: tursoToken as string,
      });
      const adapter = new PrismaLibSQL(
        libsql as unknown as ConstructorParameters<typeof PrismaLibSQL>[0]
      );
      return new PrismaClient(
        { adapter } as unknown as ConstructorParameters<typeof PrismaClient>[0]
      );
    } catch (e) {
      console.error("CRITICAL: Failed to initialize Prisma with LibSQL adapter:", e);
    }
  }
  
  // 2. LOCAL SQLITE MODE
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  console.log("Initializing standard PrismaClient (Local SQLite Mode)...");
  const client = new PrismaClient();
  
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrisma();
