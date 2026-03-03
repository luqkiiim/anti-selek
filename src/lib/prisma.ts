import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function getPrisma() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  // 1. CLOUD MODE (Vercel)
  if (tursoUrl && tursoToken) {
    console.log("Initializing Prisma with LibSQL adapter (Turso Mode)...");
    try {
      const libsql = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      });
      const adapter = new PrismaLibSQL(libsql as any);
      return new PrismaClient({ adapter } as any);
    } catch (e) {
      console.error("CRITICAL: Failed to initialize Prisma with LibSQL adapter:", e);
      // We fall back, which will trigger the 'Unable to open database' error if local dev.db is missing.
    }
  }
  
  // 2. LOCAL MODE (Development)
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
