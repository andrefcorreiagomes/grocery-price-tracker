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
import { buildDailyReport, snapshotBefore } from "../scrapers/crawl/daily-report";
import {
  compareWithBaseline,
  compareWithPrevious,
  previousRunFor,
  recordRun,
  rollingBaseline,
} from "../scrapers/crawl/history";
import { renderReport, writeReport } from "../scrapers/crawl/render-report";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { formatHttpStats, httpStats } from "../scrapers/http";

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

  // A run with no --limit walks the whole catalogue, so it can answer what
  // CHANGED - which needs the previous values, read before the crawl saves over
  // them. A limited run cannot, and does not pay for these reads.
  const complete = limit === undefined;
  const previousRun = complete ? await previousRunFor("CONTINENTE") : null;
  const baseline = complete ? await rollingBaseline("CONTINENTE") : null;
  const before = complete ? await snapshotBefore("CONTINENTE") : null;

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

  // A complete pass gets the full report - change detection and all - with the
  // rotation figures attached, because both are true of it. A limited pass gets
  // only what it can honestly claim.
  const rotationOnly = await buildRotationReport({
    store: "CONTINENTE",
    complete,
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

  let report = rotationOnly;
  if (complete && before && baseline) {
    const drift = [
      ...(await compareWithPrevious("CONTINENTE", total, [])),
      ...compareWithBaseline(baseline, total, []),
    ];
    const full = await buildDailyReport({
      store: "CONTINENTE",
      seenAt,
      before,
      results: crawl.results,
      audit: { unknown: [], missing: [] },
      publishedCounts,
      prices,
      http: httpStats(),
      drift,
      shortSections: [],
      sitemapSlugs: [],
      sitemapUnknown: [],
      baseline: { runs: baseline.runs, since: baseline.since },
      previousRun,
    });
    report = { ...full, rotation: rotationOnly.rotation };
    await recordRun("CONTINENTE", total, [], undefined, seenAt);
  }

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
