import path from "node:path";
import { config } from "dotenv";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// The scripts run outside Next.js, which is what normally reads .env, and this
// file may be the first to need it. A variable already set wins over .env.
config({ quiet: true });

/**
 * The database file, from `DATABASE_URL` ("file:./dev.db"), resolved against
 * the folder the program runs in; dev.db there when the setting is absent.
 *
 * Until 22 October 2026 the app always opened dev.db and only the Prisma tools
 * read the setting, so the automatic checks could not be pointed at a copy
 * (code review M7). They now run on one (verify-on-copy.ts).
 */
export function databaseFile(): string {
  const url = process.env.DATABASE_URL?.trim();
  const file = url && url.startsWith("file:") ? url.slice("file:".length) : "dev.db";
  return path.resolve(process.cwd(), file);
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaBetterSqlite3({
  url: `file:${databaseFile()}`,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
