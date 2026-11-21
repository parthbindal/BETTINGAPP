// Switch the Prisma datasource provider between sqlite (local) and postgresql (production).
// Migrations are provider-specific: after switching, delete prisma/migrations and run
// `npx prisma migrate dev --name init` against the new database.
import fs from "node:fs";

const target = process.argv[2];
if (!["sqlite", "postgresql"].includes(target)) {
  console.error("usage: node scripts/switch-db.mjs <sqlite|postgresql>");
  process.exit(1);
}
const path = "prisma/schema.prisma";
const src = fs.readFileSync(path, "utf8");
const next = src.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${target}"`);
fs.writeFileSync(path, next);
console.log(`datasource provider set to ${target}.`);
console.log(target === "postgresql"
  ? "Set DATABASE_URL to your Postgres URL, remove prisma/migrations, then run: npx prisma migrate dev --name init && npm run db:seed"
  : "Set DATABASE_URL=file:./prisma/dev.db, remove prisma/migrations, then run: npx prisma migrate dev --name init && npm run db:seed");
