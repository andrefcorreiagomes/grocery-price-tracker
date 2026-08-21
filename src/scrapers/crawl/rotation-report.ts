import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";
import type { HostStats } from "../http";
import type { DailyReport, ProductNote } from "./daily-report";
import type { PriceHistorySummary } from "./price-history";

/**
 * The report for a crawl that refreshes a SLICE of the catalogue, rather than
 * walking all of it.
 *
 * It shares the artefact format with the full-coverage report - same file, same
 * verdict, same JSON - but the questions worth asking are different, and asking
 * the wrong ones would be actively misleading. "Frescos: 25 collected of 3,320
 * listed" reads as a catastrophic shortfall when the run deliberately fetched
 * twenty-five products.
 *
 * What a rotation has to answer instead:
 *
 *   - is the whole catalogue still being reached, or is a corner going stale?
 *   - at this rate, how long until everything has been refreshed?
 *   - what did we learn that only a product page can tell us?
 *
 * That last one is this crawler's advantage. A listing crawl infers a product
 * is gone from its absence; here a delisted product answers with a dead page,
 * which is a fact rather than an inference. And every fetch also yields the
 * barcode and package size, so enrichment coverage climbs run over run.
 */

/** Examples carried per list. */
const SAMPLE = 12;

export interface RotationInput {
  store: Store;
  complete: boolean;
  seenAt: Date;
  refreshed: number;
  /** pages that returned no product: confirmed delistings, not guesses */
  dead: number;
  deadSamples: ProductNote[];
  nonFood: number;
  prices: PriceHistorySummary;
  http: HostStats[];
  publishedCounts: Map<string, number>;
  newProducts: ProductNote[];
  newCount: number;
}

export interface RotationExtras {
  /**
   * Whether this run attempted the WHOLE catalogue. A complete pass can answer
   * what changed - new, disappeared, moved, renamed - because it looked at
   * everything; a limited pass cannot, and must not print zeros as though it
   * had. The renderer keys off this, not off the presence of these extras.
   */
  complete: boolean;
  refreshedThisRun: number;
  /** how long ago each product was last confirmed, in buckets */
  staleness: { today: number; week: number; month: number; older: number };
  /** at this run's rate, days until every product has been refreshed */
  daysToFullCoverage: number | null;
  oldestSeenAt: string | null;
  confirmedDelisted: number;
  deadSamples: ProductNote[];
  enrichment: { total: number; withBarcode: number; withSize: number };
  /** our catalogue against the count each section publishes for itself */
  sections: { label: string; ours: number; published: number | null }[];
}

const DAY = 86_400_000;

