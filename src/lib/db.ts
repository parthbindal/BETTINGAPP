import { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/lib/env";

/**
 * Single Prisma instance per process. The driver adapter is chosen from the
 * connection string so the same code runs on SQLite locally and Postgres in
 * production (schema provider must match: see `npm run db:use-postgres`).
 */
/**
 * pg already treats sslmode=require as verify-full, and warns on every boot that
 * its next major will weaken it to libpq's meaning. Name verify-full outright:
 * the same certificate checks as today, and no warning in the build or logs.
 */
export function explicitSslMode(url: string): string {
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}

function createClient(): PrismaClient {
  if (config.isPostgres) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg") as typeof import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: explicitSslMode(config.databaseUrl) });
    return new PrismaClient({ adapter });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3") as typeof import("@prisma/adapter-better-sqlite3");
  const adapter = new PrismaBetterSqlite3({ url: config.databaseUrl });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/*
 * Eager, and deliberately kept that way.
 *
 * A lazy Proxy here looks like an upgrade: it would let tests import modules
 * that query the database without a reachable DATABASE_URL. It was tried and
 * reverted, because the testability problem has a plainer answer -- a pure
 * helper worth testing belongs in a module that does not import this one (see
 * lib/signal-rules.ts). Indirection on every query in the app is a steep price
 * for a convenience that a file split buys outright.
 */
export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (!config.isProd) globalForPrisma.prisma = db;
