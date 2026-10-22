import { prisma } from "../lib/db";
import { crawlAuchan, type AuchanCrawlMode } from "../scrapers/crawl/auchan";
import { isFoodSegment } from "../scrapers/crawl/auchan-categories";
import { classifyAuchanPage } from "../scrapers/auchan";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { recordSections, sectionLines, sectionProblems } from "../scrapers/crawl/section-watch";
import { buildRotationReport } from "../scrapers/crawl/rotation-report";
import { promotionLine, promotionWarning, tallyPromotions } from "../scrapers/crawl/promo-watch";
import {
  fillBarcodes,
  forEachBatch,
  recordDead,
  recordUnavailable,
  stopTrackingLeftOut,
  stopTrackingMovedOut,
  touchChecked,
  UNAVAILABLE_RECHECK_DAYS,
} from "../scrapers/crawl/product-checks";
import { catalogueSizes, compareSizes, previousSizes } from "../scrapers/crawl/catalogue-size";
import { churnCatastropheReason, isPriceChurnStorm } from "../scrapers/crawl/reidentification";
import {
  compareSegments,
  isEmptyCategoryStorm,
  isTileYieldCollapse,
  isUnderCollectedWalk,
  shouldConfirmAbsences,
  tileHealthReasons,
  truncatedWalks,
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
import { formatHttpStats, httpStats, wireBytesOf, requireCrawlerContact } from "../scrapers/http";

/**
 * The nightly Auchan run: the one command a scheduler calls.
 *
 *   npm run crawl:auchan:nightly
 *   npm run crawl:auchan:nightly -- --max-pages=2   # a small smoke test
 *
 * Three phases, because Auchan permits listing grids and Continente does not, so
 * one walk does the work Continente needs three separate phases for:
 *
 *   1. walk the catalogue (full)   ~370 requests   everything, with prices and categories
 *   2. confirm the missing         one per missing  is an absent product actually gone
 *   3. report                      none            what changed, and is anything wrong
 *
 * `full` mode, always: it walks `cgid=root` AND the five food departments and
 * unions them, because neither grid is complete on its own - a live run found
 * ~49 priced food products root omits but the departments list. A partial walk
 * cannot police itself, so `--max-pages` gates phase 2 off. See auchan-health.ts
 * for the guards a grid crawl needs that a sitemap crawl does not.
 */

const STORE = "AUCHAN" as const;
/** The nightly always walks the union of root and the departments. */
const MODE: AuchanCrawlMode = "full";
/** Examples carried per list in the report. */
const SAMPLE = 12;

async function main() {
  requireCrawlerContact();
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
  console.log(`phase 1: walking the ${MODE} catalogue (root + departments)${maxPages ? ` (max ${maxPages} pages)` : ""}`);
  if (complete) console.log("  at ~13 products/sec this is about 93 minutes");

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

  // Products the walk SAW but data/store-sections.ts left out stop being
  // tracked now. Before the missing set is read, so they are not mistaken for
  // products that vanished and have their pages fetched one by one.
  const stoppedTracking = await stopTrackingLeftOut(STORE, walk.leftOutIds, seenAt);
  if (walk.leftOut.total > 0) {
    console.log(
      `  left out by data/store-sections.ts: ${walk.leftOut.total.toLocaleString()}` +
        (stoppedTracking > 0 ? ` (${stoppedTracking} held before, no longer tracked)` : "")
    );
  }
  // Products we hold that the walk saw in a non-food section have moved there
  // (Auchan's baby food did, around 31 August 2026): stopped now, as at the
  // other two chains, rather than looking missing and "alive" every night.
  const liveBefore = await prisma.catalogueProduct.count({ where: { store: STORE, delistedAt: null } });
  const movedOut = await stopTrackingMovedOut(STORE, walk.nonFoodIds, liveBefore, seenAt);
  if (movedOut.stopped.length > 0) {
    console.log(`  moved into a non-food section: ${movedOut.stopped.length.toLocaleString()} held product(s), no longer tracked`);
  }
  if (movedOut.refused) console.log(`  !! ${movedOut.refused}`);
  const sectionChanges = await recordSections(STORE, walk.sections, seenAt, complete);

  // ---------------------------------------------------------------- phase 2
  const live = await prisma.catalogueProduct.count({ where: { store: STORE, delistedAt: null } });
  const missing = await prisma.catalogueProduct.findMany({
    where: { store: STORE, delistedAt: null, lastSeenAt: { lt: seenAt } },
    select: { storeProductId: true, url: true, name: true, unavailableAt: true },
  });
  const nameOf = new Map(missing.map((m) => [m.storeProductId, m.name]));

  // The full missing set drives the under-collected guard, and we FETCH the ones
  // not confirmed unavailable within UNAVAILABLE_RECHECK_DAYS. An out-of-stock
  // product is missing every night (its priceless grid tile is always skipped).
  // Since 18 October 2026 that is zero days, by the user's decision: every out-
  // of-stock product is looked at again at every crawl, so a product back in
  // stock, or withdrawn, is known the next night rather than a fortnight later.
  // It costs one request per out-of-stock product per crawl.
  const unavailableCutoff = new Date(seenAt.getTime() - UNAVAILABLE_RECHECK_DAYS * 86_400_000);
  const toConfirm = missing.filter((m) => m.unavailableAt === null || m.unavailableAt < unavailableCutoff);
  const skippedUnavailable = missing.length - toConfirm.length;

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
  // Per-category, not one summed total: the union of root and the departments
  // overlaps, so a single delivered-vs-published would double-count it and hide
  // a truncated slice. Each walk is judged against its own published count.
  const truncationReasons = truncatedWalks(walk.walks, walk.failedDepartments, complete);
  const truncated = truncationReasons.length > 0;
  const tileHealth = {
    tilesSeen: walk.tilesSeen,
    tilesKept: walk.tilesKept,
    malformed: walk.tilesMalformed,
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
  const unavailable: string[] = [];
  const unreachable: string[] = [];
  const alive: string[] = [];
  const barcodesSeen: { storeProductId: string; barcode: string }[] = [];
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
    console.log(
      `\nphase 2: confirming ${toConfirm.length.toLocaleString()} products missing from the walk` +
        (skippedUnavailable > 0 ? ` (${skippedUnavailable.toLocaleString()} known out of stock, rechecked later)` : "")
    );
    for (const m of toConfirm) {
      const { status, barcode } = await classifyAuchanPage(m.url);
      if (barcode) barcodesSeen.push({ storeProductId: m.storeProductId, barcode });
      if (status === "gone") confirmedDead.push(m.storeProductId);
      else if (status === "unavailable") unavailable.push(m.storeProductId);
      else if (status === "alive") alive.push(m.storeProductId);
      else unreachable.push(m.storeProductId);
    }

    // Guard 1: an implausible fraction of the whole catalogue confirmed dead at
    // once is a site fault, not turnover. Freeze delisting so an unattended
    // schedule cannot wipe the catalogue over three such nights.
    catastrophe = churnCatastropheReason({ dead: confirmedDead.length, attempted: live, complete });
    if (catastrophe) {
      console.log(`  !! ${catastrophe}`);
      await touchChecked(STORE, [...confirmedDead, ...unavailable, ...unreachable, ...alive], seenAt);
    } else {
      ({ delisted } = await recordDead(STORE, confirmedDead, seenAt));
      await recordUnavailable(STORE, unavailable, seenAt);
      await touchChecked(STORE, unreachable, seenAt);
      // Alive but absent: reset the dead counter and any stale unavailable marker
      // (it is neither dying nor out of stock), but do NOT advance lastSeenAt, so
      // it stays visible as a hole in the walk until the grid picks it up again.
      await forEachBatch(alive, async (slice) => {
        await prisma.catalogueProduct.updateMany({
          where: { store: STORE, storeProductId: { in: slice } },
          data: { deadCount: 0, unavailableAt: null, lastCheckedAt: seenAt },
        });
      });
    }
    // The pages were read anyway: keep the barcodes they carry (only where none
    // is known), so a group of identical products needs no separate read.
    const filled = await fillBarcodes(STORE, barcodesSeen, seenAt);
    console.log(
      `  ${confirmedDead.length.toLocaleString()} gone, ${alive.length.toLocaleString()} alive but missing` +
        `, ${unavailable.length.toLocaleString()} out of stock, ${unreachable.length.toLocaleString()} unreachable` +
        `; ${filled.toLocaleString()} barcode(s) kept`
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

  // Only a complete walk has seen every segment, so only a complete walk can say
  // one vanished. On a `--max-pages` slice the small segments simply have not
  // been reached yet - "produtos-locais" (4 products) never lands on page 1 of a
  // category - and comparing that against a full baseline reports them as gone.
  const previousSegments = await previousSegmentTally(seenAt);
  const segmentDiff = complete
    ? compareSegments(segmentCounts, previousSegments)
    : { appeared: [], vanished: [], firstRun: false };

  const sizesNow = await catalogueSizes();
  const catalogueByStore = compareSizes(sizesNow, await previousSizes(seenAt));

  const gridHealth: GridHealthExtras = {
    mode: MODE,
    distinctWalked: walk.crawled,
    coverage: walk.walks.map((w) => ({ label: w.label, delivered: w.delivered, published: w.expected })),
    // In "full" mode walk.walks[0] is root; the rest are departments, whose
    // `added` is exactly what each contributed beyond what root already had.
    addedByDepartments: walk.walks.slice(1).reduce((n, w) => n + w.added, 0),
    delisting,
    tilesSeen: walk.tilesSeen,
    tilesKept: walk.tilesKept,
    tilesUnpriced: walk.tilesUnpriced,
    tilesMalformed: walk.tilesMalformed,
    withoutCategory: walk.withoutCategory,
    segments: [...segmentCounts].sort((a, b) => b.count - a.count),
    segmentsAppeared: segmentDiff.appeared.map((s) => ({
      segment: s.segment,
      count: s.count,
      samples: walk.segmentSamples.get(s.segment) ?? [],
    })),
    segmentsVanished: segmentDiff.vanished.map((s) => ({ segment: s.segment, count: s.count })),
    segmentsAreBaseline: segmentDiff.firstRun,
    confirmedDead: confirmedDead.length,
    delistedNow: delisted.length,
    delistedSamples: delisted.slice(0, SAMPLE).map((id) => ({ storeProductId: id, name: nameOf.get(id) ?? id })),
    unavailable: unavailable.length,
    unavailableSkipped: skippedUnavailable,
    unreachable: unreachable.length,
    aliveButMissing: alive.length,
    aliveButMissingSamples: alive.slice(0, SAMPLE).map((id) => ({ storeProductId: id, name: nameOf.get(id) ?? id })),
    movedToNonFood: movedOut.stopped.length,
    movedToNonFoodSamples: movedOut.stopped.slice(0, SAMPLE),
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
    sections: sectionLines(sectionChanges, walk.leftOut),
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
      tilesUnpriced: walk.tilesUnpriced,
      tilesMalformed: walk.tilesMalformed,
      emptyCategory: walk.withoutCategory,
      durationMs: Date.now() - started,
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
  for (const problem of sectionProblems(sectionChanges)) report = escalate(report, "WARN", problem);
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
  if (movedOut.refused) report = escalate(report, "FAIL", movedOut.refused);
  for (const reason of tileHealthReasons(tileHealth)) report = escalate(report, "FAIL", reason);
  {
    const reason = underCollectedReason({ missing: missing.length, live, complete });
    if (reason) report = escalate(report, "FAIL", reason);
  }
  for (const reason of truncationReasons) {
    report = escalate(report, "FAIL", reason);
  }

  // Reported, not warned about: the listing walk records no promotion state for
  // Auchan yet, so the line says so plainly (promo-watch.ts).
  const promotions = await tallyPromotions(STORE, seenAt);
  report = { ...report, promotions };
  const promotionProblem = promotionWarning(promotions);
  if (promotionProblem) report = escalate(report, "WARN", promotionProblem);
  console.log(promotionLine(promotions));

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
