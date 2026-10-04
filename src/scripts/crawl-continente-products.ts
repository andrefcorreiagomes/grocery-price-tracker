import { prisma } from "../lib/db";
import {
  discoverProductUrls,
  fetchProducts,
  type ProductTarget,
} from "../scrapers/crawl/continente-products";
import {
  CONTINENTE_FOOD_SECTIONS,
  fetchPublishedCounts,
} from "../scrapers/crawl/continente-categories";
import { buildRotationReport } from "../scrapers/crawl/rotation-report";
import { renderReport, writeReport } from "../scrapers/crawl/render-report";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { formatHttpStats, httpStats, requireCrawlerContact } from "../scrapers/http";

/** About 35 minutes of pages at one request per second. */
const MAX_LIMIT = 2_000;

/**
 * Crawl a SLICE of Continente, one product page at a time - the route its
 * robots.txt allows.
 *
 *   npm run crawl:continente:products -- --limit=500              # refresh the 500 stalest
 *   npm run crawl:continente:products -- --limit=500 --discover   # then products never seen
 *
 * For the whole catalogue use `npm run crawl:continente:nightly`.
 *
 * LIMITED RUNS ONLY. This command keeps every page in memory and saves once, at
 * the end. On 3 October 2026 it was started for the whole catalogue - about
 * 5 hours, or about 30 with --discover - when a failure in the last hour would
 * have lost everything before it. The nightly command saves every 500 products.
 * So this one refuses to run without --limit, and refuses a limit above
 * MAX_LIMIT, the most that is acceptable to lose.
 *
 * Targets are ordered STALEST FIRST, so running with a `--limit` is a rotation
 * rather than an arbitrary subset: whatever budget you give it, the least
 * recently refreshed products go first and the catalogue is covered in a
 * predictable number of runs. 17,000 products at 2,400 a day is a complete pass
 * a week, with nothing left indefinitely stale.
 *
 * Unlike a listing page, a product page also gives the barcode and package
 * size, so this doubles as enrichment.
 */
async function main() {
  requireCrawlerContact();
  const args = process.argv.slice(2);
  const limitRaw = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const discover = args.includes("--discover");

  if (limit === undefined || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    console.error(
      [
        limitRaw === undefined
          ? "This command needs --limit, e.g. --limit=500."
          : `--limit must be a whole number from 1 to ${MAX_LIMIT.toLocaleString()}, got "${limitRaw}".`,
        "",
        "It saves only once, at the end, so a long run that fails loses everything.",
        "For the whole catalogue use:  npm run crawl:continente:nightly",
        "which saves every 500 products.",
      ].join("\n")
    );
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
    const { urls: published } = await discoverProductUrls();
    const seen = new Set(known.map((k) => k.storeProductId));
    let added = 0;
    for (const [id, url] of published) {
      if (seen.has(id)) continue;
      targets.push({ storeProductId: id, url });
      added++;
    }
    console.log(`sitemap: ${published.size.toLocaleString()} products published, ${added.toLocaleString()} we have never seen`);
  }

  const slice = targets.slice(0, limit);
  console.log(
    `Fetching ${slice.length.toLocaleString()} Continente product pages` +
      ` (of ${targets.length.toLocaleString()} candidates, stalest first)...`
  );

  const started = Date.now();
  const crawl = await fetchProducts(slice, {
    isFood: (path) => CONTINENTE_FOOD_SECTIONS.has((path ?? "").split("/")[0].trim()),
    onProgress: (p) =>
      console.log(`  ${p.page.toLocaleString()} pages, ${p.collected.toLocaleString()} products`),
  });

  // Which products are new to us, captured before saving - afterwards they are
  // indistinguishable from the rest.
  const knownIds = new Set(known.map((k) => k.storeProductId));
  const newProducts = crawl.results
    .flatMap((r) => r.products)
    .filter((p) => !knownIds.has(p.id))
    .map((p) => ({ storeProductId: p.id, name: p.name }));

  const { summaries, prices, seenAt } = await persistCatalogue("CONTINENTE", crawl.results);

  console.log(`\nfood kept, by section:`);
  let total = 0;
  for (const s of summaries) {
    total += s.total;
    console.log(`  ${s.label.padEnd(24)} ${String(s.total).padStart(6)}  (${s.created} new, ${s.updated} updated)`);
  }

  console.log(
    `\n${crawl.fetched.toLocaleString()} pages returned a product` +
      `, ${crawl.dead.length.toLocaleString()} were dead (delisted)` +
      `, ${crawl.nonFood.length.toLocaleString()} were not food` +
      `, ${crawl.unreachable.length.toLocaleString()} could not be reached`
  );
  for (const f of crawl.dead.slice(0, 10)) console.log(`    ${f.storeProductId}: ${f.reason}`);

  console.log(`\nprices: ${prices.changed} changed, ${prices.unchanged} held, ${prices.opened} newly tracked`);
  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);
  console.log(
    `\nDone in ${((Date.now() - started) / 60000).toFixed(1)} min: ${total.toLocaleString()} food products refreshed.`
  );

  // Six allowed requests: each section's landing page publishes its own count,
  // which is how a crawl that never touches a listing grid can still ask whether
  // our catalogue is missing products entirely - a different question from
  // whether the prices we hold are fresh.
  let publishedCounts = new Map<string, number>();
  try {
    publishedCounts = await fetchPublishedCounts();
  } catch (error) {
    console.error(`could not read the published section counts: ${(error as Error).message}`);
  }

  // A slice cannot say what changed across the catalogue, so it gets the
  // rotation report only; the full report belongs to the nightly command.
  const report = await buildRotationReport({
    store: "CONTINENTE",
    complete: false,
    seenAt,
    refreshed: total,
    dead: crawl.dead.length,
    deadSamples: crawl.dead.map((d) => ({
      storeProductId: d.storeProductId,
      name: d.reason.slice(0, 60),
    })),
    nonFood: crawl.nonFood.length,
    prices,
    http: httpStats(),
    publishedCounts,
    newProducts,
    newCount: newProducts.length,
  });

  const explain = !args.includes("--brief");
  const written = await writeReport(report, { explain });
  console.log(`\n${renderReport(report, { explain })}`);
  console.log(`\nreport written to ${written.text} and ${written.json}`);
  if (report.verdict === "FAIL") process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
