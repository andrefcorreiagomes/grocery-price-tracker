import { prisma } from "../lib/db";
import { crawlAuchan, DEFAULT_AUCHAN_MODE, type AuchanCrawlMode } from "../scrapers/crawl/auchan";
import { isFoodSegment } from "../scrapers/crawl/auchan-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { coverageReport, isMeaningfulShortfall } from "../scrapers/crawl/report";
import { formatHttpStats } from "../scrapers/http";

/**
 * The fast catalogue crawl. In practice that now means AUCHAN ONLY.
 *
 *   npm run crawl:all
 *   npm run crawl:all -- --mode=root      # Auchan walks its whole catalogue
 *   npm run crawl:all -- --max-pages=2    # smoke test
 *
 * This used to crawl all three. Continente and Pingo Doce both reach their
 * catalogues through listing grids their robots.txt disallows, so both are now
 * skipped here and print the compliant command instead. Auchan is the only one
 * of the three whose robots.txt ALLOWS grids, which is why it is the only store
 * that can still be crawled in minutes - and, not coincidentally, the only one
 * whose catalogue is 92% sized.
 *
 * The name is kept, and the skips are printed rather than silently dropped, so
 * that a run of this cannot be mistaken for a three-store crawl. Renaming it to
 * `crawl:auchan` would collide with the existing single-store script and would
 * quietly change what a scheduler already calls.
 *
 * Database writes: SQLite takes one writer at a time, so results are queued and
 * saved in turn. Kept because the structure still holds if a store ever regains
 * a fast route.
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

/**
 * Continente is no longer crawled here, for the same reason as Pingo Doce.
 *
 * This script used to call the grid crawler, whose URL Continente's robots.txt
 * disallows on `?cgid` and `&sz`. That route was kept deliberately as a fast
 * option, but calling it from here made it the DEFAULT rather than a choice -
 * which is precisely how a deliberate exception stops being deliberate.
 *
 * The compliant route takes about five hours and does not belong in a run that
 * otherwise finishes in minutes.
 */
function skipContinente() {
  return {
    title: "CONTINENTE - skipped",
    lines: [
      "  The listing grids are disallowed by robots.txt (?cgid, &sz), so there is no fast route.",
      "    npm run crawl:continente:nightly   the catalogue, one product page at a time, ~5 h",
      "    npm run crawl:continente           coverage check against the store's own counts",
    ],
    short: [] as string[],
    total: 0,
  };
}

/**
 * Pingo Doce is no longer crawled here.
 *
 * Its grid crawler broke robots.txt on four separate rules and no longer
 * exists. The compliant route reads one product page at a time and takes about
 * two and a half hours, which does not belong inside a "crawl everything" run
 * that otherwise finishes in minutes.
 *
 * Reported as a skip rather than silently dropped, so a run of this script
 * cannot be mistaken for a three-store crawl.
 */
function skipPingoDoce() {
  return {
    title: "PINGO DOCE - skipped",
    lines: [
      "  The listing grids are disallowed by robots.txt, so there is no fast route.",
      "    npm run crawl:pingodoce:products   the catalogue, one product page at a time, ~2.5 h",
      "    npm run crawl:pingodoce            coverage check against the store's own counts, ~20 s",
    ],
    short: [] as string[],
    total: 0,
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
    `Crawling Auchan [${mode}]${maxPages ? ` (max ${maxPages} pages)` : ""}.` +
      ` Continente and Pingo Doce are skipped - see below.\n`
  );

  const stores = ["Continente", "Pingo Doce", "Auchan"];
  const settled = await Promise.allSettled([
    Promise.resolve(skipContinente()),
    Promise.resolve(skipPingoDoce()),
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
