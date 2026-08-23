import { prisma } from "../lib/db";
import { crawlAuchan, type AuchanCrawlMode } from "../scrapers/crawl/auchan";
import { isFoodSegment } from "../scrapers/crawl/auchan-categories";
import { scrapeAuchan } from "../scrapers/auchan";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { buildRotationReport } from "../scrapers/crawl/rotation-report";
import { recordDead, touchChecked } from "../scrapers/crawl/product-checks";
import { catalogueSizes, compareSizes, previousSizes } from "../scrapers/crawl/catalogue-size";
import { churnCatastropheReason, isPriceChurnStorm } from "../scrapers/crawl/reidentification";
import {
  compareSegments,
  incompleteWalkReasons,
  isEmptyCategoryStorm,
  isTileYieldCollapse,
  isTruncatedWalk,
  isUnderCollectedWalk,
  shouldConfirmAbsences,
  tileHealthReasons,
  underCollectedReason,
  type SegmentCount,
} from "../scrapers/crawl/auchan-health";
import {
  compareWithBaseline,
  compareWithPrevious,
  recordRun,
  rollingBaseline,
  type RunSection,
} from "../scrapers/crawl/history";
import { writeCrashReport } from "../scrapers/crawl/crash-report";
import { escalate, renderReport, writeReport } from "../scrapers/crawl/render-report";
import type { DailyReport, GridHealthExtras, ProductNote } from "../scrapers/crawl/daily-report";
import { formatHttpStats, HttpError, httpStats, wireBytesOf } from "../scrapers/http";

/**
 * The nightly Auchan run: the one command a scheduler calls.
 *
 *   npm run crawl:auchan:nightly
 *   npm run crawl:auchan:nightly -- --max-pages=2   # a small smoke test
 *
 * Three phases, because Auchan permits listing grids and Continente does not, so
 * one walk does the work Continente needs three separate phases for:
 *
 *   1. walk the catalogue (root)   ~275 requests   everything, with prices and categories
 *   2. confirm the missing         one per missing  is an absent product actually gone
 *   3. report                      none            what changed, and is anything wrong
 *
 * root mode, always: `departments` is measured incomplete, and delisting plus
 * every monitor rest on the walk having seen everything. See auchan-health.ts
 * for the guards a grid crawl needs that a sitemap crawl does not.
 */

const STORE = "AUCHAN" as const;
/** The nightly always walks everything; a partial walk cannot police itself. */
const MODE: AuchanCrawlMode = "root";
/** Examples carried per list in the report. */
const SAMPLE = 12;

