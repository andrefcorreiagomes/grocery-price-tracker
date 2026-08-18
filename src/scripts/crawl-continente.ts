import { prisma } from "../lib/db";
import { crawlContinente } from "../scrapers/crawl/continente";
import { CONTINENTE_FOOD_CATEGORIES } from "../scrapers/crawl/continente-categories";

/**
 * Crawl Continente's food catalogue into the CatalogueProduct table.
 *
 *   npm run crawl:continente                       # all food sections (~19k, ~540 requests)
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

  let grandTotal = 0;
  for (const { category, products } of results) {
    let created = 0;
    let updated = 0;
    for (const p of products) {
      const existing = await prisma.catalogueProduct.findUnique({
        where: { store_storeProductId: { store: "CONTINENTE", storeProductId: p.id } },
        select: { id: true },
      });
      await prisma.catalogueProduct.upsert({
        where: { store_storeProductId: { store: "CONTINENTE", storeProductId: p.id } },
        create: {
          store: "CONTINENTE",
          storeProductId: p.id,
          name: p.name,
          brand: p.brand,
          categoryPath: p.category || null,
          price: p.price,
          url: p.url,
        },
        update: {
          name: p.name,
          brand: p.brand,
          categoryPath: p.category || null,
          price: p.price,
          url: p.url,
          lastSeenAt: new Date(),
        },
      });
      if (existing) updated++;
      else created++;
    }
    grandTotal += products.length;
    console.log(
      `  ${category.label.padEnd(22)} ${String(products.length).padStart(5)} products  (${created} new, ${updated} updated)`
    );
  }
  console.log(`Done: ${grandTotal} products across ${results.length} section(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
