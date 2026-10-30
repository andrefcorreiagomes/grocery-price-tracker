import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { databaseFile, prisma } from "../lib/db";

/**
 * `npm run verify:nightly`: the automatic checks, on a COPY of the database.
 *
 * Many checks write made-up products (zzverify-, zzm-, zzsafe-...) and delete
 * them afterwards. Until 22 October 2026 they did so in the real database every
 * night; none was ever left behind, but a check that crashed half-way could
 * have left one, and one that went wrong could have touched real rows (code
 * review M7). Now SQLite writes a consistent copy (the same VACUUM INTO as the
 * nightly backup), the checks run on it in their own process with
 * DATABASE_URL pointing there, and the copy is deleted.
 *
 *   npm run verify:nightly          on a copy (this)
 *   npm run verify:nightly:here     on the database itself, as before
 */
async function main() {
  const real = databaseFile();
  const copy = path.join(os.tmpdir(), `grocery-verify-${process.pid}.db`);
  console.log(`copying the database for the checks (${path.basename(real)} to ${copy})`);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  await prisma.$disconnect();

  try {
    // The copy is classified with today's rules first, as the nightly does
    // before its checks. Before the night, the server tests new code on a copy
    // of the PREVIOUS night's database: a new rule for kinds of food would fail
    // the check that every kind stored is today's, and the update be undone
    // (found 29 October 2026). About 10 seconds; it writes the copy only.
    const classify = spawnSync("npx tsx src/scripts/classify-food-types.ts", {
      shell: true,
      stdio: "ignore",
      env: { ...process.env, DATABASE_URL: `file:${copy}` },
    });
    if (classify.status !== 0) console.log("classifying the copy failed; the checks run on it as it is");
    const run = spawnSync("npx tsx --expose-gc src/scripts/verify-nightly.ts", {
      shell: true,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: `file:${copy}` },
    });
    process.exitCode = run.status ?? 1;
  } finally {
    for (const f of [copy, `${copy}-wal`, `${copy}-shm`]) if (existsSync(f)) rmSync(f);
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
