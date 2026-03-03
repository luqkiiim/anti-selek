import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const useLibSQL = process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN;

let prismaInstance: PrismaClient;

// Build-time safety: Don't initialize Turso if we're just building
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || !useLibSQL;

if (useLibSQL && !isBuildTime) {
  try {
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const adapter = new PrismaLibSql(libsql as any);
    prismaInstance = new PrismaClient({ adapter } as any);
  } catch (e) {
    console.error("Failed to initialize LibSQL adapter, falling back to default", e);
    prismaInstance = new PrismaClient();
  }
} else {
  prismaInstance = globalForPrisma.prisma || new PrismaClient();
}

export const prisma = prismaInstance;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
