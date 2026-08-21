import { prisma } from "../lib/db";
import { crawlAuchan, DEFAULT_AUCHAN_MODE, type AuchanCrawlMode } from "../scrapers/crawl/auchan";
import { crawlContinente } from "../scrapers/crawl/continente";
import { crawlPingoDoce } from "../scrapers/crawl/pingodoce";
import { isFoodSegment } from "../scrapers/crawl/auchan-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { coverageReport, isMeaningfulShortfall } from "../scrapers/crawl/report";
import { formatHttpStats } from "../scrapers/http";

/**
 * Crawl all three catalogues at once.
 *
 *   npm run crawl:all
 *   npm run crawl:all -- --mode=root      # Auchan walks its whole catalogue
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
  const { summaries, prices } = await queueWrite(() => persistCatalogue("CONTINENTE", results));
  console.log(`[${minutesSince(startedAt)}] Continente finished`);

  const { lines, total, short } = coverageReport(results, summaries, 22, maxPages !== undefined);
  return {
    title: `CONTINENTE - ${total} products across ${summaries.length} section(s), ${prices.changed} price change(s)`,
    lines,
    short,
    total,
  };
}

async function runPingoDoce(maxPages: number | undefined, startedAt: number) {
  const results = await crawlPingoDoce({ maxPages });
  const { summaries, prices } = await queueWrite(() => persistCatalogue("PINGO_DOCE", results));
  console.log(`[${minutesSince(startedAt)}] Pingo Doce finished`);

  const { lines, total, short } = coverageReport(results, summaries, 30, maxPages !== undefined);
  return {
    title: `PINGO DOCE - ${total} products across ${summaries.length} department(s), ${prices.changed} price change(s)`,
    lines,
    short,
    total,
  };
}

async function runAuchan(
  mode: AuchanCrawlMode,
  maxPages: number | undefined,
  startedAt: number
) {
  const { food, segmentTally, segmentSamples, crawled, walks, failedDepartments } =
    await crawlAuchan({ mode, maxPages });
  const { summaries, prices } = await queueWrite(() => persistCatalogue("AUCHAN", food));
  console.log(`[${minutesSince(startedAt)}] Auchan finished`);

  const { lines, total } = coverageReport(food, summaries, 28, maxPages !== undefined);

  // Coverage is judged per category walked, against the count each publishes for
  // itself - not per food department, whose size Auchan never states.
  const short: string[] = [];
  const walkLines = ["", "  categories walked:"];
  for (const w of walks) {
    let coverage = "";
    if (w.expected !== null) {
      const gap = w.expected - w.fetched;
      coverage = ` of ${w.expected} listed`;
      if (gap > 0 && maxPages === undefined) {
        if (isMeaningfulShortfall(gap, w.expected)) {
          coverage += `  SHORT by ${gap}`;
          short.push(w.label);
        } else {
          coverage += `  short by ${gap}`;
        }
      }
    }
    walkLines.push(
      `    ${w.label.padEnd(26)} ${String(w.fetched).padStart(6)} fetched` +
        `, ${String(w.added).padStart(6)} new${coverage}`
    );
  }
  for (const slug of failedDepartments) {
    short.push(`${slug} (id unreadable)`);
  }

  // Every top segment seen, with examples, so a food department wrongly dropped
  // by the whitelist is visible rather than lost silently.
  const tally = ["", "  all top segments seen:"];
  for (const [segment, n] of [...segmentTally].sort((a, b) => b[1] - a[1])) {
    const keep = isFoodSegment(segment);
    tally.push(`    ${keep ? "keep" : "drop"}  ${String(n).padStart(6)}  ${segment}`);
    if (!keep) {
      for (const sample of segmentSamples.get(segment) ?? []) {
        tally.push(`              ${sample.slice(0, 66)}`);
      }
    }
  }

  return {
    title:
      `AUCHAN [${mode}] - ${total} food products across ${summaries.length} department(s)` +
      `, ${prices.changed} price change(s)` +
      `, ${crawled} products walked`,
    lines: [...lines, ...walkLines, ...tally],
    short,
    total,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const maxPagesRaw = args.find((a) => a.startsWith("--max-pages="))?.split("=")[1];
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;
  const modeRaw = args.find((a) => a.startsWith("--mode="))?.split("=")[1];

  if (maxPagesRaw && (!Number.isInteger(maxPages) || (maxPages as number) < 1)) {
    console.error(`--max-pages must be a positive integer, got "${maxPagesRaw}"`);
    process.exit(1);
  }
  if (modeRaw !== undefined && modeRaw !== "root" && modeRaw !== "departments") {
    console.error(`--mode must be "root" or "departments", got "${modeRaw}"`);
    process.exit(1);
  }
  const mode: AuchanCrawlMode = modeRaw ?? DEFAULT_AUCHAN_MODE;

  const startedAt = Date.now();
  console.log(
    `Crawling Continente, Pingo Doce and Auchan [${mode}] concurrently` +
      `${maxPages ? ` (max ${maxPages} pages each)` : ""}...\n`
  );

  const stores = ["Continente", "Pingo Doce", "Auchan"];
  const settled = await Promise.allSettled([
    runContinente(maxPages, startedAt),
    runPingoDoce(maxPages, startedAt),
    runAuchan(mode, maxPages, startedAt),
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

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);

  console.log(
    `\nDone in ${minutesSince(startedAt)}: ${grandTotal} products across ${settled.length - failed.length} store(s).`
  );
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
