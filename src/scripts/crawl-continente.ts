import { prisma } from "../lib/db";
import { crawlContinente } from "../scrapers/crawl/continente";
import { CONTINENTE_FOOD_CATEGORIES } from "../scrapers/crawl/continente-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { coverageReport } from "../scrapers/crawl/report";
import { formatHttpStats } from "../scrapers/http";

/**
 * Crawl Continente's food catalogue into the CatalogueProduct table.
 *
 *   npm run crawl:continente                       # all food sections (~19k)
 *   npm run crawl:continente -- --category=laticinios
 *   npm run crawl:continente -- --category=laticinios --max-pages=3   # smoke test
 *
 * Listing data only - name, brand, price, store category, url. Barcode and size
 * are left null; they come later from product-page enrichment. Idempotent:
 * upserts by (store, storeProductId), so re-running refreshes prices rather than
 * duplicating.
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
    ? CONTINENTE_FOOD_CATEGORIES.filter((c) => c.cgid === cgid)
    : undefined;
  if (cgid && (!categories || categories.length === 0)) {
    console.error(
      `unknown category "${cgid}". known: ${CONTINENTE_FOOD_CATEGORIES.map((c) => c.cgid).join(", ")}`
    );
    process.exit(1);
  }

  console.log(
    `Crawling Continente ${cgid ? `[${cgid}]` : "(all food sections)"}` +
      `${maxPages ? ` max ${maxPages} pages/category` : ""}...`
  );

  const results = await crawlContinente({ categories, maxPages });
  const summaries = await persistCatalogue("CONTINENTE", results);

  // The store's own count is the yardstick: everything it lists should be either
  // collected here or already collected by an earlier section.
  const { lines, total, short } = coverageReport(results, summaries, 22, maxPages !== undefined);
  for (const line of lines) console.log(line);

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);

  console.log(`Done: ${total} products across ${summaries.length} section(s).`);
  if (short.length > 0) {
    console.log(`\nWARNING: ${short.length} section(s) came up short: ${short.join(", ")}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
