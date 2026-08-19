import { prisma } from "../lib/db";
import { crawlAuchan } from "../scrapers/crawl/auchan";
import { isFoodSegment } from "../scrapers/crawl/auchan-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";

/**
 * Crawl Auchan's food catalogue into the CatalogueProduct table.
 *
 *   npm run crawl:auchan                     # whole catalogue via root, food kept
 *   npm run crawl:auchan -- --max-pages=3    # smoke test
 *
 * Auchan is crawled from `cgid=root` (the whole catalogue) and filtered to food
 * by each product's category path. The full segment tally is printed so a
 * wrongly-dropped food department is visible. Listing data only; ean/size null.
 * Idempotent: upserts by (store, storeProductId).
 */
async function main() {
  const args = process.argv.slice(2);
  const maxPagesRaw = args.find((a) => a.startsWith("--max-pages="))?.split("=")[1];
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;

  if (maxPagesRaw && (!Number.isInteger(maxPages) || (maxPages as number) < 1)) {
    console.error(`--max-pages must be a positive integer, got "${maxPagesRaw}"`);
    process.exit(1);
  }

  console.log(
    `Crawling Auchan (root, food-filtered)${maxPages ? ` max ${maxPages} pages` : ""}...`
  );

  const { food, segmentTally, crawled, expected } = await crawlAuchan({ maxPages });
  const summaries = await persistCatalogue("AUCHAN", food);

  // The walk covers the whole catalogue, so completeness is judged against
  // Auchan's own catalogue-wide count - not against any one department, whose
  // size the store never states here.
  if (expected === null) {
    console.log(`\ncatalogue: ${crawled} products walked (store published no count)`);
  } else {
    const short = crawled < expected && maxPages === undefined;
    console.log(
      `\ncatalogue: ${crawled} of ${expected} products walked` +
        (short ? `  SHORT by ${expected - crawled}` : "")
    );
  }

  let grandTotal = 0;
  console.log("\nfood departments kept:");
  for (const s of summaries) {
    grandTotal += s.total;
    console.log(
      `  ${s.label.padEnd(28)} ${String(s.total).padStart(5)}  (${s.created} new, ${s.updated} updated)`
    );
  }

  // Full tally of every top segment seen, so a food department wrongly dropped
  // (or a non-food one wrongly kept) is visible for review.
  console.log("\nall top segments seen:");
  for (const [segment, n] of [...segmentTally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${isFoodSegment(segment) ? "keep" : "drop"}  ${String(n).padStart(6)}  ${segment}`);
  }

  console.log(`\nDone: ${grandTotal} food products across ${summaries.length} department(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
