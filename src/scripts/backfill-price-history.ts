import { prisma } from "../lib/db";
import { backfillPriceHistory } from "../scrapers/crawl/price-history";

/**
 * Open a price period for any catalogue product that has a price but no open
 * period.
 *
 *   npm run backfill:prices
 *
 * Run once when the price history is introduced, so the prices already sitting
 * in CatalogueProduct are kept rather than being recorded only if each product
 * survives to the next crawl. Idempotent, so it is also the repair for a product
 * that somehow ends up with no open period.
 */
async function main() {
  const { opened, skipped } = await backfillPriceHistory();
  console.log(`opened ${opened} price period(s); ${skipped} product(s) already had one.`);
  console.log(`CataloguePrice rows: ${await prisma.cataloguePrice.count()}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
