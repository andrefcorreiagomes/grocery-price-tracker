import { prisma } from "../lib/db";
import { discoverPingoDoceProducts } from "../scrapers/crawl/pingodoce-sitemap";
import { fetchPingoDoceProducts } from "../scrapers/crawl/pingodoce-products";
import type { PingoDoceProductUrl } from "../scrapers/crawl/pingodoce-sitemap";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { formatHttpStats } from "../scrapers/http";

/**
 * Crawl Pingo Doce ONE PRODUCT PAGE AT A TIME - the route its robots.txt allows.
 *
 *   npm run crawl:pingodoce:products -- --dry              # sitemap only, no product fetches
 *   npm run crawl:pingodoce:products -- --limit=200        # a slice, stalest first
 *   npm run crawl:pingodoce:products -- --new              # only ids we have never seen
 *   npm run crawl:pingodoce:products                       # the whole food catalogue, ~2.5 h
 *
 * There is a second, faster Pingo Doce crawler (`npm run crawl:pingodoce`) that
 * walks the listing grids. It is DISALLOWED by robots.txt - four separate rules
 * - and now refuses to run. This is the replacement, and it returns more per
 * product: the pack size, which is the one thing standing between Pingo Doce
 * and a per-kilo comparison.
 *
 * Resumable by construction. `--limit` takes the stalest slice by
 * `lastCheckedAt`, so repeated partial runs march deterministically through the
 * catalogue instead of re-reading the front of it.
 */

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}
function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

const pct = (n: number, of: number) => (of === 0 ? "0%" : `${((n / of) * 100).toFixed(1)}%`);

async function main() {
  const limitRaw = arg("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isInteger(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive integer, got "${limitRaw}"`);
    process.exit(1);
  }
  const dry = flag("dry");
  const onlyNew = flag("new");

  console.log("Reading Pingo Doce's sitemap...");
  const sitemap = await discoverPingoDoceProducts();

  for (const file of sitemap.perFile) {
    console.log(`  ${file.url.split("/").pop()}: ${file.entries} entries`);
  }
  console.log(
    `\n  food products:     ${sitemap.food.length}\n` +
      `  non-food skipped:  ${sitemap.nonFood} (never fetched)\n` +
      `  of those, from mixed aisles: ${sitemap.fromMixed} (promotions, seasonal, own-brand -\n` +
      `                               fetched because their URL cannot say what they are)` +
      (sitemap.unfiled.length > 0
        ? `\n  unfiled skipped:   ${sitemap.unfiled.length} (no department in the URL)`
        : "")
  );
  if (sitemap.unparseable > 0) {
    console.log(`\n  WARNING: ${sitemap.unparseable} URL(s) yielded no product id:`);
    for (const s of sitemap.unparseableSamples) console.log(`    ${s}`);
  }
  if (sitemap.unknownSections.size > 0) {
    // A department we have never seen is products we would never crawl. Loud on
    // purpose.
    console.log(`\n  WARNING: ${sitemap.unknownSections.size} unknown section(s) - add them to PINGO_DOCE_SECTIONS:`);
    for (const [section, count] of sitemap.unknownSections) console.log(`    ${section}: ${count} product(s)`);
  }

  // What is new, and what we already hold. Reported before any fetching so a
  // --dry run answers "is this worth doing" on its own.
  const known = new Map(
    (
      await prisma.catalogueProduct.findMany({
        where: { store: "PINGO_DOCE" },
        select: { storeProductId: true, lastCheckedAt: true, packageSize: true },
      })
    ).map((r) => [r.storeProductId, r])
  );
  const fresh = sitemap.food.filter((p) => !known.has(p.storeProductId));
  const sizedAlready = [...known.values()].filter((r) => r.packageSize !== null).length;
  console.log(
    `\n  in the catalogue already: ${sitemap.food.length - fresh.length}\n` +
      `  never seen before:        ${fresh.length}\n` +
      `  of ${known.size} stored rows, ${sizedAlready} carry a pack size (${pct(sizedAlready, known.size)})`
  );

  let targets: PingoDoceProductUrl[] = onlyNew ? fresh : sitemap.food;
  if (!onlyNew) {
    // Stalest first, new products ahead of everything: a never-checked row has
    // no `lastCheckedAt`, and it is the row we know least about.
    targets = [...targets].sort((a, b) => {
      const ta = known.get(a.storeProductId)?.lastCheckedAt?.getTime() ?? -1;
      const tb = known.get(b.storeProductId)?.lastCheckedAt?.getTime() ?? -1;
      return ta - tb;
    });
  }
  if (limit !== undefined) targets = targets.slice(0, limit);

  console.log(
    `\n${dry ? "Would fetch" : "Fetching"} ${targets.length} product page(s)` +
      ` ~ ${(targets.length / 3600).toFixed(1)} h at 1 request/second.`
  );
  if (dry) {
    console.log("\n--dry: stopping before any product page is requested.");
    return;
  }

  const writer = await openCatalogueWriter("PINGO_DOCE");
  const started = Date.now();

  const crawl = await fetchPingoDoceProducts(targets, {
    onBatch: (products) => writer.save(products, "product pages"),
    onProgress: (p) => {
      const rate = p.page / ((Date.now() - started) / 1000);
      const left = (targets.length - p.page) / rate;
      console.log(
        `  ${p.page}/${targets.length} attempted, ${p.collected} fetched` +
          ` - ~${(left / 60).toFixed(0)} min left`
      );
    },
  });

  const summary = writer.finish();

  console.log("\nby department:");
  for (const r of crawl.results.sort((a, b) => b.products.length - a.products.length)) {
    console.log(`  ${r.category.label.padEnd(32)} ${String(r.products.length).padStart(5)}`);
  }

  console.log(
    `\nfetched ${crawl.fetched}/${targets.length}` +
      `\n  with a pack size: ${crawl.withSize} (${pct(crawl.withSize, crawl.fetched)})` +
      `\n  listed, no price: ${crawl.unpriced.length}` +
      `\n  gone (404/410):   ${crawl.dead.length}` +
      `\n  unreachable:      ${crawl.unreachable.length}`
  );
  if (crawl.unreachable.length > 0) {
    console.log("  a sample of the unreachable:");
    for (const u of crawl.unreachable.slice(0, 5)) console.log(`    ${u.storeProductId}: ${u.reason}`);
  }

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);

  console.log(
    `\nprices: ${summary.prices.changed} changed, ${summary.prices.unchanged} held,` +
      ` ${summary.prices.opened} new, ${summary.prices.skipped} without a price`
  );
  const created = summary.summaries.reduce((n, s) => n + s.created, 0);
  const updated = summary.summaries.reduce((n, s) => n + s.updated, 0);
  console.log(`Done: ${created} product(s) created, ${updated} updated.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
