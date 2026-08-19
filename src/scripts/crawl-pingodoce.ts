import { prisma } from "../lib/db";
import { crawlPingoDoce } from "../scrapers/crawl/pingodoce";
import { PINGO_DOCE_FOOD_CATEGORIES } from "../scrapers/crawl/pingodoce-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { coverageReport } from "../scrapers/crawl/report";
import { formatHttpStats } from "../scrapers/http";

/**
 * Crawl Pingo Doce's food catalogue into the CatalogueProduct table.
 *
 *   npm run crawl:pingodoce                              # all food departments
 *   npm run crawl:pingodoce -- --category=ec_mercearia_1300
 *   npm run crawl:pingodoce -- --category=ec_mercearia_1300 --max-pages=1  # smoke test
 *
 * Listing data only - name, brand, price, store category, url. Pingo Doce
 * publishes no barcode, so ean stays null; size also comes later from
 * enrichment. Idempotent: upserts by (store, storeProductId).
 */
async function main() {
  const args = process.argv.slice(2);
  const cgid = args.find((a) => a.startsWith("--category="))?.split("=")[1];
  const maxPagesRaw = args.find((a) => a.startsWith("--max-pages="))?.split("=")[1];
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;

  if (maxPagesRaw && (!Number.isInteger(maxPages) || (maxPages as number) < 1)) {
    console.error(`--max-pages must be a positive integer, got "${maxPagesRaw}"`);
    process.exit(1);
  }

  const categories = cgid
    ? PINGO_DOCE_FOOD_CATEGORIES.filter((c) => c.cgid === cgid)
    : undefined;
  if (cgid && (!categories || categories.length === 0)) {
    console.error(
      `unknown category "${cgid}". known: ${PINGO_DOCE_FOOD_CATEGORIES.map((c) => c.cgid).join(", ")}`
    );
    process.exit(1);
  }

  console.log(
    `Crawling Pingo Doce ${cgid ? `[${cgid}]` : "(all food departments)"}` +
      `${maxPages ? ` max ${maxPages} pages/category` : ""}...`
  );

  const results = await crawlPingoDoce({ categories, maxPages });
  const summaries = await persistCatalogue("PINGO_DOCE", results);

  // The store's own count is the yardstick: everything it lists should be either
  // collected here or already collected by an earlier department.
  const { lines, total, short } = coverageReport(results, summaries, 30, maxPages !== undefined);
  for (const line of lines) console.log(line);

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);

  console.log(`Done: ${total} products across ${summaries.length} department(s).`);
  if (short.length > 0) {
    console.log(`\nWARNING: ${short.length} department(s) came up short: ${short.join(", ")}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
