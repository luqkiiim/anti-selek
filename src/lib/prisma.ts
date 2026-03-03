import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function getPrisma() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  console.log("Database connection check:");
  console.log("- TURSO_DATABASE_URL exists:", !!tursoUrl);
  console.log("- TURSO_AUTH_TOKEN exists:", !!tursoToken);

  if (tursoUrl && tursoToken) {
    console.log("Mode: CLOUD (Turso)");
    try {
      const libsql = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      });
      const adapter = new PrismaLibSql(libsql as any);
      return new PrismaClient({ adapter } as any);
    } catch (e) {
      console.error("CRITICAL: Failed to initialize Turso adapter:", e);
    }
  }
  
  console.log("Mode: LOCAL (SQLite)");
  return globalForPrisma.prisma || new PrismaClient();
}

export const prisma = getPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
