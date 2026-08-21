import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";
import { megabytes, totalStats, type HostStats } from "../http";
import type { CategoryAudit } from "./continente-categories";
import type { PriceHistorySummary } from "./price-history";
import type { CategoryResult } from "./types";

/**
 * The report a crawl writes about itself.
 *
 * The point is to make an unattended crawl trustworthy. A run that exits 0 is
 * not evidence it worked: the first Pingo Doce crawl exited 0 having collected
 * less than half the catalogue, and Continente's barcode extraction returned
 * null for months without anything noticing. So the report states what it
 * checked, not merely that it finished, and ends on a verdict something else
 * can act on.
 *
 * Everything here is derived from data the crawl already has or the database
 * already holds. The one thing the catalogue cannot answer for itself is "what
 * did we NOT see", which is why the run's timestamp is threaded through: a
 * product whose `lastSeenAt` did not advance is a product this crawl missed.
 */

/** How much a price must move to be worth showing as an outlier. */
const PRICE_MOVE = 0.5;
/** A price moving by more than this is almost certainly a parse bug, not a sale. */
const PRICE_ABSURD = 5;
/** Request time this much worse than last run suggests throttling. */
const SLOWDOWN = 2;
/** Examples carried per list; the counts are always exact, the samples are not. */
const SAMPLE = 12;

/**
 * Take examples from across the sections rather than the first N encountered.
 *
 * Crawl order is not a property of the data: taking the first twelve gave a
 * "new products" list that was entirely fruit and vegetables and a
 * "disappeared" list that was entirely wine, purely because Frescos is crawled
 * first and wines happen to sort last. A reader would take that for a pattern.
 */
function spread<T>(groups: Map<string, T[]>, limit: number): T[] {
  const queues = [...groups.values()].filter((g) => g.length > 0);
  const picked: T[] = [];
  for (let round = 0; picked.length < limit; round++) {
    let addedThisRound = false;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      picked.push(queue[round]);
      addedThisRound = true;
      if (picked.length === limit) return picked;
    }
    if (!addedThisRound) break;
  }
  return picked;
}

export type Verdict = "OK" | "WARN" | "FAIL";

export interface ProductNote {
  storeProductId: string;
  name: string;
  detail?: string;
}

export interface DailyReport {
  store: Store;
  runAt: string;
  verdict: Verdict;
  /** what pushed the verdict off OK, most serious first */
  problems: string[];

  /**
   * What this report was able to compare against. Without it, an empty drift
   * section and a `returned` of 0 read as reassurance when they may only mean
   * there was no baseline - the same dishonesty as an alarm that never fires.
   */
  baseline: { runs: number; since: string | null };

  scraper: {
    sections: {
      label: string;
      collected: number;
      expected: number | null;
      /// products this section skipped because an earlier section already had them
      duplicates: number;
      short: number;
    }[];
    requests: number;
    /**
     * HTML processed, i.e. page size AFTER decompression. NOT bandwidth: every
     * store serves gzip and Node's fetch asks for it without being told to, so
     * a Continente product page is ~1 MB here and ~159 KB on the wire.
     */
    megabytes: number;
    /** compressed megabytes actually transferred; null when unreported */
    transferredMegabytes: number | null;
    minutesFetching: number;
    retries: number;
    /** ratio against the previous run; null when there is nothing to compare */
    slowdown: number | null;
  };

  quality: {
    total: number;
    missingPrice: number;
    missingBrand: number;
    missingCategory: number;
    missingUrl: number;
  };

  catalogue: {
    seen: number;
    newProducts: number;
    disappeared: number;
    stillMissing: number;
    returned: number;
    samples: {
      newProducts: ProductNote[];
      disappeared: ProductNote[];
      returned: ProductNote[];
      moved: ProductNote[];
      renamed: ProductNote[];
    };
    moved: number;
    renamed: number;
  };

  prices: PriceHistorySummary & {
    movers: ProductNote[];
    absurd: ProductNote[];
  };

