import { prisma } from "../lib/db";
import {
  EMPTY_CATEGORY_LIMIT,
  MISSING_LIMIT,
  TILE_MALFORMED_LIMIT,
  compareSegments,
  isEmptyCategoryStorm,
  isTileYieldCollapse,
  isTruncatedWalk,
  isUnderCollectedWalk,
  shouldConfirmAbsences,
  truncatedWalks,
  type SegmentCount,
} from "../scrapers/crawl/auchan-health";
import { MIN_ATTEMPTED, isPriceChurnStorm, PRICE_CHURN_LIMIT } from "../scrapers/crawl/reidentification";
import { parseAuchanTilesDetailed, parseAuchanTotal } from "../scrapers/search/auchan";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { recordDead, touchChecked } from "../scrapers/crawl/product-checks";
import { recordRun } from "../scrapers/crawl/history";
import { escalate, renderReport } from "../scrapers/crawl/render-report";
import type { DailyReport, GridHealthExtras } from "../scrapers/crawl/daily-report";
import type { SearchHit } from "../scrapers/search/types";

/**
 * The Auchan nightly run: the four grid guards (pure), the tile parser's yield
 * accounting, the segment comparison, and the database primitives the
 * orchestrator composes - delisting, the streamed writer, the segment-tally
 * round trip. No network; all rows use the zzau- prefix and are cleaned up.
 *
 * The guards are tested at the predicate level rather than by running main(),
 * exactly as the Continente verifier tests recordDead and the writer rather than
 * the whole nightly script - the wiring is thin, the logic is here.
 */
const PREFIX = "zzau-";
const STORE = "AUCHAN" as const;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

async function cleanup(seenAt?: Date) {
  await prisma.cataloguePrice.deleteMany({
    where: { product: { storeProductId: { startsWith: PREFIX } } },
  });
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
  if (seenAt) await prisma.crawlRun.deleteMany({ where: { store: STORE, startedAt: seenAt } });
}

function hit(n: number, price: number, segment = "alimentacao"): SearchHit {
  return {
    id: `${PREFIX}${n}`,
    name: `Auchan product ${n}`,
    price,
    brand: "Verify",
    category: `${segment}/testes`,
    url: `https://example.invalid/${PREFIX}${n}.html`,
  };
}

/** One grid tile as Auchan serves it: two JSON attributes on one element. */
function tileHtml(gtm: unknown, urls: unknown): string {
  const g = typeof gtm === "string" ? gtm : JSON.stringify(gtm);
  const u = typeof urls === "string" ? urls : JSON.stringify(urls);
  return `<div data-gtm='${g}' data-urls='${u}'></div>`;
}

