import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Detection for build environment vs runtime
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                   process.env.NODE_ENV === 'production' && !process.env.TURSO_DATABASE_URL;

function getPrisma() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  // During build time, return a basic client to satisfy imports without connecting
  if (isBuildTime) {
    return globalForPrisma.prisma || new PrismaClient();
  }

  if (tursoUrl && tursoToken) {
    try {
      const libsql = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      });
      const adapter = new PrismaLibSql(libsql as any);
      return new PrismaClient({ adapter } as any);
    } catch (e) {
      console.error("Failed to initialize Turso adapter:", e);
    }
  }
  
  return globalForPrisma.prisma || new PrismaClient();
}

export const prisma = getPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