  categories: {
    published: number;
    crawled: number;
    unknown: { cgid: string; label: string; hitCount: number }[];
    missing: string[];
    /** the store's OWN published counts, versus what it published last run */
    publishedCountChanges: { label: string; was: number; now: number }[];
    /**
     * Cross-check against the category sitemap, a second and independent source.
     * If the homepage markup ever changes, the primary audit goes quiet - this
     * is what notices.
     */
    sitemapSlugs: number;
    sitemapUnknown: string[];
  };

  live: {
    trackedListingsMissing: ProductNote[];
    candidatePairsAffected: number;
  };

  drift: string[];

  /**
   * True when the crawl did not finish, so every count above describes nothing
   * rather than describing a healthy catalogue.
   */
  incomplete?: boolean;

  /**
   * Present when the run refreshed a SLICE of the catalogue rather than walking
   * it. The per-section coverage above is meaningless in that case - a run that
   * deliberately fetched 25 products has not "come up short" by 3,295 - so the
   * renderer shows this instead. See rotation-report.ts.
   */
  rotation?: import("./rotation-report").RotationExtras;

  /**
   * Present when the run also looked for products it had never seen - the
   * nightly run's phases 1 and 3. Answers whether the catalogue is COMPLETE,
   * which the sections above cannot: they only describe what we already held.
   */
  discovery?: import("./discovery-report").DiscoveryExtras;
}

/**
 * A read of the store's rows taken BEFORE the crawl saves, so the report can
 * diff against it. Everything the crawl writes - name, category, price,
 * lastSeenAt - is overwritten in place, so this is the only moment the previous
 * values exist.
 */
export interface BeforeSnapshot {
  byStoreProductId: Map<
    string,
    { name: string; categoryPath: string | null; price: number | null; lastSeenAt: Date }
  >;
}

export async function snapshotBefore(store: Store): Promise<BeforeSnapshot> {
  const rows = await prisma.catalogueProduct.findMany({
    where: { store },
    select: { storeProductId: true, name: true, categoryPath: true, price: true, lastSeenAt: true },
  });
  return {
    byStoreProductId: new Map(
      rows.map((r) => [
        r.storeProductId,
        { name: r.name, categoryPath: r.categoryPath, price: r.price, lastSeenAt: r.lastSeenAt },
      ])
    ),
  };
}

export interface ReportInput {
  store: Store;
  seenAt: Date;
  before: BeforeSnapshot;
  results: CategoryResult[];
  audit: CategoryAudit;
  publishedCounts: Map<string, number>;
  prices: PriceHistorySummary;
  http: HostStats[];
  drift: string[];
  shortSections: string[];
  sitemapSlugs: string[];
  sitemapUnknown: string[];
  baseline: { runs: number; since: Date | null };
  previousRun: {
    startedAt: Date;
    requests: number | null;
    fetchMs: number | null;
    sections: { label: string; expected: number | null }[];
  } | null;
}

