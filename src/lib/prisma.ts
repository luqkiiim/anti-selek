import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function getPrisma() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  // If we have Turso credentials, always try to use them
  if (tursoUrl && tursoToken) {
    try {
      const libsql = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      });
      const adapter = new PrismaLibSql(libsql as any);
      return new PrismaClient({ adapter } as any);
    } catch (e) {
      console.error("Failed to initialize LibSQL adapter:", e);
    }
  }
  
  // Fallback to local SQLite (for build time or local dev)
  return globalForPrisma.prisma || new PrismaClient();
}

export const prisma = getPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
