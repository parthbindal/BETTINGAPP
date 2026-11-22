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

function client(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;
  const created = createClient();
  // Dev reuses the instance across hot reloads; prod gets one per process anyway.
  if (!config.isProd) globalForPrisma.prisma = created;
  return created;
}

/**
 * Built on first use, not on import.
 *
 * Modules that talk to the database also export pure helpers -- scoring rules,
 * formatters, predicates -- and those have to be importable by tests and
 * scripts without a reachable DATABASE_URL. Constructing the client at import
 * time turned every such import into a connection-config dependency, so a unit
 * test of a pure function failed on adapter/provider mismatch before it ran a
 * single assertion. Methods are bound to the real client because Prisma's
 * internals use private fields, which throw when `this` is a proxy.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const real = client();
    const value = Reflect.get(real, prop) as unknown;
    return typeof value === "function" ? value.bind(real) : value;
  },
});