export async function buildDailyReport(input: ReportInput): Promise<DailyReport> {
  const { store, seenAt, before, results, audit } = input;
  const seenIds = new Set(results.flatMap((r) => r.products.map((p) => p.id)));

  // --- what changed about individual products -------------------------------
  // Grouped by section so the examples can be spread across them rather than
  // taken in crawl order, which is not a property of the data.
  const newBySection = new Map<string, ProductNote[]>();
  const movedBySection = new Map<string, ProductNote[]>();
  const renamedBySection = new Map<string, ProductNote[]>();
  const returnedBySection = new Map<string, ProductNote[]>();
  const moversBySection = new Map<string, ProductNote[]>();
  const absurdBySection = new Map<string, ProductNote[]>();
  const push = (map: Map<string, ProductNote[]>, section: string, note: ProductNote) => {
    const bucket = map.get(section) ?? [];
    bucket.push(note);
    map.set(section, bucket);
  };
  let newCount = 0;
  let movedCount = 0;
  let renamedCount = 0;
  let returnedCount = 0;

  // A product is "returned" if the crawl saw it but its previous sighting
  // predates the last run - it was absent and is back. Distinguishing this from
  // a genuine new listing matters, because pagination instability makes
  // products flicker in and out, and a report that calls every flicker a
  // disappearance is one nobody reads.
  const previousCutoff = input.previousRun?.startedAt;

  for (const result of results) {
    const sectionLabel = result.category.label;
    for (const product of result.products) {
      const was = before.byStoreProductId.get(product.id);
      if (!was) {
        newCount++;
        push(newBySection, sectionLabel, { storeProductId: product.id, name: product.name });
        continue;
      }

      if (previousCutoff && was.lastSeenAt < previousCutoff) {
        returnedCount++;
        push(returnedBySection, sectionLabel, {
          storeProductId: product.id,
          name: product.name,
          detail: `last seen ${was.lastSeenAt.toISOString().slice(0, 16).replace("T", " ")}`,
        });
      }

      const nowCategory = product.category || null;
      if (was.categoryPath && nowCategory && was.categoryPath !== nowCategory) {
        movedCount++;
        push(movedBySection, sectionLabel, {
          storeProductId: product.id,
          name: product.name,
          detail: `${was.categoryPath} became ${nowCategory}`,
        });
      }

      if (was.name !== product.name) {
        renamedCount++;
        push(renamedBySection, sectionLabel, {
          storeProductId: product.id,
          name: product.name,
          detail: `was "${was.name}"`,
        });
      }

      if (was.price !== null && product.price !== null && was.price > 0) {
        const ratio = product.price / was.price;
        const move = Math.abs(ratio - 1);
        if (ratio >= PRICE_ABSURD || ratio <= 1 / PRICE_ABSURD) {
          push(absurdBySection, sectionLabel, {
            storeProductId: product.id,
            name: product.name,
            detail: `${was.price} to ${product.price}`,
          });
        } else if (move >= PRICE_MOVE) {
          push(moversBySection, sectionLabel, {
            storeProductId: product.id,
            name: product.name,
            detail: `${was.price} to ${product.price}`,
          });
        }
      }
    }
  }

  const newProducts = spread(newBySection, SAMPLE);
  const moved = spread(movedBySection, SAMPLE);
  const renamed = spread(renamedBySection, SAMPLE);
  const returned = spread(returnedBySection, SAMPLE);
  const movers = spread(moversBySection, SAMPLE);
  // Every implausible price is carried, not a sample: this is the check that
  // stands between a broken parser and a database of wrong prices, so the count
  // being exact matters more than the list being short.
  const absurd = [...absurdBySection.values()].flat();
  const absurdCount = absurd.length;

  // --- what the crawl did not see -------------------------------------------
  const missingRows = await prisma.catalogueProduct.findMany({
    where: { store, lastSeenAt: { lt: seenAt } },
    select: { storeProductId: true, name: true, lastSeenAt: true, categoryPath: true },
    orderBy: { lastSeenAt: "desc" },
  });
  const disappearedNow = missingRows.filter((r) => previousCutoff === undefined || r.lastSeenAt >= previousCutoff);
  const stillMissing = missingRows.length - disappearedNow.length;

  // --- data quality ---------------------------------------------------------
  const [total, missingPrice, missingBrand, missingCategory, missingUrl] = await Promise.all([
    prisma.catalogueProduct.count({ where: { store } }),
    prisma.catalogueProduct.count({ where: { store, price: null } }),
    prisma.catalogueProduct.count({ where: { store, OR: [{ brand: null }, { brand: "" }] } }),
    prisma.catalogueProduct.count({ where: { store, categoryPath: null } }),
    prisma.catalogueProduct.count({ where: { store, url: "" } }),
  ]);

  // --- what this does to the live site --------------------------------------
  const trackedListings = await prisma.storeListing.findMany({
    where: { store },
    select: { storeProductId: true, product: { select: { name: true } } },
  });
  const missingIds = new Set(missingRows.map((r) => r.storeProductId));
  const trackedListingsMissing = trackedListings
    .filter((l) => missingIds.has(l.storeProductId))
    .slice(0, SAMPLE)
    .map((l) => ({ storeProductId: l.storeProductId, name: l.product.name }));

  const missingProductIds = (
    await prisma.catalogueProduct.findMany({
      where: { store, lastSeenAt: { lt: seenAt } },
      select: { id: true },
    })
  ).map((r) => r.id);
  const candidatePairsAffected =
    missingProductIds.length === 0
      ? 0
      : await prisma.matchCandidate.count({
          where: { OR: [{ aId: { in: missingProductIds } }, { bId: { in: missingProductIds } }] },
        });

  // --- the store's own published counts, run over run -----------------------
  const publishedCountChanges: { label: string; was: number; now: number }[] = [];
  for (const previous of input.previousRun?.sections ?? []) {
    const now = input.publishedCounts.get(previous.label);
    if (previous.expected !== null && now !== undefined && now !== previous.expected) {
      publishedCountChanges.push({ label: previous.label, was: previous.expected, now });
    }
  }

  // --- requests -------------------------------------------------------------
  const http = totalStats(input.http);
  const previousPerRequest =
    input.previousRun?.fetchMs && input.previousRun.requests
      ? input.previousRun.fetchMs / input.previousRun.requests
      : null;
  const nowPerRequest = http.requests > 0 ? http.fetchMs / http.requests : null;
  const slowdown =
    previousPerRequest && nowPerRequest ? nowPerRequest / previousPerRequest : null;

  // --- verdict --------------------------------------------------------------
  // FAIL is reserved for "the data is wrong or the site is about to show
  // something wrong". Everything else that merely deserves a look is WARN.
  const problems: string[] = [];
  if (trackedListingsMissing.length > 0) {
    problems.push(
      `${trackedListingsMissing.length} tracked listing(s) missing from the catalogue - the live site may show a stale comparison`
    );
  }
  if (input.shortSections.length > 0) {
    problems.push(`section(s) came up short: ${input.shortSections.join(", ")}`);
  }
  if (audit.missing.length > 0) {
    problems.push(`configured categories no longer published: ${audit.missing.join(", ")}`);
  }
  if (absurdCount > 0) {
    problems.push(`${absurdCount} price(s) moved by more than ${PRICE_ABSURD}x - likely a parse bug`);
  }
  const fail = problems.length > 0;

  const warnings: string[] = [];
  if (audit.unknown.length > 0) {
    warnings.push(
      `${audit.unknown.length} category(ies) published but neither crawled nor known non-food: ${audit.unknown
        .map((c) => c.cgid)
        .join(", ")}`
    );
  }
  for (const d of input.drift) warnings.push(d);
  if (missingPrice > 0) warnings.push(`${missingPrice} product(s) have no price`);
  if (missingUrl > 0) warnings.push(`${missingUrl} product(s) have no url`);
  if (slowdown !== null && slowdown > SLOWDOWN) {
    warnings.push(`requests are ${slowdown.toFixed(1)}x slower than last run - possible throttling`);
  }
  if (http.retries > 0) warnings.push(`${http.retries} request(s) had to be retried`);
  problems.push(...warnings);

  return {
    store,
    runAt: seenAt.toISOString(),
    verdict: fail ? "FAIL" : warnings.length > 0 ? "WARN" : "OK",
    problems,
    baseline: {
      runs: input.baseline.runs,
      since: input.baseline.since ? input.baseline.since.toISOString() : null,
    },
    scraper: {
      sections: results.map((r) => ({
        label: r.category.label,
        collected: r.products.length,
        expected: r.expected ?? null,
        duplicates: r.duplicates ?? 0,
        short: r.expected ? Math.max(0, r.expected - (r.products.length + (r.duplicates ?? 0))) : 0,
      })),
      requests: http.requests,
      megabytes: megabytes(http.bytes) ?? 0,
      transferredMegabytes: megabytes(http.wireBytes),
      minutesFetching: Number((http.fetchMs / 60000).toFixed(1)),
      retries: http.retries,
      slowdown: slowdown === null ? null : Number(slowdown.toFixed(2)),
    },
    quality: { total, missingPrice, missingBrand, missingCategory, missingUrl },
    catalogue: {
      seen: seenIds.size,
      newProducts: newCount,
      disappeared: disappearedNow.length,
      stillMissing,
      returned: returnedCount,
      moved: movedCount,
      renamed: renamedCount,
      samples: {
        newProducts,
        disappeared: spread(
          disappearedNow.reduce((map, r) => {
            const section = (r.categoryPath ?? "(none)").split("/")[0];
            const bucket = map.get(section) ?? [];
            bucket.push({ storeProductId: r.storeProductId, name: r.name });
            map.set(section, bucket);
            return map;
          }, new Map<string, ProductNote[]>()),
          SAMPLE
        ),
        returned,
        moved,
        renamed,
      },
    },
    prices: { ...input.prices, movers, absurd },
    categories: {
      published: audit.unknown.length + audit.missing.length + input.publishedCounts.size,
      crawled: results.length,
      unknown: audit.unknown.map((c) => ({ cgid: c.cgid, label: c.label, hitCount: c.hitCount })),
      missing: audit.missing,
      publishedCountChanges,
      sitemapSlugs: input.sitemapSlugs.length,
      sitemapUnknown: input.sitemapUnknown,
    },
    live: { trackedListingsMissing, candidatePairsAffected },
    drift: input.drift,
  };
}

