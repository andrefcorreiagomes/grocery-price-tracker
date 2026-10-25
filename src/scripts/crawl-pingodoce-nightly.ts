import { prisma } from "../lib/db";
import { discoverPingoDoceProducts } from "../scrapers/crawl/pingodoce-sitemap";
import { fetchPingoDoceProducts } from "../scrapers/crawl/pingodoce-products";
import type { PingoDoceProductUrl } from "../scrapers/crawl/pingodoce-sitemap";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { pageFieldsBefore, recordPageChanges, recordSitemapDates } from "../scrapers/crawl/sitemap-dates";
import {
  DEAD_NIGHTS_BEFORE_DELISTING,
  MAX_SHARE_MISSING,
  missingFromList,
  recordDead,
  stopTrackingMovedOut,
} from "../scrapers/crawl/product-checks";
import { isPriceChurnStorm } from "../scrapers/crawl/reidentification";
import { readPingoDoceDepartments } from "../scrapers/crawl/pingodoce";
import { formatHttpStats, httpStats, requireCrawlerContact, wireBytesOf } from "../scrapers/http";
import { compareWithBaseline, compareWithPrevious, previousRunFor, recordRun, rollingBaseline } from "../scrapers/crawl/history";
import { catalogueSizes, compareSizes, previousSizes } from "../scrapers/crawl/catalogue-size";
import { buildDailyReport, snapshotBefore, type DailyReport } from "../scrapers/crawl/daily-report";
import { deadPagesBelievable, pingoDoceProblems, type PingoDoceExtras } from "../scrapers/crawl/pingodoce-report";
import { escalate, renderReport, writeReport } from "../scrapers/crawl/render-report";
import { writeCrashReport } from "../scrapers/crawl/crash-report";
import type { SearchHit } from "../scrapers/search/types";
import { keepInCatalogue } from "../lib/catalogue-filter";
import { LeftOutTally, recordSections, sectionLines, sectionProblems } from "../scrapers/crawl/section-watch";
import { promotionLine, promotionWarning, tallyPromotions } from "../scrapers/crawl/promo-watch";
import { RUNS_BEFORE_ACCEPTING, judgeSitemap } from "../scrapers/crawl/sitemap-trust";

/**
 * Crawl Pingo Doce ONE PRODUCT PAGE AT A TIME - the route its robots.txt allows.
 *
 *   npm run crawl:pingodoce:nightly -- --dry               # sitemap only, no product fetches
 *   npm run crawl:pingodoce:nightly -- --limit=200         # a slice, stalest first
 *   npm run crawl:pingodoce:nightly -- --new               # only ids we have never seen
 *   npm run crawl:pingodoce:nightly                        # the whole food catalogue, ~3 h
 *
 * Pingo Doce used to be crawled through its listing grids (`npm run
 * crawl:pingodoce`), which robots.txt DISALLOWS on four separate rules; that
 * command is now only a short coverage check. This is the replacement, and it
 * returns more per product: the pack size, which is the one thing standing
 * between Pingo Doce and a per-kilo comparison.
 *
 * Named "nightly" to match the other two stores' full-catalogue commands
 * (renamed from crawl:pingodoce:products on 4 October 2026).
 *
 * Resumable by construction. `--limit` takes the stalest slice by
 * `lastCheckedAt`, so repeated partial runs march deterministically through the
 * catalogue instead of re-reading the front of it.
 *
 * A full run writes the same report as the other two stores (reports/,
 * OK/WARN/FAIL), since 22 October 2026; a --limit or --new slice writes none,
 * because "what changed" and "what disappeared" mean nothing for a slice.
 */

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}
function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

const pct = (n: number, of: number) => (of === 0 ? "0%" : `${((n / of) * 100).toFixed(1)}%`);