export async function buildRotationReport(input: RotationInput): Promise<DailyReport> {
  const { store, seenAt } = input;
  const now = seenAt.getTime();

  const all = await prisma.catalogueProduct.findMany({
    where: { store },
    select: { lastSeenAt: true, categoryPath: true, ean: true, packageSize: true },
  });

  const staleness = { today: 0, week: 0, month: 0, older: 0 };
  const bySection = new Map<string, number>();
  let withBarcode = 0;
  let withSize = 0;
  let oldest: Date | null = null;

  for (const p of all) {
    const age = now - p.lastSeenAt.getTime();
    if (age < DAY) staleness.today++;
    else if (age < 7 * DAY) staleness.week++;
    else if (age < 30 * DAY) staleness.month++;
    else staleness.older++;

    if (p.ean) withBarcode++;
    if (p.packageSize !== null) withSize++;
    if (!oldest || p.lastSeenAt < oldest) oldest = p.lastSeenAt;

    const section = (p.categoryPath ?? "(sem categoria)").split("/")[0].trim();
    bySection.set(section, (bySection.get(section) ?? 0) + 1);
  }

  // At this run's rate, how long to reach everything? The honest denominator is
  // what this run actually refreshed, so a run that fetched nothing reports
  // "never" rather than dividing by zero and claiming instant coverage.
  const daysToFullCoverage =
    input.refreshed > 0 ? Math.ceil(all.length / input.refreshed) : null;

  const sections = [...bySection.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, ours]) => ({
      label,
      ours,
      published: input.publishedCounts.get(label) ?? null,
    }));

  const rotation: RotationExtras = {
    complete: input.complete,
    refreshedThisRun: input.refreshed,
    staleness,
    daysToFullCoverage,
    oldestSeenAt: oldest ? oldest.toISOString() : null,
    confirmedDelisted: input.dead,
    deadSamples: input.deadSamples.slice(0, SAMPLE),
    enrichment: { total: all.length, withBarcode, withSize },
    sections,
  };

  // Live-site impact: the same question the full report asks, because it is the
  // only part a visitor can see go wrong.
  const trackedListings = await prisma.storeListing.findMany({
    where: { store },
    select: { storeProductId: true, product: { select: { name: true } } },
  });
  const missing = new Set(
    (
      await prisma.catalogueProduct.findMany({
        where: { store, lastSeenAt: { lt: new Date(now - 7 * DAY) } },
        select: { storeProductId: true },
      })
    ).map((r) => r.storeProductId)
  );
  const trackedListingsMissing = trackedListings
    .filter((l) => missing.has(l.storeProductId))
    .slice(0, SAMPLE)
    .map((l) => ({ storeProductId: l.storeProductId, name: l.product.name }));

  // Measured, not assumed. Reporting zeros here would claim the fields were
  // checked and found complete, which is a stronger statement than "not looked
  // at" and the wrong one.
  const [missingPrice, missingBrand, missingCategory, missingUrl] = await Promise.all([
    prisma.catalogueProduct.count({ where: { store, price: null } }),
    prisma.catalogueProduct.count({ where: { store, OR: [{ brand: null }, { brand: "" }] } }),
    prisma.catalogueProduct.count({ where: { store, categoryPath: null } }),
    prisma.catalogueProduct.count({ where: { store, url: "" } }),
  ]);

  const http = input.http.reduce(
    (a, h) => ({
      requests: a.requests + h.requests,
      bytes: a.bytes + h.bytes,
      fetchMs: a.fetchMs + h.fetchMs,
      retries: a.retries + h.retries,
    }),
    { requests: 0, bytes: 0, fetchMs: 0, retries: 0 }
  );

  const problems: string[] = [];
  if (trackedListingsMissing.length > 0) {
    problems.push(
      `${trackedListingsMissing.length} tracked listing(s) not confirmed in over a week - the live site may be showing a stale price`
    );
  }
  const fail = problems.length > 0;

  const warnings: string[] = [];
  if (staleness.older > 0) {
    warnings.push(`${staleness.older} product(s) have not been confirmed in over a month`);
  }
  if (daysToFullCoverage !== null && daysToFullCoverage > 14) {
    warnings.push(
      `at this rate a full pass takes ${daysToFullCoverage} days; prices will be that stale at worst`
    );
  }
  if (input.dead > 0) {
    warnings.push(`${input.dead} product(s) are confirmed delisted - their pages return nothing`);
  }
  if (http.retries > 0) warnings.push(`${http.retries} request(s) had to be retried`);
  problems.push(...warnings);

  return {
    store,
    runAt: seenAt.toISOString(),
    verdict: fail ? "FAIL" : warnings.length > 0 ? "WARN" : "OK",
    problems,
    baseline: { runs: 0, since: null },
    scraper: {
      sections: [],
      requests: http.requests,
      megabytes: Number((http.bytes / 1024 / 1024).toFixed(1)),
      minutesFetching: Number((http.fetchMs / 60000).toFixed(1)),
      retries: http.retries,
      slowdown: null,
    },
    quality: { total: all.length, missingPrice, missingBrand, missingCategory, missingUrl },
    catalogue: {
      seen: input.refreshed,
      newProducts: input.newCount,
      disappeared: input.dead,
      stillMissing: 0,
      returned: 0,
      moved: 0,
      renamed: 0,
      samples: {
        newProducts: input.newProducts.slice(0, SAMPLE),
        disappeared: rotation.deadSamples,
        returned: [],
        moved: [],
        renamed: [],
      },
    },
    prices: { ...input.prices, movers: [], absurd: [] },
    categories: {
      published: input.publishedCounts.size,
      crawled: sections.length,
      unknown: [],
      missing: [],
      publishedCountChanges: [],
      sitemapSlugs: 0,
      sitemapUnknown: [],
    },
    live: { trackedListingsMissing, candidatePairsAffected: 0 },
    drift: [],
    rotation,
  };
}