async function main() {
  const args = process.argv.slice(2);
  const maxPagesRaw = args.find((a) => a.startsWith("--max-pages="))?.split("=")[1];
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;
  if (maxPagesRaw && (!Number.isInteger(maxPages) || (maxPages as number) < 1)) {
    console.error(`--max-pages must be a positive integer, got "${maxPagesRaw}"`);
    process.exit(1);
  }
  const complete = maxPages === undefined;
  const started = Date.now();

  const baseline = await rollingBaseline(STORE);

  // Every id we already hold, read before the walk overwrites anything, so a
  // product saved this run can be told from one we already had.
  const before = new Set(
    (await prisma.catalogueProduct.findMany({ where: { store: STORE }, select: { storeProductId: true } })).map(
      (r) => r.storeProductId
    )
  );

  const writer = await openCatalogueWriter(STORE);
  const seenAt = writer.seenAt;
  const newFood: ProductNote[] = [];

  // ---------------------------------------------------------------- phase 1
  console.log(`phase 1: walking the ${MODE} catalogue${maxPages ? ` (max ${maxPages} pages)` : ""}`);
  if (complete) console.log("  at ~13 products/sec this is about 70 minutes");

  const walk = await crawlAuchan({
    mode: MODE,
    maxPages,
    onProgress: (p) => console.log(`  page ${p.page.toLocaleString()}, ${p.collected.toLocaleString()} walked`),
    onBatch: async (products, segment) => {
      for (const p of products) {
        if (!before.has(p.id)) newFood.push({ storeProductId: p.id, name: p.name });
      }
      await writer.save(products, segment);
    },
  });

  const saved = writer.finish();
  const foodTotal = saved.summaries.reduce((sum, s) => sum + s.total, 0);
  console.log(
    `  ${walk.crawled.toLocaleString()} products walked, ${foodTotal.toLocaleString()} food saved` +
      `, ${walk.tilesKept.toLocaleString()} of ${walk.tilesSeen.toLocaleString()} tiles parsed`
  );

  // ---------------------------------------------------------------- phase 2
  const live = await prisma.catalogueProduct.count({ where: { store: STORE, delistedAt: null } });
  const missing = await prisma.catalogueProduct.findMany({
    where: { store: STORE, delistedAt: null, lastSeenAt: { lt: seenAt } },
    select: { storeProductId: true, url: true, name: true },
  });
  const nameOf = new Map(missing.map((m) => [m.storeProductId, m.name]));

  // The grid guards decide, BEFORE any page is fetched, whether absence is even
  // evidence. A truncated or mis-parsed walk makes the missing set mostly false,
  // so delisting freezes and phase 2 is skipped entirely - fetching a page for
  // thousands of products that are not really gone is exactly what to avoid.
  //
  // A PARTIAL walk is that same problem in its most extreme form, and needs its
  // own gate: every guard below deliberately stands down when `complete` is
  // false, because on a deliberate slice each one would fire. That would leave
  // nothing at all in front of phase 2, and `--max-pages=2` walks ~400 products
  // while the catalogue holds ~17,800 - so phase 2 would fetch a product page
  // for ~17,400 products that were never even looked for. Hours of requests to
  // the store, to confirm absences that are an artefact of the flag.
  const truncated = isTruncatedWalk({
    walked: walk.crawled,
    published: walk.publishedTotal,
    failedDepartments: walk.failedDepartments,
    complete,
  });
  const tileHealth = {
    tilesSeen: walk.tilesSeen,
    tilesKept: walk.tilesKept,
    withoutCategory: walk.withoutCategory,
    complete,
  };
  const emptyStorm = isEmptyCategoryStorm(tileHealth);
  const yieldCollapse = isTileYieldCollapse(tileHealth);
  const underCollected = isUnderCollectedWalk({ missing: missing.length, live, complete });
  const walkFrozen = truncated || emptyStorm || yieldCollapse || underCollected;
  const skipConfirmation = !shouldConfirmAbsences({ complete, walkFrozen });

  const confirmedDead: string[] = [];
  let delisted: string[] = [];
  const unreachable: string[] = [];
  const alive: string[] = [];
  let catastrophe: string | null = null;

  if (skipConfirmation) {
    console.log(
      `\nphase 2: skipped - ${
        complete
          ? "the walk did not see the whole catalogue, so absence is not evidence"
          : `this is a partial walk (--max-pages), so the ${missing.length.toLocaleString()} unseen products were never looked for`
      }`
    );
    // Not even the clock is touched: these products were never actually
    // attempted, and a skipped run should leave no trace that looks like one.
  } else {
    console.log(`\nphase 2: confirming ${missing.length.toLocaleString()} products missing from the walk`);
    for (const m of missing) {
      try {
        await scrapeAuchan(m.url);
        alive.push(m.storeProductId); // the page answered: alive, just absent from the grid
      } catch (error) {
        const gone = error instanceof HttpError && (error.status === 404 || error.status === 410);
        (gone ? confirmedDead : unreachable).push(m.storeProductId);
      }
    }

    // Guard 1: an implausible fraction of the whole catalogue confirmed dead at
    // once is a site fault, not turnover. Freeze delisting so an unattended
    // schedule cannot wipe the catalogue over three such nights.
    catastrophe = churnCatastropheReason({ dead: confirmedDead.length, attempted: live, complete });
    if (catastrophe) {
      console.log(`  !! ${catastrophe}`);
      await touchChecked(STORE, [...confirmedDead, ...unreachable, ...alive], seenAt);
    } else {
      ({ delisted } = await recordDead(STORE, confirmedDead, seenAt));
      await touchChecked(STORE, unreachable, seenAt);
      // Alive but absent: reset the dead counter (it is not dying) but do NOT
      // advance lastSeenAt, so it stays visible as a hole in the walk until the
      // grid picks it up again.
      if (alive.length > 0) {
        await prisma.catalogueProduct.updateMany({
          where: { store: STORE, storeProductId: { in: alive } },
          data: { deadCount: 0, lastCheckedAt: seenAt },
        });
      }
    }
    console.log(
      `  ${confirmedDead.length.toLocaleString()} gone, ${alive.length.toLocaleString()} alive but missing` +
        `, ${unreachable.length.toLocaleString()} unreachable`
    );
  }
  // A partial walk is reported apart from a fired guard: both stop anything
  // being marked gone, but only one of them means something went wrong.
  const delisting: "active" | "frozen" | "partial" = !complete
    ? "partial"
    : walkFrozen || catastrophe !== null
      ? "frozen"
      : "active";

  // ---------------------------------------------------------------- phase 3
  const segmentCounts: SegmentCount[] = [...walk.segmentTally].map(([segment, count]) => ({
    segment,
    count,
    kept: isFoodSegment(segment),
  }));

  // Kept segments become CrawlSection rows, so compareWithPrevious /
  // compareWithBaseline give the run-over-run section drift with no new code.
  const sections: RunSection[] = segmentCounts
    .filter((s) => s.kept)
    .map((s) => ({ cgid: s.segment, label: s.segment, collected: s.count }));

  const previousSegments = await previousSegmentTally(seenAt);
  const segmentDiff = compareSegments(segmentCounts, previousSegments);

  const sizesNow = await catalogueSizes();
  const catalogueByStore = compareSizes(sizesNow, await previousSizes(seenAt));

  const gridHealth: GridHealthExtras = {
    mode: MODE,
    walked: walk.crawled,
    published: walk.publishedTotal,
    delisting,
    tilesSeen: walk.tilesSeen,
    tilesKept: walk.tilesKept,
    withoutCategory: walk.withoutCategory,
    segments: [...segmentCounts].sort((a, b) => b.count - a.count),
    segmentsAppeared: segmentDiff.appeared.map((s) => ({
      segment: s.segment,
      count: s.count,
      samples: walk.segmentSamples.get(s.segment) ?? [],
    })),
    segmentsVanished: segmentDiff.vanished.map((s) => ({ segment: s.segment, count: s.count })),
    confirmedDead: confirmedDead.length,
    delistedNow: delisted.length,
    delistedSamples: delisted.slice(0, SAMPLE).map((id) => ({ storeProductId: id, name: nameOf.get(id) ?? id })),
    unreachable: unreachable.length,
    aliveButMissing: alive.length,
    aliveButMissingSamples: alive.slice(0, SAMPLE).map((id) => ({ storeProductId: id, name: nameOf.get(id) ?? id })),
  };

  const nonFood = segmentCounts.filter((s) => !s.kept).reduce((n, s) => n + s.count, 0);

  let report: DailyReport = await buildRotationReport({
    store: STORE,
    complete,
    seenAt,
    refreshed: foodTotal,
    dead: confirmedDead.length,
    deadSamples: gridHealth.delistedSamples,
    nonFood,
    prices: saved.prices,
    http: httpStats(),
    publishedCounts: new Map(),
    newProducts: newFood.slice(0, SAMPLE),
    newCount: newFood.length,
  });

  const drift = [
    ...(await compareWithPrevious(STORE, foodTotal, sections)),
    ...compareWithBaseline(baseline, foodTotal, sections),
  ];
  // buildRotationReport hardcodes an empty baseline; replace it with the real one
  // so the report does not claim "no previous run" while showing drift against it.
  report = {
    ...report,
    gridHealth,
    catalogueByStore,
    drift,
    baseline: { runs: baseline.runs, since: baseline.since ? baseline.since.toISOString() : null },
  };

  // recordRun writes the CrawlSection rows, so it must run before the next
  // night's compareWithPrevious can read them. Only on a complete walk: a smoke
  // test's partial counts would poison tomorrow's comparison.
  if (complete) {
    const stats = httpStats().reduce(
      (a, h) => ({
        requests: a.requests + h.requests,
        bytes: a.bytes + h.bytes,
        wireBytes: a.wireBytes + (wireBytesOf(h) ?? 0),
        fetchMs: a.fetchMs + h.fetchMs,
        retries: a.retries + h.retries,
      }),
      { requests: 0, bytes: 0, wireBytes: 0, fetchMs: 0, retries: 0 }
    );
    await recordRun(STORE, foodTotal, sections, {
      http: { ...stats, wireBytes: stats.wireBytes || null },
      seenAt,
      catalogueSizes: sizesNow,
      segmentTally: segmentCounts,
      publishedTotal: walk.publishedTotal,
      walkedTotal: walk.crawled,
      tilesSeen: walk.tilesSeen,
      tilesKept: walk.tilesKept,
      emptyCategory: walk.withoutCategory,
    });
  }

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);
  console.log(`\nDone in ${((Date.now() - started) / 60000).toFixed(1)} min.`);

  // --- the verdict ladder, most serious first (each escalate prepends) ------
  const priceStorm = isPriceChurnStorm({
    changed: saved.prices.changed,
    priced: saved.prices.changed + saved.prices.unchanged,
    complete,
  });
  if (priceStorm) {
    report = escalate(
      report,
      "FAIL",
      `${saved.prices.changed.toLocaleString()} of ${(saved.prices.changed + saved.prices.unchanged).toLocaleString()} ` +
        `prices moved this run - grocery prices are sticky, so the price reader is probably reading the wrong number. ` +
        `NOTE: prices are written as the walk runs, so these rows already exist and share this run's seenAt.`
    );
  }
  if (alive.length > 0) {
    report = escalate(
      report,
      "WARN",
      `${alive.length.toLocaleString()} product(s) were missing from the walk yet their pages still answer - the walk has a hole`
    );
  }
  for (const s of segmentDiff.appeared) {
    report = escalate(
      report,
      "WARN",
      `a new segment the food filter drops appeared: "${s.segment}" (${s.count.toLocaleString()} products) - a food department may be hiding in it`
    );
  }
  for (const s of segmentDiff.vanished) {
    report = escalate(
      report,
      "FAIL",
      `a food segment we kept last run is gone this run: "${s.segment}" (was ${s.count.toLocaleString()} products)`
    );
  }
  if (catastrophe) report = escalate(report, "FAIL", catastrophe);
  for (const reason of tileHealthReasons(tileHealth)) report = escalate(report, "FAIL", reason);
  {
    const reason = underCollectedReason({ missing: missing.length, live, complete });
    if (reason) report = escalate(report, "FAIL", reason);
  }
  for (const reason of incompleteWalkReasons({
    walked: walk.crawled,
    published: walk.publishedTotal,
    failedDepartments: walk.failedDepartments,
    complete,
  })) {
    report = escalate(report, "FAIL", reason);
  }

  const explain = !args.includes("--brief");
  const written = await writeReport(report, { explain });
  console.log(`\n${renderReport(report, { explain })}`);
  console.log(`\nreport written to ${written.text} and ${written.json}`);
  if (report.verdict === "FAIL") process.exitCode = 1;
}

/** The most recent Auchan run's segment tally, for the run-over-run comparison. */
async function previousSegmentTally(before: Date): Promise<SegmentCount[]> {
  const run = await prisma.crawlRun.findFirst({
    where: { store: STORE, segmentTally: { not: null }, startedAt: { lt: before } },
    orderBy: { startedAt: "desc" },
    select: { segmentTally: true },
  });
  if (!run?.segmentTally) return [];
  try {
    return JSON.parse(run.segmentTally) as SegmentCount[];
  } catch {
    return [];
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    await writeCrashReport(STORE, e);
    await prisma.$disconnect();
    process.exit(1);
  });
