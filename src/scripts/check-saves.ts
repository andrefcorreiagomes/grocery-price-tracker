import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { STORE_LIST, type Store } from "../lib/stores";

/**
 * `npm run check:saves`: did last night's run save what it read? (The user's
 * request, 23 October 2026.)
 *
 * Read-only, from the database and the reports alone - no request to any
 * store, no write. For each store's newest run (CrawlRun; its startedAt is the
 * instant the run stamped on everything it saved):
 *
 *   1. products saved   rows stamped with the run's instant = the report's
 *                       "products seen"
 *   2. prices saved     price periods stamped with the run's instant = the
 *                       report's prices opened + changed + unchanged; every
 *                       product seen with a price has exactly one open period,
 *                       stamped tonight, holding that same price (in cents)
 *   3. accounted for    every product still held as on sale was either seen
 *                       tonight or looked at tonight (its page answered gone,
 *                       out of stock, or could not be reached) - none simply
 *                       forgotten
 * and for the whole database: SQLite's own consistency check, the links
 * between tables, and no product with two open price periods.
 *
 * What it cannot prove: that each price is the RIGHT number (a page misread).
 * That is the job of the brakes (brakes.ts) and the odd-price check.
 */

interface ReportFigures {
  seen: number;
  prices: { opened: number; changed: number; unchanged: number };
  file: string;
}

/** The report written by the run that started at `seenAt` (reports/<store>-*.json). */
function reportFor(store: Store, seenAt: Date): ReportFigures | null {
  const prefix = store.toLowerCase();
  for (const file of readdirSync("reports").filter((f) => f.startsWith(prefix) && f.endsWith(".json"))) {
    try {
      const r = JSON.parse(readFileSync(path.join("reports", file), "utf8"));
      if (Math.abs(new Date(r.runAt).getTime() - seenAt.getTime()) < 1_000) {
        return { seen: r.catalogue.seen, prices: r.prices, file };
      }
    } catch {
      // an unreadable report is skipped; "no report" is said below
    }
  }
  return null;
}

let problems = 0;
const say = (ok: boolean, line: string) => {
  if (!ok) problems++;
  console.log(`  ${ok ? "ok     " : "PROBLEM"}  ${line}`);
};

async function checkStore(store: Store) {
  const run = await prisma.crawlRun.findFirst({ where: { store }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  if (!run) return console.log(`\n${store}: no run recorded`);
  const seenAt = run.startedAt;
  const report = reportFor(store, seenAt);
  console.log(`\n${store}: the run of ${seenAt.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}${report ? ` (report ${report.file})` : " - no report found for it"}`);

  // 1. products saved
  const seen = await prisma.catalogueProduct.count({ where: { store, lastSeenAt: seenAt } });
  if (report) say(seen === report.seen, `products saved with tonight's stamp: ${seen.toLocaleString()}; the report says it saw ${report.seen.toLocaleString()}`);
  else console.log(`  -        products saved with tonight's stamp: ${seen.toLocaleString()} (no report to compare with)`);

  // 2. prices saved
  const stamped = await prisma.cataloguePrice.count({ where: { lastSeenAt: seenAt, product: { store } } });
  if (report) {
    const expected = report.prices.opened + report.prices.changed + report.prices.unchanged;
    say(stamped === expected, `prices stamped tonight: ${stamped.toLocaleString()}; the report says ${expected.toLocaleString()} (opened ${report.prices.opened}, changed ${report.prices.changed}, unchanged ${report.prices.unchanged.toLocaleString()})`);
  }
  const pricedTonight = await prisma.catalogueProduct.findMany({
    where: { store, lastSeenAt: seenAt, price: { not: null } },
    select: { storeProductId: true, price: true, prices: { where: { isOpen: true }, select: { price: true, lastSeenAt: true } } },
  });
  const wrong = pricedTonight.filter(
    (p) =>
      p.prices.length !== 1 ||
      p.prices[0].lastSeenAt.getTime() !== seenAt.getTime() ||
      Math.round(p.prices[0].price * 100) !== Math.round((p.price as number) * 100)
  );
  say(wrong.length === 0, `products seen with a price whose price history agrees: ${(pricedTonight.length - wrong.length).toLocaleString()} of ${pricedTonight.length.toLocaleString()}` +
    (wrong.length ? `; disagreeing, e.g. ${wrong.slice(0, 5).map((w) => w.storeProductId).join(", ")}` : ""));

  // 3. accounted for
  const forgotten = await prisma.catalogueProduct.findMany({
    where: { store, delistedAt: null, lastSeenAt: { lt: seenAt }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: seenAt } }] },
    select: { storeProductId: true, name: true },
  });
  say(forgotten.length === 0, `products on sale neither seen nor looked at tonight: ${forgotten.length.toLocaleString()}` +
    (forgotten.length ? `, e.g. ${forgotten.slice(0, 3).map((f) => `${f.storeProductId} ${f.name.slice(0, 30)}`).join("; ")}` : ""));
}

async function main() {
  console.log("Did last night's run save what it read? (read-only: no requests, no writes)");
  console.log("\nthe whole database");
  const integrity = await prisma.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
  say(integrity.length === 1 && integrity[0].integrity_check === "ok", `SQLite's own consistency check: ${integrity.map((r) => r.integrity_check).join("; ")}`);
  const links = await prisma.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check");
  say(links.length === 0, `links between tables that point nowhere: ${links.length}`);
  const twoOpen = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM (SELECT productId FROM CataloguePrice WHERE isOpen = 1 GROUP BY productId HAVING COUNT(*) > 1)`
  );
  say(Number(twoOpen[0].n) === 0, `products with two open price periods at once: ${Number(twoOpen[0].n)}`);

  for (const s of STORE_LIST) await checkStore(s.id);

  console.log(`\n${problems === 0 ? "everything read was saved, and every product is accounted for" : `${problems} PROBLEM(S) - see above`}`);
  if (problems > 0) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
