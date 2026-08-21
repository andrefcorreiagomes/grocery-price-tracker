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
import {
  checkTotals,
  checkedIds,
  recordChecks,
  recordDead,
  recordRecategorised,
  staleChecks,
  staleDelisted,
  touchChecked,
  type CheckResult,
} from "../scrapers/crawl/product-checks";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { buildDailyReport, snapshotBefore, type ProductNote } from "../scrapers/crawl/daily-report";
import { buildRotationReport } from "../scrapers/crawl/rotation-report";
import { SAMPLE, nightsToComplete, type DiscoveryExtras } from "../scrapers/crawl/discovery-report";
import { RUNS_BEFORE_ACCEPTING, comparePerFile, judgeSitemap } from "../scrapers/crawl/sitemap-trust";
import {
  compareWithBaseline,
  compareWithPrevious,
  previousRunFor,
  recordRun,
  rollingBaseline,
} from "../scrapers/crawl/history";
import { catalogueSizes, compareSizes, previousSizes } from "../scrapers/crawl/catalogue-size";
import { writeCrashReport } from "../scrapers/crawl/crash-report";
import { renderReport, writeReport } from "../scrapers/crawl/render-report";
import { formatHttpStats, httpStats, wireBytesOf } from "../scrapers/http";
import type { SearchHit } from "../scrapers/search/types";

/**
 * The nightly Continente run: the one command a scheduler calls.
 *
 *   npm run crawl:continente:nightly
 *   npm run crawl:continente:nightly -- --limit=20 --budget=20   # a small test slice
 *   npm run crawl:continente:nightly -- --budget=0               # prices only
 *
 * Five phases, in order, sharing one instant and one report:
 *
 *   1. sitemap diff          7 requests    which published ids have we never opened?
 *   2. refresh the catalogue ~17,300       today's price for everything we track
 *   3. examine the unknowns  budget        what ARE those ids? written down once
 *   4. published counts      6 requests    has a whole section stopped reaching us?
 *   5. report                none          what changed, and is anything wrong?
 *
 * Phase 2 is all of the wall-clock time: about five hours at one request per
 * second. Everything else is minutes.
 *
 * Only the compliant route is used - one product page at a time, plus the
 * sitemap and section landing pages that robots.txt invites. Nothing here
 * touches a listing grid.
 */

const STORE = "CONTINENTE" as const;

/** Verdicts re-checked per night, on top of the backlog budget. */
const RECHECK_PER_NIGHT = 300;

function topSection(path: string | null | undefined): string {
  return (path ?? "").split("/")[0].trim() || "(sem categoria)";
}

const isFood = (path: string | null) => CONTINENTE_FOOD_SECTIONS.has(topSection(path));

/** Save a batch of food products, grouped into the sections the report reads. */
async function saveGrouped(
  writer: Awaited<ReturnType<typeof openCatalogueWriter>>,
  batch: SearchHit[]
) {
  const bySection = new Map<string, SearchHit[]>();
  for (const hit of batch) {
    const section = topSection(hit.category);
    const list = bySection.get(section) ?? [];
    list.push(hit);
    bySection.set(section, list);
  }
  for (const [section, products] of bySection) await writer.save(products, section);
}

