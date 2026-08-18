import { prisma } from "../lib/db";
import { crawlPingoDoce } from "../scrapers/crawl/pingodoce";
import { PINGO_DOCE_FOOD_CATEGORIES } from "../scrapers/crawl/pingodoce-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";

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

  let grandTotal = 0;
  for (const s of summaries) {
    grandTotal += s.total;
    console.log(
      `  ${s.label.padEnd(30)} ${String(s.total).padStart(5)} products  (${s.created} new, ${s.updated} updated)`
    );
  }
  console.log(`Done: ${grandTotal} products across ${summaries.length} department(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
