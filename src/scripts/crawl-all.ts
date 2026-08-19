import { prisma } from "../lib/db";
import { crawlAuchan } from "../scrapers/crawl/auchan";
import { crawlContinente } from "../scrapers/crawl/continente";
import { crawlPingoDoce } from "../scrapers/crawl/pingodoce";
import { isFoodSegment } from "../scrapers/crawl/auchan-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { coverageReport } from "../scrapers/crawl/report";

/**
 * Crawl all three catalogues at once.
 *
 *   npm run crawl:all
 *   npm run crawl:all -- --max-pages=2    # smoke test, applies to every store
 *
 * The stores are crawled CONCURRENTLY. This is safe and it is not impolite:
 * `fetchHtml` rate-limits per host, so each store still sees one request per
 * second - the three queues simply run side by side instead of end to end, and
 * the run costs the slowest store rather than the sum of all three.
 *
 * Database writes are the exception: SQLite takes one writer at a time, so each
 * store's results are queued and saved in turn as its crawl finishes. Saving is
 * quick next to a ten-minute crawl, so serialising it costs nothing.
 *
 * One store failing does not abandon the others; whatever the others collected
 * is still saved and reported, and the exit code reflects any failure.
 */

/** Serialises database writes: SQLite tolerates one writer, not three. */
let writes: Promise<unknown> = Promise.resolve();
function queueWrite<T>(work: () => Promise<T>): Promise<T> {
  const run = writes.then(work, work);
  writes = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function minutesSince(startedAt: number): string {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}

async function runContinente(maxPages: number | undefined, startedAt: number) {
  const results = await crawlContinente({ maxPages });
  const summaries = await queueWrite(() => persistCatalogue("CONTINENTE", results));
  console.log(`[${minutesSince(startedAt)}] Continente finished`);

  const { lines, total, short } = coverageReport(results, summaries, 22, maxPages !== undefined);
  return {
    title: `CONTINENTE - ${total} products across ${summaries.length} section(s)`,
    lines,
    short,
    total,
  };
}

async function runPingoDoce(maxPages: number | undefined, startedAt: number) {
  const results = await crawlPingoDoce({ maxPages });
  const summaries = await queueWrite(() => persistCatalogue("PINGO_DOCE", results));
  console.log(`[${minutesSince(startedAt)}] Pingo Doce finished`);

  const { lines, total, short } = coverageReport(results, summaries, 30, maxPages !== undefined);
  return {
    title: `PINGO DOCE - ${total} products across ${summaries.length} department(s)`,
    lines,
    short,
    total,
  };
}

async function runAuchan(maxPages: number | undefined, startedAt: number) {
  const { food, segmentTally, crawled, expected } = await crawlAuchan({ maxPages });
  const summaries = await queueWrite(() => persistCatalogue("AUCHAN", food));
  console.log(`[${minutesSince(startedAt)}] Auchan finished`);

  const { lines, total } = coverageReport(food, summaries, 28, maxPages !== undefined);

  // Auchan is walked as one catalogue rather than per department, so
  // completeness is judged against the catalogue-wide count; the store never
  // states a department's size here. The full segment tally is printed so a food
  // department wrongly dropped by the whitelist is visible rather than lost.
  const short: string[] = [];
  if (expected !== null && crawled < expected && maxPages === undefined) {
    short.push(`catalogue (walked ${crawled} of ${expected})`);
  }

  const tally = [...segmentTally]
    .sort((a, b) => b[1] - a[1])
    .map((entry) => `    ${isFoodSegment(entry[0]) ? "keep" : "drop"}  ${String(entry[1]).padStart(6)}  ${entry[0]}`);

  return {
    title:
      `AUCHAN - ${total} food products across ${summaries.length} department(s)` +
      `, walked ${crawled}${expected === null ? "" : ` of ${expected}`} catalogue-wide`,
    lines: [...lines, "", "  all top segments seen:", ...tally],
    short,
    total,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const maxPagesRaw = args.find((a) => a.startsWith("--max-pages="))?.split("=")[1];
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;

  if (maxPagesRaw && (!Number.isInteger(maxPages) || (maxPages as number) < 1)) {
    console.error(`--max-pages must be a positive integer, got "${maxPagesRaw}"`);
    process.exit(1);
  }

  const startedAt = Date.now();
  console.log(
    `Crawling Continente, Pingo Doce and Auchan concurrently` +
      `${maxPages ? ` (max ${maxPages} pages each)` : ""}...\n`
  );

  const stores = ["Continente", "Pingo Doce", "Auchan"];
  const settled = await Promise.allSettled([
    runContinente(maxPages, startedAt),
    runPingoDoce(maxPages, startedAt),
    runAuchan(maxPages, startedAt),
  ]);

  let grandTotal = 0;
  const short: string[] = [];
  const failed: string[] = [];

  for (const [i, outcome] of settled.entries()) {
    console.log();
    if (outcome.status === "rejected") {
      failed.push(stores[i]);
      console.log(`${stores[i].toUpperCase()} - FAILED: ${outcome.reason}`);
      continue;
    }
    grandTotal += outcome.value.total;
    short.push(...outcome.value.short);
    console.log(outcome.value.title);
    for (const line of outcome.value.lines) console.log(line);
  }

  console.log(`\nDone in ${minutesSince(startedAt)}: ${grandTotal} products across ${settled.length - failed.length} store(s).`);
  if (short.length > 0) {
    console.log(`\nWARNING: came up short: ${short.join(", ")}`);
  }
  if (failed.length > 0) {
    console.log(`WARNING: ${failed.join(", ")} failed; the other stores were still saved.`);
    process.exitCode = 1;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
