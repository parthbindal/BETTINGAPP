import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/lib/env";

/**
 * Single Prisma instance per process. The driver adapter is chosen from the
 * connection string so the same code runs on SQLite locally and Postgres in
 * production (schema provider must match: see `npm run db:use-postgres`).
 */
function createClient(): PrismaClient {
  if (config.isPostgres) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: config.databaseUrl });
    return new PrismaClient({ adapter });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3") as typeof import("@prisma/adapter-better-sqlite3");
  const adapter = new PrismaBetterSqlite3({ url: config.databaseUrl });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (!config.isProd) globalForPrisma.prisma = db;
