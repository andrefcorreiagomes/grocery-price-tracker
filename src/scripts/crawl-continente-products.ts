import { prisma } from "../lib/db";
import {
  discoverProductUrls,
  fetchProducts,
  type ProductTarget,
} from "../scrapers/crawl/continente-products";
import { CONTINENTE_FOOD_SECTIONS } from "../scrapers/crawl/continente-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { formatHttpStats } from "../scrapers/http";

/**
 * Crawl Continente ONE PRODUCT PAGE AT A TIME - the route its robots.txt allows.
 *
 *   npm run crawl:continente:products -- --limit=500   # refresh the 500 stalest
 *   npm run crawl:continente:products                  # the whole food catalogue
 *   npm run crawl:continente:products -- --discover    # also look for products we have never seen
 *
 * The counterpart to `crawl:continente`, which is ~30x faster and uses listing
 * parameters that robots.txt disallows. Both exist deliberately; pick one
 * knowingly.
 *
 * Targets are ordered STALEST FIRST, so running with a `--limit` is a rotation
 * rather than an arbitrary subset: whatever budget you give it, the least
 * recently refreshed products go first and the catalogue is covered in a
 * predictable number of runs. 17,000 products at 2,400 a day is a complete pass
 * a week, with nothing left indefinitely stale.
 *
 * Unlike the fast crawler this also captures barcode and package size, so it
 * doubles as enrichment.
 */
async function main() {
  const args = process.argv.slice(2);
  const limitRaw = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const discover = args.includes("--discover");

  if (limitRaw && (!Number.isInteger(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive integer, got "${limitRaw}"`);
    process.exit(1);
  }

  // Products we already know, stalest first. `lastSeenAt` is the right key: it
  // is what every crawl updates, so it means "how long since anything confirmed
  // this product still exists at this price".
  const known = await prisma.catalogueProduct.findMany({
    where: { store: "CONTINENTE" },
    select: { storeProductId: true, url: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "asc" },
  });

  const targets: ProductTarget[] = known.map((k) => ({
    storeProductId: k.storeProductId,
    url: k.url,
  }));

  if (discover) {
    // The sitemap is a superset: it carries products we have never seen, about
    // half of which are delisted. Appended AFTER the known ones so a limited
    // run spends its budget on refreshing real products first.
    const published = await discoverProductUrls();
    const seen = new Set(known.map((k) => k.storeProductId));
    let added = 0;
    for (const [id, url] of published) {
      if (seen.has(id)) continue;
      targets.push({ storeProductId: id, url });
      added++;
    }
    console.log(`sitemap: ${published.size.toLocaleString()} products published, ${added.toLocaleString()} we have never seen`);
  }

  const slice = limit ? targets.slice(0, limit) : targets;
  console.log(
    `Fetching ${slice.length.toLocaleString()} Continente product pages` +
      `${limit ? ` (of ${targets.length.toLocaleString()} candidates, stalest first)` : ""}...`
  );
  if (!limit && slice.length > 2000) {
    console.log(`  at one request per second this is about ${(slice.length / 3600).toFixed(1)} hours`);
  }

  const started = Date.now();
  const crawl = await fetchProducts(slice, {
    isFood: (path) => CONTINENTE_FOOD_SECTIONS.has((path ?? "").split("/")[0].trim()),
    onProgress: (p) =>
      console.log(`  ${p.page.toLocaleString()} pages, ${p.collected.toLocaleString()} products`),
  });

  const { summaries, prices } = await persistCatalogue("CONTINENTE", crawl.results);

  console.log(`\nfood kept, by section:`);
  let total = 0;
  for (const s of summaries) {
    total += s.total;
    console.log(`  ${s.label.padEnd(24)} ${String(s.total).padStart(6)}  (${s.created} new, ${s.updated} updated)`);
  }

  console.log(
    `\n${crawl.fetched.toLocaleString()} pages returned a product` +
      `, ${crawl.dead.toLocaleString()} were dead (delisted)` +
      `, ${crawl.nonFood.toLocaleString()} were not food`
  );
  for (const f of crawl.failures) console.log(`    ${f}`);

  console.log(`\nprices: ${prices.changed} changed, ${prices.unchanged} held, ${prices.opened} newly tracked`);
  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);
  console.log(
    `\nDone in ${((Date.now() - started) / 60000).toFixed(1)} min: ${total.toLocaleString()} food products refreshed.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