export async function verifyAuchanNightly(): Promise<number> {
  failures = 0;
  await cleanup();

  // --- the four grid guards, pure ------------------------------------------
  console.log("  guards (pure predicates)");

  // Incomplete walk: measures tiles DELIVERED against published - not tiles
  // parsed, which is the tile-yield guard's job. Reuses isMeaningfulShortfall -
  // more than 5 AND more than 1%.
  check(
    "truncated walk fires when the grid served materially fewer tiles",
    isTruncatedWalk({ delivered: 40_000, published: 54_859, failedDepartments: [], complete: true })
  );
  check(
    "truncated walk stays quiet on a tiny gap",
    !isTruncatedWalk({ delivered: 54_850, published: 54_859, failedDepartments: [], complete: true })
  );
  check(
    "a failed department is a truncated walk on its own",
    isTruncatedWalk({ delivered: 54_859, published: 54_859, failedDepartments: ["congelados"], complete: true })
  );
  check(
    "truncated walk never fires on a smoke test",
    !isTruncatedWalk({ delivered: 10, published: 54_859, failedDepartments: ["x"], complete: false })
  );
  check(
    "truncated walk cannot judge without a published count",
    !isTruncatedWalk({ delivered: 10, published: 0, failedDepartments: [], complete: true })
  );
  // The first real run's exact numbers: the grid delivered every tile it
  // published (55,200), the reader parsed 54,395 of them, and 806 fewer distinct
  // PRODUCTS than published is a parse yield the tile guard tolerates - NOT a
  // truncated grid. Comparing delivered-vs-published keeps the two guards from
  // contradicting each other and freezing a healthy run.
  check(
    "a full grid with an imperfect parse yield is not truncated",
    !isTruncatedWalk({ delivered: 55_200, published: 55_200, failedDepartments: [], complete: true })
  );

  // truncatedWalks: the per-category form the union nightly uses. A healthy
  // union - root delivering its full count (with unpriced tiles) and every
  // department delivering its own - fires nothing.
  const healthyWalks = [
    { label: "catálogo (root)", delivered: 55_200, expected: 55_196 },
    { label: "Alimentação", delivered: 8_601, expected: 8_600 },
    { label: "Congelados", delivered: 1_210, expected: 1_208 },
  ];
  check("a healthy union of root + departments is not truncated", truncatedWalks(healthyWalks, [], true).length === 0);
  // One department cut in half is diluted below 1% in a summed 73k total, but
  // per-category it is a 50% shortfall and must fire.
  const oneShort = [
    { label: "catálogo (root)", delivered: 55_200, expected: 55_196 },
    { label: "Congelados", delivered: 600, expected: 1_208 },
  ];
  check("a single department cut short fires per-category", truncatedWalks(oneShort, [], true).length === 1);
  check("root's unpriced shortfall alone does not fire", truncatedWalks([healthyWalks[0]], [], true).length === 0);
  check("a failed department fires", truncatedWalks(healthyWalks, ["congelados"], true).length === 1);
  check("no walk is judged on a smoke test", truncatedWalks(oneShort, ["x"], false).length === 0);

  // Under-collected: the same signal against our own catalogue, above MIN_ATTEMPTED.
  const live = Math.max(MIN_ATTEMPTED + 100, 1000);
  check(
    "under-collected fires above the missing limit",
    isUnderCollectedWalk({ missing: Math.ceil(live * (MISSING_LIMIT + 0.05)), live, complete: true })
  );
  check(
    "under-collected quiet just below the limit",
    !isUnderCollectedWalk({ missing: Math.floor(live * (MISSING_LIMIT - 0.02)), live, complete: true })
  );
  check(
    "under-collected ignored below MIN_ATTEMPTED",
    !isUnderCollectedWalk({ missing: MIN_ATTEMPTED - 1, live: MIN_ATTEMPTED - 1, complete: true })
  );

  // Tile yield and empty category, both share the MIN_ATTEMPTED floor.
  const seen = MIN_ATTEMPTED + 500;
  check(
    "tile-yield collapse fires when too many tiles are malformed",
    isTileYieldCollapse({
      tilesSeen: seen,
      tilesKept: seen,
      malformed: Math.ceil(seen * (TILE_MALFORMED_LIMIT + 0.05)),
      withoutCategory: 0,
      complete: true,
    })
  );
  check(
    "tile-yield quiet when nothing is malformed",
    !isTileYieldCollapse({ tilesSeen: seen, tilesKept: seen, malformed: 1, withoutCategory: 0, complete: true })
  );
  // The whole point of the split: a large UNPRICED share (out of stock) is not a
  // parser fault and must not trip the yield alarm - only malformed tiles do.
  check(
    "a large unpriced share does not trip the yield alarm",
    !isTileYieldCollapse({
      tilesSeen: seen,
      tilesKept: Math.floor(seen * 0.8),
      malformed: 0,
      withoutCategory: 0,
      complete: true,
    })
  );
  check(
    "empty-category storm fires when too many tiles have no category",
    isEmptyCategoryStorm({
      tilesSeen: seen,
      tilesKept: seen,
      malformed: 0,
      withoutCategory: Math.ceil(seen * (EMPTY_CATEGORY_LIMIT + 0.05)),
      complete: true,
    })
  );
  check(
    "empty-category quiet when almost all tiles have a category",
    !isEmptyCategoryStorm({ tilesSeen: seen, tilesKept: seen, malformed: 0, withoutCategory: 3, complete: true })
  );
  check(
    "neither tile guard fires on a smoke test",
    !isTileYieldCollapse({ tilesSeen: 10, tilesKept: 0, malformed: 10, withoutCategory: 0, complete: false }) &&
      !isEmptyCategoryStorm({ tilesSeen: 10, tilesKept: 10, malformed: 0, withoutCategory: 10, complete: false })
  );

  // The price alarm, reused from Continente.
  check(
    "price-churn alarm fires above its limit",
    isPriceChurnStorm({
      changed: Math.ceil(seen * (PRICE_CHURN_LIMIT + 0.05)),
      priced: seen,
      complete: true,
    })
  );

  // The gate in front of phase 2, which is NOT any single guard.
  //
  // Every guard above stands down when `complete` is false, because on a
  // deliberate slice each one would fire. That is right for the guards and
  // catastrophic for the confirmation pass: with all of them quiet, nothing
  // would stop a `--max-pages=2` run - ~400 products walked against a ~17,800
  // catalogue - from fetching a product page for the ~17,400 it never looked
  // for. So the skip is `!complete || walkFrozen`, and this asserts the
  // `!complete` half, which no individual guard can express.
  const walkFrozenFor = (complete: boolean) =>
    isTruncatedWalk({ delivered: 400, published: 54_859, failedDepartments: [], complete }) ||
    isUnderCollectedWalk({ missing: 17_400, live: 17_800, complete }) ||
    isTileYieldCollapse({ tilesSeen: 400, tilesKept: 400, malformed: 0, withoutCategory: 0, complete }) ||
    isEmptyCategoryStorm({ tilesSeen: 400, tilesKept: 400, malformed: 0, withoutCategory: 0, complete });
  check(
    "on a partial walk no guard fires, so they cannot gate the confirmation pass",
    !walkFrozenFor(false)
  );
  check(
    "a partial walk skips the confirmation pass anyway",
    !shouldConfirmAbsences({ complete: false, walkFrozen: walkFrozenFor(false) })
  );
  check(
    "the same shortfall on a COMPLETE walk does freeze delisting",
    walkFrozenFor(true) && !shouldConfirmAbsences({ complete: true, walkFrozen: walkFrozenFor(true) })
  );
  check(
    "a complete, healthy walk does confirm absences",
    shouldConfirmAbsences({ complete: true, walkFrozen: false })
  );

  // --- tile parsing yield ---------------------------------------------------
  console.log("\n  tile parsing");

  const good = tileHtml(
    { id: "a1", name: "Arroz", price: "1.20", brand: "X", category: "alimentacao/arroz" },
    { absoluteProductUrl: "https://x/a1" }
  );
  const badJson = `<div data-gtm='{not json' data-urls='{}'></div>`;
  // No url is structural breakage: a real product tile always has one.
  const missingUrl = tileHtml({ id: "a2", name: "No url", price: "3.00" }, {});
  // Has id/name/url but no price: a listed-but-unavailable product, benign.
  const unpricedTile = tileHtml({ id: "a3", name: "Out of stock" }, { absoluteProductUrl: "https://x/a3" });
  const noCategory = tileHtml(
    { id: "a4", name: "Sem categoria", price: "2.00" },
    { absoluteProductUrl: "https://x/a4" }
  );
  const parse = parseAuchanTilesDetailed(good + badJson + missingUrl + unpricedTile + noCategory);
  check("keeps only the well-formed, priced tiles", parse.hits.length === 2, `hits=${parse.hits.length}`);
  check("all five elements are counted as seen", parse.seen === 5, `seen=${parse.seen}`);
  check("bad JSON and a missing url are malformed", parse.malformed === 2, `malformed=${parse.malformed}`);
  check("a well-formed tile with no price is unpriced, not malformed", parse.unpriced === 1, `unpriced=${parse.unpriced}`);
  check("a tile with no category is counted", parse.withoutCategory === 1, `withoutCategory=${parse.withoutCategory}`);

  check(
    "counter reads the long shape",
    parseAuchanTotal('<div class="auc-js-search-results-count">1 - 64 de 54.859 resultados</div>') === 54859
  );
  check(
    "counter reads the short shape",
    parseAuchanTotal('<div class="auc-js-search-results-count">13 resultados</div>') === 13
  );

  // --- segment comparison ---------------------------------------------------
  console.log("\n  segment comparison");
  const nowSegs: SegmentCount[] = [
    { segment: "alimentacao", count: 100, kept: true },
    { segment: "brinquedos", count: 20, kept: false }, // new, dropped
  ];
  const beforeSegs: SegmentCount[] = [
    { segment: "alimentacao", count: 98, kept: true },
    { segment: "congelados", count: 50, kept: true }, // kept last run, gone now
  ];
  const diff = compareSegments(nowSegs, beforeSegs);
  check("a new dropped segment shows as appeared", diff.appeared.length === 1 && diff.appeared[0].segment === "brinquedos");
  check("a kept segment gone shows as vanished", diff.vanished.length === 1 && diff.vanished[0].segment === "congelados");
  check("a run with a baseline is not a first run", !diff.firstRun);
  check(
    "a dropped segment already seen last run does not re-appear",
    !compareSegments(
      [{ segment: "brinquedos", count: 20, kept: false }],
      [{ segment: "brinquedos", count: 19, kept: false }]
    ).appeared.length
  );

  // The first walk has no tally to compare against. Plain set arithmetic would
  // call every non-food segment Auchan sells "new", warning fifteen to
  // twenty-five times on the run most likely to be read closely - so an empty
  // baseline reports nothing and says so instead.
  const first = compareSegments(
    [
      { segment: "alimentacao", count: 8000, kept: true },
      { segment: "tecnologia", count: 900, kept: false },
      { segment: "casa", count: 700, kept: false },
      { segment: "brinquedos", count: 400, kept: false },
    ],
    []
  );
  check("a first run accuses no segment of being new", first.appeared.length === 0);
  check("a first run reports nothing vanished either", first.vanished.length === 0);
  check("a first run says it is the baseline", first.firstRun);

  // The orchestrator gates the whole comparison on `complete`, because a partial
  // walk has not reached the small segments and would report them as vanished
  // against a full baseline. Model that gate: on an incomplete walk, no diff.
  const gated = (complete: boolean) =>
    complete
      ? compareSegments([{ segment: "alimentacao", count: 100, kept: true }], beforeSegs)
      : { appeared: [], vanished: [], firstRun: false };
  check("a partial walk reports no vanished segments", gated(false).vanished.length === 0);
  check("a complete walk still can", gated(true).vanished.length > 0);

  // --- database primitives --------------------------------------------------
  console.log("\n  database primitives");

  // Streamed writer: two batches, one seenAt, one open period each. ean is left
  // undefined (a listing crawl), so nothing is held aside.
  const writer = await openCatalogueWriter(STORE);
  await writer.save([hit(1, 1.0), hit(2, 2.0)], "alimentacao");
  await writer.save([hit(3, 3.0)], "bebidas-e-garrafeira");
  const streamed = writer.finish();

  const rows = await prisma.catalogueProduct.findMany({
    where: { store: STORE, storeProductId: { startsWith: PREFIX } },
    select: { storeProductId: true, lastSeenAt: true, id: true },
  });
  check("all three products saved", rows.length === 3, `got ${rows.length}`);
  check("one seenAt across both batches", new Set(rows.map((r) => r.lastSeenAt.getTime())).size === 1);
  check("no swaps held aside on a listing crawl", streamed.swaps.length === 0);
  const openCounts = await Promise.all(
    rows.map((r) => prisma.cataloguePrice.count({ where: { productId: r.id, isOpen: true } }))
  );
  check("exactly one open price period per product", openCounts.every((n) => n === 1));

  // Missing set: rows whose lastSeenAt did NOT advance, excluding delisted.
  const seenAt = streamed.seenAt;
  await prisma.catalogueProduct.update({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}1` } },
    data: { lastSeenAt: new Date(seenAt.getTime() - 86_400_000) }, // stale: missing this run
  });
  const missing = await prisma.catalogueProduct.findMany({
    where: { store: STORE, delistedAt: null, lastSeenAt: { lt: seenAt }, storeProductId: { startsWith: PREFIX } },
    select: { storeProductId: true },
  });
  check(
    "missing set is exactly the row whose lastSeenAt did not advance",
    missing.length === 1 && missing[0].storeProductId === `${PREFIX}1`
  );
  // The union guarantee: a product streamed under a DEPARTMENT label (id 3, saved
  // under "bebidas-e-garrafeira", the way a bio/wine product root omits arrives)
  // is stamped seenAt like any other, so it is absent from the missing set. This
  // is the whole mechanism by which walking root + departments removes the 49
  // alive-but-missing products from the WARN.
  check(
    "a product seen only via a department is not counted missing",
    !missing.some((m) => m.storeProductId === `${PREFIX}3`)
  );

  // Delisting: a dead page three nights in a row sets delistedAt; not before.
  const n1 = new Date(seenAt.getTime() + 1000);
  const n2 = new Date(seenAt.getTime() + 2000);
  const n3 = new Date(seenAt.getTime() + 3000);
  await recordDead(STORE, [`${PREFIX}1`], n1);
  await recordDead(STORE, [`${PREFIX}1`], n2);
  const afterTwo = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}1` } },
    select: { delistedAt: true, deadCount: true },
  });
  check("two dead nights do not delist", afterTwo?.delistedAt === null && afterTwo?.deadCount === 2);
  const { delisted } = await recordDead(STORE, [`${PREFIX}1`], n3);
  const afterThree = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}1` } },
    select: { delistedAt: true },
  });
  check("the third dead night delists", delisted.length === 1 && afterThree?.delistedAt !== null);

  // Alive but missing: reset the dead counter (the orchestrator's exact update),
  // and confirm it does NOT touch delistedAt.
  await prisma.catalogueProduct.update({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}2` } },
    data: { deadCount: 2 },
  });
  await prisma.catalogueProduct.updateMany({
    where: { store: STORE, storeProductId: { in: [`${PREFIX}2`] } },
    data: { deadCount: 0, lastCheckedAt: n3 },
  });
  const alive = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}2` } },
    select: { deadCount: true, delistedAt: true, lastCheckedAt: true },
  });
  check(
    "an alive-but-missing product resets deadCount without delisting",
    alive?.deadCount === 0 && alive?.delistedAt === null && alive?.lastCheckedAt?.getTime() === n3.getTime()
  );

  // Unreachable: touchChecked moves only the clock.
  const beforeTouch = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}3` } },
    select: { deadCount: true, delistedAt: true },
  });
  await touchChecked(STORE, [`${PREFIX}3`], n3);
  const afterTouch = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}3` } },
    select: { deadCount: true, delistedAt: true, lastCheckedAt: true },
  });
  check(
    "an unreachable page moves only lastCheckedAt",
    afterTouch?.deadCount === beforeTouch?.deadCount &&
      afterTouch?.delistedAt === beforeTouch?.delistedAt &&
      afterTouch?.lastCheckedAt?.getTime() === n3.getTime()
  );

  // --- recordRun segment-tally round trip -----------------------------------
  console.log("\n  run record");
  const runInstant = new Date(seenAt.getTime() + 10_000);
  const tally: SegmentCount[] = [
    { segment: "alimentacao", count: 100, kept: true },
    { segment: "brinquedos", count: 20, kept: false },
  ];
  await recordRun(STORE, 120, [{ cgid: "alimentacao", label: "alimentacao", collected: 100 }], {
    seenAt: runInstant,
    segmentTally: tally,
    publishedTotal: 54_859,
    walkedTotal: 54_800,
    tilesSeen: 54_900,
    tilesKept: 54_880,
    tilesUnpriced: 15,
    tilesMalformed: 5,
    emptyCategory: 4,
  });
  const savedRun = await prisma.crawlRun.findFirst({
    where: { store: STORE, startedAt: runInstant },
    select: { segmentTally: true, publishedTotal: true, tilesSeen: true, tilesMalformed: true, walkedTotal: true },
  });
  const roundTrip = savedRun?.segmentTally ? (JSON.parse(savedRun.segmentTally) as SegmentCount[]) : [];
  check(
    "segment tally survives a recordRun round trip",
    roundTrip.length === 2 && roundTrip[0].segment === "alimentacao" && roundTrip[1].kept === false
  );
  check(
    "the grid columns survive a recordRun round trip",
    savedRun?.publishedTotal === 54_859 &&
      savedRun?.tilesSeen === 54_900 &&
      savedRun?.tilesMalformed === 5 &&
      savedRun?.walkedTotal === 54_800
  );
  await prisma.crawlRun.deleteMany({ where: { store: STORE, startedAt: runInstant } });

  // --- report render --------------------------------------------------------
  console.log("\n  report render and verdict ladder");
  const gridHealth: GridHealthExtras = {
    mode: "full",
    distinctWalked: 54_800,
    coverage: [
      { label: "catálogo (root)", delivered: 55_200, published: 55_196 },
      { label: "Alimentação", delivered: 8_601, published: 8_600 },
    ],
    addedByDepartments: 49,
    delisting: "active",
    tilesSeen: 54_900,
    tilesKept: 54_880,
    tilesUnpriced: 15,
    tilesMalformed: 5,
    withoutCategory: 4,
    segments: [{ segment: "alimentacao", count: 100, kept: true }],
    segmentsAppeared: [],
    segmentsVanished: [],
    segmentsAreBaseline: false,
    confirmedDead: 3,
    delistedNow: 1,
    delistedSamples: [{ storeProductId: "x", name: "Gone product" }],
    unreachable: 0,
    aliveButMissing: 2,
    aliveButMissingSamples: [{ storeProductId: "y", name: "Alive product" }],
  };
  const base: DailyReport = {
    store: STORE,
    runAt: new Date().toISOString(),
    verdict: "OK",
    problems: [],
    baseline: { runs: 1, since: new Date().toISOString() },
    scraper: { sections: [], requests: 0, megabytes: 0, transferredMegabytes: null, minutesFetching: 0, retries: 0, slowdown: null },
    quality: { total: 0, missingPrice: 0, missingBrand: 0, missingCategory: 0, missingUrl: 0 },
    catalogue: { seen: 0, newProducts: 0, disappeared: 0, stillMissing: 0, returned: 0, moved: 0, renamed: 0, samples: { newProducts: [], disappeared: [], returned: [], moved: [], renamed: [] } },
    prices: { opened: 0, changed: 0, unchanged: 0, skipped: 0, movers: [], absurd: [] },
    categories: { published: 0, crawled: 0, unknown: [], missing: [], publishedCountChanges: [], sitemapSlugs: 0, sitemapUnknown: [] },
    live: { trackedListingsMissing: [], candidatePairsAffected: 0 },
    drift: [],
    gridHealth,
  };
  const rendered = renderReport(base, { explain: false });
  check("the report carries the grid-health section", rendered.includes("Grid health"));
  check("the report shows distinct products walked", rendered.includes("54,800"));
  check("the report lists per-category coverage", rendered.includes("catálogo (root)") && rendered.includes("Alimentação"));
  check("the report shows what departments added beyond root", rendered.includes("departments added 49 beyond root"));
  check("the report shows alive-but-missing", rendered.includes("alive but missing"));
  check("the report shows unpriced apart from malformed", rendered.includes("listed without a price") && rendered.includes("MALFORMED"));

  // A partial walk must not be reported as a fired guard: both stop delisting,
  // only one is a fault, and calling a deliberate --max-pages run FROZEN is a
  // false alarm.
  const partial = renderReport({ ...base, gridHealth: { ...gridHealth, delisting: "partial" } }, { explain: false });
  check("a partial walk is not reported as a fired guard", !partial.includes("FROZEN"));
  check("a partial walk says absence was never tested", partial.includes("absence was never tested"));
  check(
    "a fired guard still reports FROZEN",
    renderReport({ ...base, gridHealth: { ...gridHealth, delisting: "frozen" } }, { explain: false }).includes("FROZEN")
  );

  // Two empty lists on a first run would read as "compared, and all clear".
  const baselineRun = renderReport(
    { ...base, gridHealth: { ...gridHealth, segmentsAreBaseline: true } },
    { explain: false }
  );
  check("a first run says its segments are the baseline", baselineRun.includes("BASELINE"));
  check(
    "a run with a baseline does not print that note",
    !renderReport(base, { explain: false }).includes("BASELINE")
  );

  // A store publishing no per-section counts must get no comparison rather than
  // a comparison against zero, which read as a 17,864-product shortfall.
  const noCounts = renderReport(
    {
      ...base,
      rotation: {
        complete: true,
        refreshedThisRun: 100,
        staleness: { today: 100, week: 0, month: 0, older: 0 },
        daysToFullCoverage: 1,
        oldestSeenAt: null,
        confirmedDelisted: 0,
        deadSamples: [],
        enrichment: { total: 100, withBarcode: 0, withSize: 0 },
        sections: [{ label: "alimentacao", ours: 100, published: null }],
      },
    },
    { explain: false }
  );
  check("no per-section counts means no invented shortfall", !noCounts.includes("difference of -"));
  check("and it says why instead", noCounts.includes("publishes no per-section counts"));

  const warned = escalate(base, "WARN", "a soft problem");
  const failed = escalate(warned, "FAIL", "a hard problem");
  check("escalate moves OK to WARN then FAIL", failed.verdict === "FAIL");
  check("a later WARN cannot soften a FAIL", escalate(failed, "WARN", "later soft").verdict === "FAIL");
  check("the newest message is first", escalate(failed, "WARN", "newest").problems[0] === "newest");

  await cleanup(seenAt);
  return failures;
}
