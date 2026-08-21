import { prisma } from "../lib/db";
import { crawlContinente } from "../scrapers/crawl/continente";
import {
  CONTINENTE_FOOD_CATEGORIES,
  auditCategories,
  discoverCategories,
  type CategoryAudit,
} from "../scrapers/crawl/continente-categories";
import { persistCatalogue } from "../scrapers/crawl/persist";
import { coverageReport } from "../scrapers/crawl/report";
import { formatHttpStats, httpStats } from "../scrapers/http";
import {
  compareWithBaseline,
  compareWithPrevious,
  previousRunFor,
  recordRun,
  rollingBaseline,
} from "../scrapers/crawl/history";
import { buildDailyReport, buildFailureReport, snapshotBefore } from "../scrapers/crawl/daily-report";
import { renderReport, writeReport } from "../scrapers/crawl/render-report";

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
const priceLine = (p: { unchanged: number; changed: number; opened: number; skipped: number }) =>
  `prices: ${p.changed} changed, ${p.unchanged} held, ${p.opened} new` +
  (p.skipped ? `, ${p.skipped} without a price` : "");

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

  // What does Continente actually publish today? A category that vanished or was
  // renamed already fails loudly - its grid answers HTTP 500 and the crawl
  // throws - but a NEW food department would otherwise be invisible, because we
  // would simply never ask for it.
  let audit: CategoryAudit | null = null;
  let published = new Map<string, number>();
  try {
    const discovered = await discoverCategories();
    audit = auditCategories(discovered);
    published = new Map(discovered.map((c) => [c.label, c.hitCount]));
  } catch (error) {
    console.error(`could not read the published category tree: ${(error as Error).message}`);
  }

  // The previous run has to be read BEFORE this one is recorded, and the
  // catalogue has to be read before the crawl saves over it: name, category,
  // price and lastSeenAt are all overwritten in place, so this is the only
  // moment their previous values still exist.
  const previousRun = await previousRunFor("CONTINENTE");
  const baseline = await rollingBaseline("CONTINENTE");
  const before = await snapshotBefore("CONTINENTE");

  let results;
  let saved;
  try {
    results = await crawlContinente({ categories, maxPages });
    saved = await persistCatalogue("CONTINENTE", results);
  } catch (error) {
    // The run that breaks is the one most worth a written record, and it used to
    // be the only one that produced none.
    const failure = buildFailureReport({
      store: "CONTINENTE",
      seenAt: new Date(),
      error,
      audit,
      http: httpStats(),
      baseline: { runs: baseline.runs, since: baseline.since },
    });
    const where = await writeReport(failure);
    console.error(`
${renderReport(failure)}`);
    console.error(`
report written to ${where.text}`);
    process.exitCode = 1;
    return;
  }
  const { summaries, prices, seenAt } = saved;

  // The store's own count is the yardstick: everything it lists should be either
  // collected here or already collected by an earlier section.
  const { lines, total, short } = coverageReport(results, summaries, 22, maxPages !== undefined);
  for (const line of lines) console.log(line);
  console.log(`\n${priceLine(prices)}`);

  // A partial run is not comparable to a full one by construction, so it is
  // neither recorded as history nor reported on - recording it would poison the
  // next comparison.
  const partial = maxPages !== undefined || cgid !== undefined;
  const sections = results.map((r, i) => ({
    cgid: r.category.cgid,
    label: r.category.label,
    collected: summaries[i]?.total ?? r.products.length,
    expected: r.expected,
  }));

  if (partial) {
    console.log("\nrequests:");
    for (const line of formatHttpStats()) console.log(line);
    console.log(`\nDone: ${total} products across ${summaries.length} section(s).`);
    console.log("(partial run: no report written, no history recorded)");
    return;
  }

  // Both comparisons: against the run before (catches a sudden break) and
  // against the rolling median (catches a slow leak that never trips a
  // day-over-day threshold).
  const drift = [
    ...(await compareWithPrevious("CONTINENTE", total, sections)),
    ...compareWithBaseline(baseline, total, sections),
  ];
  const http = httpStats();

  const report = await buildDailyReport({
    store: "CONTINENTE",
    seenAt,
    before,
    results,
    audit: audit ?? { unknown: [], missing: [] },
    publishedCounts: published,
    prices,
    http,
    drift,
    shortSections: short,
    baseline: { runs: baseline.runs, since: baseline.since },
    previousRun,
  });

  const written = await writeReport(report);
  console.log(`\n${renderReport(report)}`);
  console.log(`\nreport written to ${written.text} and ${written.json}`);

  await recordRun("CONTINENTE", total, sections, {
    requests: http.reduce((n, h) => n + h.requests, 0),
    bytes: http.reduce((n, h) => n + h.bytes, 0),
    fetchMs: http.reduce((n, h) => n + h.fetchMs, 0),
    retries: http.reduce((n, h) => n + h.retries, 0),
  }, seenAt);

  // The verdict is the machine-readable half: a scheduler should not have to
  // read prose to find out that a crawl went wrong.
  if (report.verdict === "FAIL") process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
