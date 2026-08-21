import { prisma } from "../lib/db";
import { crawlAuchan, DEFAULT_AUCHAN_MODE, type AuchanCrawlMode } from "../scrapers/crawl/auchan";
import { isFoodSegment } from "../scrapers/crawl/auchan-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { coverageReport, isMeaningfulShortfall } from "../scrapers/crawl/report";
import { formatHttpStats } from "../scrapers/http";

/**
 * Crawl Auchan's food catalogue into the CatalogueProduct table.
 *
 *   npm run crawl:auchan                        # food departments only (~23 min)
 *   npm run crawl:auchan -- --mode=root         # whole catalogue (~70 min)
 *   npm run crawl:auchan -- --max-pages=2       # smoke test
 *
 * Auchan serves ~13 products/sec however it is asked, so the mode is the only
 * thing that changes how long a crawl takes: `departments` fetches 17,764 food
 * products, `root` fetches all 54,859 and discards the non-food. Running
 * `--mode=root` after a departments run is the completeness audit - both upsert
 * by (store, storeProductId), so whatever root adds is what departments missed.
 *
 * Listing data only; ean/size stay null for enrichment. Idempotent.
 */
const priceLine = (p: { unchanged: number; changed: number; opened: number; skipped: number }) =>
  `prices: ${p.changed} changed, ${p.unchanged} held, ${p.opened} new` +
  (p.skipped ? `, ${p.skipped} without a price` : "");

function parseMode(raw: string | undefined): AuchanCrawlMode {
  if (raw === undefined) return DEFAULT_AUCHAN_MODE;
  if (raw === "root" || raw === "departments") return raw;
  console.error(`--mode must be "root" or "departments", got "${raw}"`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const maxPagesRaw = args.find((a) => a.startsWith("--max-pages="))?.split("=")[1];
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;
  const mode = parseMode(args.find((a) => a.startsWith("--mode="))?.split("=")[1]);

  if (maxPagesRaw && (!Number.isInteger(maxPages) || (maxPages as number) < 1)) {
    console.error(`--max-pages must be a positive integer, got "${maxPagesRaw}"`);
    process.exit(1);
  }

  console.log(
    `Crawling Auchan [${mode}]${maxPages ? ` max ${maxPages} pages/category` : ""}...`
  );

  const { food, segmentTally, segmentSamples, crawled, walks, failedDepartments } =
    await crawlAuchan({ mode, maxPages });
  const { summaries, prices } = await persistCatalogue("AUCHAN", food);

  const { lines, total } = coverageReport(food, summaries, 28, maxPages !== undefined);

  console.log("\nfood departments kept:");
  for (const line of lines) console.log(line);

  // Coverage is judged per category walked, against the count each publishes for
  // itself - not per food department, whose size Auchan never states.
  const short: string[] = [];
  console.log("\ncategories walked:");
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
    console.log(
      `  ${w.label.padEnd(26)} ${String(w.fetched).padStart(6)} fetched` +
        `, ${String(w.added).padStart(6)} new to this run${coverage}`
    );
  }

  // Every top segment seen, with examples, so a food department wrongly dropped
  // by the whitelist is visible rather than lost silently.
  console.log("\nall top segments seen:");
  for (const [segment, n] of [...segmentTally].sort((a, b) => b[1] - a[1])) {
    const keep = isFoodSegment(segment);
    console.log(`  ${keep ? "keep" : "drop"}  ${String(n).padStart(6)}  ${segment}`);
    if (!keep) {
      for (const sample of segmentSamples.get(segment) ?? []) {
        console.log(`            ${sample.slice(0, 68)}`);
      }
    }
  }

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);

  console.log(
    `\n${priceLine(prices)}` +
      `\nDone: ${total} food products across ${summaries.length} department(s), ` +
      `${crawled} products walked.`
  );
  if (failedDepartments.length > 0) {
    console.log(`\nWARNING: could not read the id for: ${failedDepartments.join(", ")}`);
    process.exitCode = 1;
  }
  if (short.length > 0) {
    console.log(`\nWARNING: came up short: ${short.join(", ")}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