/**
 * A report for a crawl that did not finish.
 *
 * The run you most need a written record of is the one that broke, and until
 * now that was the one run that produced nothing: the report was built after a
 * successful crawl, so a category answering HTTP 500 - which is exactly how a
 * renamed category shows up - left an exit code and no explanation.
 *
 * Carries whatever was established before the failure, which is often the
 * useful part: the category audit runs first, so a report can say "the crawl
 * died AND the store stopped publishing `mercearias`" rather than leaving the
 * two facts to be connected by hand.
 */
export function buildFailureReport(input: {
  store: Store;
  seenAt: Date;
  error: unknown;
  audit: CategoryAudit | null;
  http: HostStats[];
  baseline: { runs: number; since: Date | null };
}): DailyReport {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const problems = [`the crawl did not finish: ${message}`];

  if (input.audit?.missing.length) {
    problems.push(
      `configured categories no longer published: ${input.audit.missing.join(", ")} ` +
        `- a likely cause of the failure above`
    );
  }
  if (input.audit?.unknown.length) {
    problems.push(
      `categories published but neither crawled nor known non-food: ${input.audit.unknown
        .map((c) => c.cgid)
        .join(", ")}`
    );
  }

  const http = totalStats(input.http);

  return {
    store: input.store,
    runAt: input.seenAt.toISOString(),
    verdict: "FAIL",
    problems,
    baseline: {
      runs: input.baseline.runs,
      since: input.baseline.since ? input.baseline.since.toISOString() : null,
    },
    scraper: {
      sections: [],
      requests: http.requests,
      megabytes: megabytes(http.bytes) ?? 0,
      transferredMegabytes: megabytes(http.wireBytes),
      minutesFetching: Number((http.fetchMs / 60000).toFixed(1)),
      retries: http.retries,
      slowdown: null,
    },
    // Nothing was saved, so nothing is asserted about the catalogue. Zeroes here
    // would read as "checked and fine".
    quality: { total: 0, missingPrice: 0, missingBrand: 0, missingCategory: 0, missingUrl: 0 },
    catalogue: {
      seen: 0,
      newProducts: 0,
      disappeared: 0,
      stillMissing: 0,
      returned: 0,
      moved: 0,
      renamed: 0,
      samples: { newProducts: [], disappeared: [], returned: [], moved: [], renamed: [] },
    },
    prices: { unchanged: 0, changed: 0, opened: 0, skipped: 0, movers: [], absurd: [] },
    categories: {
      published: input.audit ? input.audit.unknown.length + input.audit.missing.length : 0,
      crawled: 0,
      unknown: input.audit?.unknown.map((c) => ({ cgid: c.cgid, label: c.label, hitCount: c.hitCount })) ?? [],
      missing: input.audit?.missing ?? [],
      publishedCountChanges: [],
      sitemapSlugs: 0,
      sitemapUnknown: [],
    },
    live: { trackedListingsMissing: [], candidatePairsAffected: 0 },
    drift: [],
    incomplete: true,
  };
}
