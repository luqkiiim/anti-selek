import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Use TURSO variables if available, otherwise fallback to standard DATABASE_URL
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let prismaInstance: PrismaClient;

if (tursoUrl && tursoToken) {
  // Cloud Mode (Turso)
  console.log("Initializing Prisma with Turso LibSQL adapter");
  const libsql = createClient({
    url: tursoUrl,
    authToken: tursoToken,
  });
  const adapter = new PrismaLibSql(libsql as any);
  prismaInstance = new PrismaClient({ adapter } as any);
} else {
  // Local Mode (SQLite file)
  console.log("Initializing Prisma with local SQLite");
  prismaInstance = globalForPrisma.prisma || new PrismaClient();
}

export const prisma = prismaInstance;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
