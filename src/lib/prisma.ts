import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import { resolvePrismaRuntimeMode, selectPrismaTursoCredentials } from "./prismaRuntime";
import { assertRuntimeTursoEndpoint } from "../../scripts/turso-local-target-guard.mjs";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function getPrisma() {
  const { tursoUrl, tursoToken } = selectPrismaTursoCredentials(process.env);
  const runtimeMode = resolvePrismaRuntimeMode({
    nodeEnv: process.env.NODE_ENV,
    useTurso: process.env.USE_TURSO,
    tursoUrl,
    tursoToken,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL,
  });

  // 1. TURSO MODE
  if (runtimeMode === "turso") {
    // Fail before adapter construction. A local
    // checkout may connect only to its pinned development database.
    assertRuntimeTursoEndpoint(tursoUrl as string, {
      authToken: tursoToken as string,
    });
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
    } catch {
      throw new Error("Turso client initialization failed; database access remains disabled.");
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