async function main() {
  requireCrawlerContact();
  const limitRaw = arg("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isInteger(limit) || (limit as number) < 1)) {
    console.error(`--limit must be a positive integer, got "${limitRaw}"`);
    process.exit(1);
  }
  const dry = flag("dry");
  const onlyNew = flag("new");
  const runStarted = Date.now();

  console.log("Reading Pingo Doce's sitemap...");
  const sitemap = await discoverPingoDoceProducts();

  for (const file of sitemap.perFile) {
    console.log(`  ${file.url.split("/").pop()}: ${file.entries} entries`);
  }
  console.log(
    `\n  food products:     ${sitemap.food.length}\n` +
      `  non-food skipped:  ${sitemap.nonFood} (never fetched)\n` +
      `  sub-sections skipped: ${sitemap.skipped} (supplements, pet food, ... - data/store-sections.ts)\n` +
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
    console.log(
      `\n  WARNING: ${sitemap.unknownSections.size} unknown section(s) - add them to PINGO_DOCE_SECTIONS` +
        " and decide them in data/store-sections.ts:"
    );
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

  // Read the previous state BEFORE anything writes over it: the report diffs
  // against it, and this is the only moment the old values exist.
  const fullRun = limit === undefined && !onlyNew;
  const before = fullRun ? await snapshotBefore("PINGO_DOCE") : null;
  const previousRun = await previousRunFor("PINGO_DOCE");
  const baseline = await rollingBaseline("PINGO_DOCE");

  // The store's own count of each food department, from the department's first
  // page: one request each, which robots.txt allows (the grids it disallows are
  // the pages after the first). Compared night over night, as Continente's and
  // Auchan's are; NOT against what we hold, because a department page counts
  // products cross-listed from elsewhere. Until 22 October 2026 this ran only by
  // hand (npm run crawl:pingodoce; code review M10). A department that cannot be
  // read is recorded and the run continues.
  const departmentCounts = fullRun ? await readPingoDoceDepartments() : [];
  // Keyed by the department's display name ("Mercearia"), the name every reader
  // looks it up by. Until 25 October 2026 it was keyed by the address word
  // ("mercearia"), so no lookup ever found a count and the night-over-night
  // comparison never ran, while the report said "unchanged" (assumption 3.10).
  const publishedCounts = new Map(
    departmentCounts.flatMap((c) => (c.published === null ? [] : [[c.department.label, c.published] as const]))
  );
  const departmentsUnread = departmentCounts
    .filter((c) => c.published === null)
    .map((c) => `${c.department.label}${c.error ? ` (${c.error})` : ""}`);
  if (fullRun) {
    console.log(`\nthe store's own counts: ${publishedCounts.size} of ${departmentCounts.length} departments read`);
  }

  // The sitemap-date test (sitemap-dates.ts): every product's fields before
  // the run writes over them, and each product's sitemap date if it has one.
  const fieldsBefore = await pageFieldsBefore("PINGO_DOCE");
  const writer = await openCatalogueWriter("PINGO_DOCE");
  const seenAt = writer.seenAt;
  const dates = await recordSitemapDates("PINGO_DOCE", sitemap.lastmod, seenAt);
  console.log(
    sitemap.lastmod.size === 0
      ? "\nsitemap dates: the sitemap gives none"
      : `\nsitemap dates: ${dates.changed.toLocaleString()} changed since the last run, ${dates.first.toLocaleString()} recorded for the first time`
  );
  const started = Date.now();

  // The sitemap is the store's whole tree, so this is a complete view of its
  // sections whatever slice of products is fetched below.
  const sectionChanges = await recordSections("PINGO_DOCE", sitemap.sections, new Date(), true);

  // Held products the sitemap files under a non-food section or a skipped
  // sub-section stop being tracked - no request needed, the URL settles it.
  // Unless too many at once (the non-food brake, brakes.ts): that is the store
  // renaming its sections or our reading breaking, so nothing is stopped.
  const liveHeld = await prisma.catalogueProduct.count({ where: { store: "PINGO_DOCE", delistedAt: null } });
  const nonFoodRefused: string[] = [];
  const bySection = await stopTrackingMovedOut("PINGO_DOCE", sitemap.excludedIds, liveHeld, new Date());
  if (bySection.refused) {
    nonFoodRefused.push(`moved out of a food section: ${bySection.refused}`);
    console.log(`  !! ${bySection.refused}`);
  }
  const stoppedBySection = bySection.stopped.length;
  if (stoppedBySection > 0) console.log(`  ${stoppedBySection} held product(s) are no longer in a food section; no longer tracked`);

  // A mixed-aisle product is kept only when its name is recognised as food,
  // which the page's real name settles; the URL cannot.
  const leftOut = new LeftOutTally();
  const leftOutIds: string[] = [];
  const kept = (products: SearchHit[]) =>
    products.filter((p) => {
      const decision = keepInCatalogue("PINGO_DOCE", p.category, p.name);
      leftOut.add(decision, p.name, p.category);
      if (!decision.keep) leftOutIds.push(p.id);
      return decision.keep;
    });

  const crawl = await fetchPingoDoceProducts(targets, {
    onBatch: (products) => writer.save(kept(products), "product pages"),
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
  const pageChanges = await recordPageChanges("PINGO_DOCE", fieldsBefore, seenAt);
  console.log(`\npage changes recorded: ${Object.entries(pageChanges).map(([f, n]) => `${f} ${n}`).join(", ") || "none"}`);
  const byName = await stopTrackingMovedOut("PINGO_DOCE", leftOutIds, liveHeld, new Date());
  if (byName.refused) {
    nonFoodRefused.push(`mixed-aisle names not recognised as food: ${byName.refused}`);
    console.log(`\n!! ${byName.refused}`);
  }
  const stoppedByName = byName.stopped.length;
  if (stoppedByName > 0) {
    console.log(`\n${stoppedByName} held mixed-aisle product(s) not recognised as food; no longer tracked`);
  }

  // A product Pingo Doce stops selling leaves its sitemap and is simply never
  // fetched again, so it used to stay "on sale" forever with its last price -
  // 180 of them on 18 October 2026, some priced in August. Now a product the
  // sitemap no longer lists, or whose page says it is gone, counts a dead
  // night; three in a row and it is delisted, as at the other two chains.
  // Unless an implausible share vanished at once, which means a broken list.
  const held = (
    await prisma.catalogueProduct.findMany({
      where: { store: "PINGO_DOCE", delistedAt: null },
      select: { storeProductId: true },
    })
  ).map((r) => r.storeProductId);
  const heldSet = new Set(held);
  const absent = missingFromList(held, sitemap.allIds);
  // Whether to believe the list, by the rule Continente uses (sitemap-trust.ts):
  // a shrunken list, a lost file, or too many held products missing makes it
  // suspect, and the same figures three nights running make it the new normal.
  // Until 22 October 2026 the missing-products guard never expired (code
  // review M3). Only a full run's verdict is recorded, so only full runs count.
  const sitemapEntries = sitemap.perFile.reduce((n, f) => n + f.entries, 0);
  const lastTrusted = await prisma.crawlRun.findFirst({
    where: { store: "PINGO_DOCE", sitemapTrusted: true },
    orderBy: { startedAt: "desc" },
    select: { sitemapEntries: true, sitemapFiles: true, startedAt: true },
  });
  const recentRuns = await prisma.crawlRun.findMany({
    where: {
      store: "PINGO_DOCE",
      sitemapEntries: { not: null },
      ...(lastTrusted ? { startedAt: { gt: lastTrusted.startedAt } } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: RUNS_BEFORE_ACCEPTING,
    select: { sitemapEntries: true, sitemapFiles: true, sitemapTrusted: true },
  });
  const trust = judgeSitemap({
    entries: sitemapEntries,
    files: sitemap.perFile.length,
    error: null,
    baseline:
      lastTrusted?.sitemapEntries != null && lastTrusted.sitemapFiles != null
        ? { entries: lastTrusted.sitemapEntries, files: lastTrusted.sitemapFiles }
        : null,
    // Runs from before the verdict was recorded say nothing either way, so they
    // count as believed: they cannot help a suspicion expire.
    recent: recentRuns.map((r) => ({ entries: r.sitemapEntries ?? 0, files: r.sitemapFiles ?? 0, trusted: r.sitemapTrusted ?? true })),
    extraSuspicion: absent.believable
      ? null
      : `${absent.missing.length.toLocaleString()} of the ${held.length.toLocaleString()} products we hold are missing from it, more than ${MAX_SHARE_MISSING * 100}%`,
  });
  if (sitemap.indexProblem) console.log(`\nWARNING: ${sitemap.indexProblem}`);
  if (trust.accepted) console.log(`\nsitemap: ${trust.accepted}`);
  const pageSaysGone = crawl.dead.map((d) => d.storeProductId).filter((id) => heldSet.has(id));
  // A page the reader cannot understand also counts as "gone", so a markup
  // change would make nearly every page gone at once, and three such nights
  // would delist the store. An implausible share is not counted (pingodoce-report.ts).
  const pagesBelieved = deadPagesBelievable(crawl.dead.length, targets.length);
  const deadTonight = [
    ...new Set([...(trust.trusted ? absent.missing : []), ...(pagesBelieved ? pageSaysGone : [])]),
  ];
  const { delisted } = await recordDead("PINGO_DOCE", deadTonight, new Date());
  console.log(
    `\nno longer listed: ${absent.missing.length} held product(s) missing from the sitemap` +
      (trust.trusted ? "" : ` - the list is not believed tonight: ${trust.distrust}`) +
      `; ${pageSaysGone.length} page(s) said gone` +
      (pagesBelieved ? "" : " - too many at once, so the pages are not believed tonight") +
      `; ${delisted.length} delisted after ${DEAD_NIGHTS_BEFORE_DELISTING} nights`
  );

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

  // Read before this run is recorded below, since both compare against the
  // newest recorded run. The same figures as the record: every page read.
  const runSections = crawl.results.map((r) => ({
    cgid: r.category.cgid,
    label: r.category.label,
    collected: r.products.length,
    expected: publishedCounts.get(r.category.label) ?? null,
  }));
  const runTotal = runSections.reduce((n, r) => n + r.collected, 0);
  const drift = fullRun
    ? [...(await compareWithPrevious("PINGO_DOCE", runTotal, runSections)), ...compareWithBaseline(baseline, runTotal, runSections)]
    : [];
  const sitemapPrevious =
    (
      await prisma.crawlRun.findFirst({
        where: { store: "PINGO_DOCE" },
        orderBy: { startedAt: "desc" },
        select: { sitemapEntries: true },
      })
    )?.sitemapEntries ?? null;
  const sizesBefore = await previousSizes(seenAt);
  const sizesNow = await catalogueSizes();

  // The run's own record, as the other two chains keep: how long it took, how
  // many requests, how many products per department. Until 18 October 2026
  // Pingo Doce kept none, so nobody could say how long its crawl takes. Only a
  // full run is recorded: a --limit or --new slice would make the next
  // comparison, and the next time estimate, meaningless.
  const durationMs = Date.now() - runStarted;
  if (fullRun) {
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
      "PINGO_DOCE",
      runTotal,
      runSections,
      {
        http: { ...stats, wireBytes: stats.wireBytes || null },
        seenAt: summary.seenAt,
        catalogueSizes: sizesNow,
        sitemapEntries,
        sitemapFiles: sitemap.perFile.length,
        sitemapTrusted: trust.trusted,
        sitemapPerFile: sitemap.perFile,
        sitemapUnparseable: sitemap.unparseable,
        durationMs,
      }
    );
  }
  console.log(`\nDone in ${(durationMs / 60000).toFixed(1)} min${fullRun ? " (run recorded)" : ""}.`);

  console.log(
    `\nprices: ${summary.prices.changed} changed, ${summary.prices.unchanged} held,` +
      ` ${summary.prices.opened} new, ${summary.prices.skipped} without a price`
  );
  const created = summary.summaries.reduce((n, s) => n + s.created, 0);
  const updated = summary.summaries.reduce((n, s) => n + s.updated, 0);
  console.log(`Done: ${created} product(s) created, ${updated} updated.`);

  // A misread promotion marker turns every promotion into a full price without
  // a single error; the count is the only sign (promo-watch.ts).
  const promotions = await tallyPromotions("PINGO_DOCE", summary.seenAt);
  const promotionProblem = promotionWarning(promotions);
  console.log(`\n${promotionLine(promotions)}`);
  if (promotionProblem) console.log(`WARN: ${promotionProblem}`);

  // Too many prices moving at once means the wrong number is being read
  // (brakes.ts). Pingo Doce had no such brake until 22 October 2026.
  const priced = summary.prices.changed + summary.prices.unchanged;
  const priceStorm = isPriceChurnStorm({ changed: summary.prices.changed, priced, complete: fullRun, store: "PINGO_DOCE" })
    ? `${summary.prices.changed.toLocaleString()} of ${priced.toLocaleString()} prices moved this run - more than ` +
      `30%. After several missed nights a change of promotions can do this; otherwise the price reader is probably ` +
      `reading the wrong number. NOTE: prices are written as the crawl runs, so these rows already exist and share ` +
      `this run's seenAt.`
    : null;
  if (priceStorm) console.log(`\nFAIL: ${priceStorm}`);

  if (!fullRun || !before) {
    console.log("\nA slice (--limit or --new): no report written - what changed and what disappeared mean nothing for a slice.");
    return;
  }

  const names = new Map([...before.byStoreProductId].map(([id, row]) => [id, row.name]));
  const extras: PingoDoceExtras = {
    sitemapFiles: sitemap.perFile.map((f) => ({ file: f.url.split("/").pop() ?? f.url, entries: f.entries })),
    sitemapPrevious,
    food: sitemap.food.length,
    nonFood: sitemap.nonFood,
    skippedSections: sitemap.skipped,
    fromMixed: sitemap.fromMixed,
    unfiled: sitemap.unfiled.length,
    unparseable: sitemap.unparseable,
    unparseableSamples: sitemap.unparseableSamples,
    unknownSections: [...sitemap.unknownSections].map(([section, count]) => ({ section, count })),
    targets: targets.length,
    fetched: crawl.fetched,
    withSize: crawl.withSize,
    unpriced: crawl.unpriced.length,
    unreachable: crawl.unreachable.length,
    unreachableSamples: crawl.unreachable.slice(0, 5).map((u) => ({ storeProductId: u.storeProductId, name: u.reason })),
    missingFromSitemap: absent.missing.length,
    sitemapBelieved: trust.trusted,
    sitemapDistrust: trust.distrust,
    sitemapAccepted: trust.accepted,
    sitemapIndexProblem: sitemap.indexProblem,
    deadPages: crawl.dead.length,
    deadPagesBelieved: pagesBelieved,
    delistedNow: delisted.length,
    delistedSamples: delisted.slice(0, 12).map((id) => ({ storeProductId: id, name: names.get(id) ?? id })),
    stoppedBySection,
    stoppedByName,
    nonFoodRefused,
    priceStorm,
    departmentsUnread,
  };

  // Only the products the catalogue kept: a mixed-aisle page whose name is not
  // food was read but never saved, and would otherwise count as "new" every night.
  const leftOutSet = new Set(leftOutIds);
  const keptResults = crawl.results.map((r) => ({ ...r, products: r.products.filter((p) => !leftOutSet.has(p.id)) }));

  let report: DailyReport = await buildDailyReport({
    store: "PINGO_DOCE",
    seenAt,
    before,
    results: keptResults,
    audit: { unknown: [], missing: [] },
    publishedCounts,
    prices: summary.prices,
    http: httpStats(),
    drift,
    shortSections: [],
    sitemapSlugs: [],
    sitemapUnknown: [],
    baseline: { runs: baseline.runs, since: baseline.since },
    previousRun,
    unpricedIsStock: true,
  });
  report = {
    ...report,
    pingoDoce: extras,
    catalogueByStore: compareSizes(sizesNow, sizesBefore),
    sections: sectionLines(sectionChanges, leftOut),
    promotions,
  };

  // Each escalate puts its message first, so the least serious go in first and
  // the FAILs last, leaving the worst at the top.
  const { fails, warnings } = pingoDoceProblems(extras);
  for (const problem of sectionProblems(sectionChanges)) report = escalate(report, "WARN", problem);
  if (promotionProblem) report = escalate(report, "WARN", promotionProblem);
  for (const w of [...warnings].reverse()) report = escalate(report, "WARN", w);
  for (const f of [...fails].reverse()) report = escalate(report, "FAIL", f);

  const explain = !flag("brief");
  const written = await writeReport(report, { explain });
  console.log(`\n${renderReport(report, { explain })}`);
  console.log(`\nreport written to ${written.text} and ${written.json}`);
  if (report.verdict === "FAIL") process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // A run that dies still leaves a report saying so; otherwise
    // reports/latest.md would go on showing an earlier night as this one.
    await writeCrashReport("PINGO_DOCE", e);
    await prisma.$disconnect();
    process.exit(1);
  });