async function main() {
  const args = process.argv.slice(2);
  const numeric = (flag: string) => {
    const raw = args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      console.error(`--${flag} must be a non-negative integer, got "${raw}"`);
      process.exit(1);
    }
    return n;
  };

  const limit = numeric("limit");
  const budget = numeric("budget") ?? 3_000;
  const started = Date.now();

  // Read the previous state BEFORE anything writes over it. snapshotBefore is
  // the only moment the pre-crawl values of every row exist.
  const before = await snapshotBefore(STORE);
  const previousRun = await previousRunFor(STORE);
  const baseline = await rollingBaseline(STORE);

  // Opening the writer fixes the one instant this whole run stamps on
  // everything, and reads the existing ids once.
  const writer = await openCatalogueWriter(STORE);
  const seenAt = writer.seenAt;

  // ---------------------------------------------------------------- phase 1
  console.log("phase 1: sitemap diff");

  // The sitemap is optional to this run, not required by it. Phase 2 works
  // entirely from URLs stored on our own rows, so a sitemap outage should cost
  // one night of DISCOVERY and nothing else - letting it throw here would
  // abandon the price refresh that is the point of the run.
  let published = new Map<string, string>();
  let sitemapFiles = 0;
  let perFile: { url: string; entries: number }[] = [];
  let unparseable = 0;
  let unparseableSamples: string[] = [];
  let sitemapError: string | null = null;
  try {
    const sitemap = await discoverProductUrls();
    published = sitemap.urls;
    sitemapFiles = sitemap.files;
    perFile = sitemap.perFile;
    unparseable = sitemap.unparseable;
    unparseableSamples = sitemap.unparseableSamples;
  } catch (error) {
    sitemapError = (error as Error).message.slice(0, 120);
    console.log(`  could not read the sitemap: ${sitemapError}`);
    console.log("  skipping discovery for tonight; the price refresh continues");
  }

  // The last sitemap we BELIEVED is the baseline; everything since then is
  // evidence about whether a change is a glitch or the new normal. Both are
  // needed - see sitemap-trust.ts for why recording only trusted runs stalls
  // discovery permanently after a legitimate reorganisation.
  const lastTrusted = await prisma.crawlRun.findFirst({
    where: { store: STORE, sitemapTrusted: true },
    orderBy: { startedAt: "desc" },
    select: { sitemapEntries: true, sitemapFiles: true, startedAt: true },
  });
  // The immediately previous run, believed or not. Night-over-night movement is
  // what a reader wants; the trusted baseline is what the guards are entitled
  // to measure against, and after a bad night the two are different days.
  const lastRun = await prisma.crawlRun.findFirst({
    where: { store: STORE, sitemapEntries: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { sitemapEntries: true, sitemapFiles: true, sitemapTrusted: true, startedAt: true },
  });

  const recentRuns = await prisma.crawlRun.findMany({
    where: {
      store: STORE,
      sitemapEntries: { not: null },
      ...(lastTrusted ? { startedAt: { gt: lastTrusted.startedAt } } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: RUNS_BEFORE_ACCEPTING,
    select: { sitemapEntries: true, sitemapFiles: true, sitemapTrusted: true },
  });

  const sitemapBaseline =
    lastTrusted?.sitemapEntries != null && lastTrusted.sitemapFiles != null
      ? { entries: lastTrusted.sitemapEntries, files: lastTrusted.sitemapFiles }
      : null;
  const sitemapPrevious = sitemapBaseline?.entries ?? null;
  const filesPrevious = sitemapBaseline?.files ?? null;

  // Per-file comparison against the last run that reported any, believed or
  // not: a truncated file is damage whether or not the totals looked fine.
  const lastPerFileRun = await prisma.crawlRun.findFirst({
    where: { store: STORE, sitemapPerFile: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { sitemapPerFile: true },
  });
  let previousPerFile: { url: string; entries: number }[] = [];
  try {
    previousPerFile = lastPerFileRun?.sitemapPerFile
      ? (JSON.parse(lastPerFileRun.sitemapPerFile) as { url: string; entries: number }[])
      : [];
  } catch {
    // Unreadable history is not worth failing a run over; it just means no
    // comparison this time.
    previousPerFile = [];
  }
  const fileWarnings = sitemapError === null ? comparePerFile(perFile, previousPerFile) : [];

  const trust = judgeSitemap({
    entries: published.size,
    files: sitemapFiles,
    error: sitemapError,
    baseline: sitemapBaseline,
    recent: recentRuns.map((r) => ({
      entries: r.sitemapEntries ?? 0,
      files: r.sitemapFiles ?? 0,
      trusted: r.sitemapTrusted ?? false,
    })),
  });
  const { trusted: sitemapTrusted, distrust, accepted } = trust;

  const catalogue = await prisma.catalogueProduct.findMany({
    where: { store: STORE },
    select: { storeProductId: true, name: true, delistedAt: true },
  });
  const catalogueIds = new Set(catalogue.map((c) => c.storeProductId));
  const alreadyChecked = await checkedIds(STORE);

  const unexamined: ProductTarget[] = [];
  for (const [id, url] of published) {
    if (catalogueIds.has(id) || alreadyChecked.has(id)) continue;
    unexamined.push({ storeProductId: id, url });
  }

  // Products we hold that the sitemap has stopped listing. Report-only: a 404
  // from the product page is what actually counts towards delisting.
  const droppedFromSitemap = sitemapTrusted
    ? catalogue.filter((c) => c.delistedAt === null && !published.has(c.storeProductId))
    : [];

  if (sitemapError === null) {
    console.log(
      `  ${published.size.toLocaleString()} published across ${sitemapFiles} file(s)` +
        `, ${catalogueIds.size.toLocaleString()} tracked` +
        `, ${alreadyChecked.size.toLocaleString()} already judged` +
        `, ${unexamined.length.toLocaleString()} never opened`
    );
  }
  if (accepted !== null) console.log(`  note: ${accepted}`);
  if (!sitemapTrusted) {
    console.log(`  not trusting the sitemap: ${distrust}`);
    console.log(`  skipping discovery; ${catalogueIds.size.toLocaleString()} tracked products are unaffected`);
  }

  // ---------------------------------------------------------------- phase 2
  // Stalest first, and delisted products excluded. `lastCheckedAt` rather than
  // `lastSeenAt` because a 404 leaves lastSeenAt frozen, and a frozen old
  // timestamp would sort dead products to the FRONT of this queue every night.
  // SQLite sorts NULLs first ascending, so never-checked rows lead, which is
  // what we want.
  const queue = await prisma.catalogueProduct.findMany({
    where: { store: STORE, delistedAt: null },
    select: { storeProductId: true, url: true },
    // `lastSeenAt` breaks the tie, which matters on the first run after this
    // was added: every row has a null lastCheckedAt, and without it a limited
    // run would take an arbitrary slice rather than the stalest one.
    orderBy: [{ lastCheckedAt: "asc" }, { lastSeenAt: "asc" }],
    ...(limit === undefined ? {} : { take: limit }),
  });
  const complete = limit === undefined;

  console.log(`\nphase 2: refreshing ${queue.length.toLocaleString()} tracked products`);
  if (complete && queue.length > 2_000) {
    console.log(`  at one request per second this is about ${(queue.length / 3600).toFixed(1)} hours`);
  }

  const refresh = await fetchProducts(queue, {
    isFood,
    onBatch: (batch) => saveGrouped(writer, batch),
    onProgress: (p) =>
      console.log(`  ${p.page.toLocaleString()} pages, ${p.collected.toLocaleString()} products`),
  });

  // A page that said the product is gone advances its counter; three nights
  // sets delistedAt. Transient failures only touch lastCheckedAt, so a bad
  // night cannot delist anything.
  const { delisted } = await recordDead(
    STORE,
    refresh.dead.map((d) => d.storeProductId),
    seenAt
  );
  await recordRecategorised(
    STORE,
    refresh.nonFood.map((n) => n.storeProductId),
    seenAt
  );
  await touchChecked(
    STORE,
    refresh.unreachable.map((u) => u.storeProductId),
    seenAt
  );

  console.log(
    `  ${refresh.fetched.toLocaleString()} answered` +
      `, ${refresh.dead.length.toLocaleString()} gone` +
      `, ${refresh.nonFood.length.toLocaleString()} no longer food` +
      `, ${refresh.unreachable.length.toLocaleString()} unreachable`
  );
  if (delisted.length > 0) {
    console.log(`  ${delisted.length.toLocaleString()} reached three dead nights and are now delisted`);
  }

  // ---------------------------------------------------------------- phase 3
  const fromBacklog =
    sitemapTrusted && budget > 0 ? unexamined.slice(0, budget) : [];

  // The re-check trickle: verdicts and delistings old enough to be worth asking
  // again. Counted separately from the backlog, because they are not progress
  // through it - subtracting them would make the catalogue look closer to
  // complete than it is.
  const recheckDelisted = await staleDelisted(STORE, RECHECK_PER_NIGHT, seenAt);
  const recheckChecks = await staleChecks(STORE, RECHECK_PER_NIGHT, seenAt);
  const rechecked = recheckDelisted.length + recheckChecks.length;

  const examineTargets: ProductTarget[] = [...fromBacklog, ...recheckDelisted, ...recheckChecks];

  const newFood: ProductNote[] = [];
  let examine: Awaited<ReturnType<typeof fetchProducts>> | null = null;

  if (examineTargets.length > 0) {
    console.log(`\nphase 3: examining ${examineTargets.length.toLocaleString()} unknown or stale ids`);
    examine = await fetchProducts(examineTargets, {
      isFood,
      onBatch: async (batch) => {
        for (const hit of batch) {
          if (!catalogueIds.has(hit.id)) newFood.push({ storeProductId: hit.id, name: hit.name });
        }
        await saveGrouped(writer, batch);
      },
      onProgress: (p) => console.log(`  ${p.page.toLocaleString()} examined`),
    });

    // Route each verdict to the product's single home: catalogue rows stay in
    // the catalogue (delisted, with their price history), everything else goes
    // to ProductCheck. Writing both would put one id in two tables, which is
    // exactly what the split is meant to prevent.
    const checks: CheckResult[] = [];
    const deadCatalogue: string[] = [];
    for (const d of examine.dead) {
      if (catalogueIds.has(d.storeProductId)) deadCatalogue.push(d.storeProductId);
      else
        checks.push({ storeProductId: d.storeProductId, url: d.url, verdict: "DEAD" });
    }
    const nonFoodCatalogue: string[] = [];
    for (const n of examine.nonFood) {
      if (catalogueIds.has(n.storeProductId)) nonFoodCatalogue.push(n.storeProductId);
      else
        checks.push({
          storeProductId: n.storeProductId,
          url: n.url,
          verdict: "NOT_FOOD",
          name: n.name,
          categoryPath: n.categoryPath,
        });
    }

    await recordChecks(STORE, checks, seenAt);
    await recordDead(STORE, deadCatalogue, seenAt);
    await recordRecategorised(STORE, nonFoodCatalogue, seenAt);
    await touchChecked(
      STORE,
      examine.unreachable.filter((u) => catalogueIds.has(u.storeProductId)).map((u) => u.storeProductId),
      seenAt
    );

    console.log(
      `  ${newFood.length.toLocaleString()} are food and were added` +
        `, ${examine.nonFood.length.toLocaleString()} are not food` +
        `, ${examine.dead.length.toLocaleString()} are gone`
    );
  }

  const saved = writer.finish();
  const total = saved.summaries.reduce((sum, s) => sum + s.total, 0);

  // ---------------------------------------------------------------- phase 4
  console.log("\nphase 4: published section counts");
  let publishedCounts = new Map<string, number>();
  try {
    publishedCounts = await fetchPublishedCounts();
  } catch (error) {
    console.error(`  could not read them: ${(error as Error).message}`);
  }

  // ---------------------------------------------------------------- phase 5
  const remaining = Math.max(0, unexamined.length - fromBacklog.length);
  const sizesNow = await catalogueSizes();
  const sizesBefore = await previousSizes(seenAt);
  const catalogueByStore = compareSizes(sizesNow, sizesBefore);

  const totals = await checkTotals(STORE);
  const delistedNotes: ProductNote[] = delisted.slice(0, SAMPLE).map((id) => ({
    storeProductId: id,
    name: catalogue.find((c) => c.storeProductId === id)?.name ?? id,
  }));

  const discovery: DiscoveryExtras = {
    sitemapEntries: published.size,
    sitemapPrevious,
    sitemapBaselineAt: lastTrusted?.startedAt.toISOString() ?? null,
    sitemapLastRun: lastRun
      ? {
          entries: lastRun.sitemapEntries ?? 0,
          files: lastRun.sitemapFiles ?? 0,
          at: lastRun.startedAt.toISOString(),
          trusted: lastRun.sitemapTrusted ?? false,
        }
      : null,
    sitemapTrusted,
    sitemapDistrust: distrust,
    sitemapAccepted: accepted,
    sitemapFiles,
    sitemapFilesPrevious: filesPrevious,
    sitemapPerFile: perFile,
    sitemapFileWarnings: fileWarnings,
    sitemapUnparseable: unparseable,
    sitemapUnparseableSamples: unparseableSamples,
    examined: fromBacklog.length,
    rechecked,
    verdictNotFood: totals.notFood,
    verdictDead: totals.dead,
    newFood: newFood.slice(0, SAMPLE),
    newFoodCount: newFood.length,
    unexaminedRemaining: remaining,
    nightsToComplete: nightsToComplete(remaining, budget),
    droppedFromSitemap: droppedFromSitemap.slice(0, SAMPLE).map((c) => ({
      storeProductId: c.storeProductId,
      name: c.name,
    })),
    droppedFromSitemapCount: droppedFromSitemap.length,
    delistedNow: delistedNotes,
    delistedNowCount: delisted.length,
    recategorised: refresh.nonFood.slice(0, SAMPLE).map((n) => ({
      storeProductId: n.storeProductId,
      name: n.name,
      detail: n.categoryPath ?? undefined,
    })),
    recategorisedCount: refresh.nonFood.length,
    unreachable: refresh.unreachable.length + (examine?.unreachable.length ?? 0),
  };

  const allResults = [...refresh.results, ...(examine?.results ?? [])];
  const rotationOnly = await buildRotationReport({
    store: STORE,
    complete,
    seenAt,
    refreshed: total,
    dead: refresh.dead.length,
    deadSamples: refresh.dead.slice(0, SAMPLE).map((d) => ({
      storeProductId: d.storeProductId,
      name: d.reason.slice(0, 60),
    })),
    nonFood: refresh.nonFood.length,
    prices: saved.prices,
    http: httpStats(),
    publishedCounts,
    newProducts: newFood.slice(0, SAMPLE),
    newCount: newFood.length,
  });

  let report = { ...rotationOnly, discovery, catalogueByStore };
  const sections = saved.summaries.map((s) => ({
    cgid: s.label,
    label: s.label,
    collected: s.total,
    expected: publishedCounts.get(s.label) ?? null,
  }));

  if (complete && baseline) {
    const drift = [
      ...(await compareWithPrevious(STORE, total, sections)),
      ...compareWithBaseline(baseline, total, sections),
    ];
    const full = await buildDailyReport({
      store: STORE,
      seenAt,
      before,
      results: allResults,
      audit: { unknown: [], missing: [] },
      publishedCounts,
      prices: saved.prices,
      http: httpStats(),
      drift,
      shortSections: [],
      sitemapSlugs: [],
      sitemapUnknown: [],
      baseline: { runs: baseline.runs, since: baseline.since },
      previousRun,
    });
    report = { ...full, rotation: rotationOnly.rotation, discovery, catalogueByStore };

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
    await recordRun(
      STORE,
      total,
      sections,
      { ...stats, wireBytes: stats.wireBytes || null },
      seenAt,
      // Recorded whether or not we believed them: a disbelieved observation is
      // what lets the next run tell a persistent change from a one-night glitch.
      published.size,
      sitemapFiles,
      sitemapTrusted,
      perFile,
      unparseable,
      sizesNow
    );
  }

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);
  console.log(`\nDone in ${((Date.now() - started) / 60000).toFixed(1)} min.`);

  // A skipped discovery has to reach the verdict, not just the detail below it:
  // the run genuinely succeeded at refreshing prices, but the catalogue stopped
  // growing tonight and nobody should have to read the whole report to find out.
  if (unparseable > 0) {
    report = {
      ...report,
      verdict: report.verdict === "FAIL" ? "FAIL" : "WARN",
      problems: [
        `${unparseable.toLocaleString()} sitemap address(es) had no extractable product id and were dropped - the URL shape may have changed`,
        ...report.problems,
      ],
    };
  }

  if (fileWarnings.length > 0) {
    report = {
      ...report,
      verdict: report.verdict === "FAIL" ? "FAIL" : "WARN",
      problems: [
        `${fileWarnings.length} sitemap file(s) shrank sharply: ${fileWarnings[0]}`,
        ...report.problems,
      ],
    };
  }

  if (accepted !== null) {
    report = {
      ...report,
      verdict: report.verdict === "FAIL" ? "FAIL" : "WARN",
      problems: [`sitemap baseline moved: ${accepted}`, ...report.problems],
    };
  }

  if (!sitemapTrusted) {
    report = {
      ...report,
      verdict: report.verdict === "FAIL" ? "FAIL" : "WARN",
      problems: [
        sitemapError === null
          ? `the sitemap shrank from ${sitemapPrevious?.toLocaleString()} to ${published.size.toLocaleString()} entries and was not trusted - discovery skipped, prices still refreshed`
          : `the sitemap could not be read (${sitemapError}) - discovery skipped, prices still refreshed`,
        ...report.problems,
      ],
    };
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
    await writeCrashReport(STORE, e);
    await prisma.$disconnect();
    process.exit(1);
  });
