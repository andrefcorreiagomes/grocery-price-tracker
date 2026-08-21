import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";
import type { HostStats } from "../http";
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
    megabytes: number;
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
  };

  live: {
    trackedListingsMissing: ProductNote[];
    candidatePairsAffected: number;
  };

  drift: string[];
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
  const newProducts: ProductNote[] = [];
  const moved: ProductNote[] = [];
  const renamed: ProductNote[] = [];
  const movers: ProductNote[] = [];
  const absurd: ProductNote[] = [];
  const returned: ProductNote[] = [];
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
    for (const product of result.products) {
      const was = before.byStoreProductId.get(product.id);
      if (!was) {
        if (newProducts.length < SAMPLE) {
          newProducts.push({ storeProductId: product.id, name: product.name });
        }
        continue;
      }

      if (previousCutoff && was.lastSeenAt < previousCutoff) {
        returnedCount++;
        if (returned.length < SAMPLE) {
          returned.push({
            storeProductId: product.id,
            name: product.name,
            detail: `last seen ${was.lastSeenAt.toISOString().slice(0, 16).replace("T", " ")}`,
          });
        }
      }

      const nowCategory = product.category || null;
      if (was.categoryPath && nowCategory && was.categoryPath !== nowCategory) {
        movedCount++;
        if (moved.length < SAMPLE) {
          moved.push({
            storeProductId: product.id,
            name: product.name,
            detail: `${was.categoryPath} became ${nowCategory}`,
          });
        }
      }

      if (was.name !== product.name) {
        renamedCount++;
        if (renamed.length < SAMPLE) {
          renamed.push({ storeProductId: product.id, name: product.name, detail: `was "${was.name}"` });
        }
      }

      if (was.price !== null && product.price !== null && was.price > 0) {
        const ratio = product.price / was.price;
        const move = Math.abs(ratio - 1);
        if (ratio >= PRICE_ABSURD || ratio <= 1 / PRICE_ABSURD) {
          if (absurd.length < SAMPLE) {
            absurd.push({
              storeProductId: product.id,
              name: product.name,
              detail: `${was.price} to ${product.price}`,
            });
          }
        } else if (move >= PRICE_MOVE && movers.length < SAMPLE) {
          movers.push({
            storeProductId: product.id,
            name: product.name,
            detail: `${was.price} to ${product.price}`,
          });
        }
      }
    }
  }

  // --- what the crawl did not see -------------------------------------------
  const missingRows = await prisma.catalogueProduct.findMany({
    where: { store, lastSeenAt: { lt: seenAt } },
    select: { storeProductId: true, name: true, lastSeenAt: true },
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
  const http = input.http.reduce(
    (acc, h) => ({
      requests: acc.requests + h.requests,
      bytes: acc.bytes + h.bytes,
      fetchMs: acc.fetchMs + h.fetchMs,
      retries: acc.retries + h.retries,
    }),
    { requests: 0, bytes: 0, fetchMs: 0, retries: 0 }
  );
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
  if (absurd.length > 0) {
    problems.push(`${absurd.length} price(s) moved by more than ${PRICE_ABSURD}x - likely a parse bug`);
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
    scraper: {
      sections: results.map((r) => ({
        label: r.category.label,
        collected: r.products.length,
        expected: r.expected ?? null,
        duplicates: r.duplicates ?? 0,
        short: r.expected ? Math.max(0, r.expected - (r.products.length + (r.duplicates ?? 0))) : 0,
      })),
      requests: http.requests,
      megabytes: Number((http.bytes / 1024 / 1024).toFixed(1)),
      minutesFetching: Number((http.fetchMs / 60000).toFixed(1)),
      retries: http.retries,
      slowdown: slowdown === null ? null : Number(slowdown.toFixed(2)),
    },
    quality: { total, missingPrice, missingBrand, missingCategory, missingUrl },
    catalogue: {
      seen: seenIds.size,
      newProducts: results.reduce(
        (n, r) => n + r.products.filter((p) => !before.byStoreProductId.has(p.id)).length,
        0
      ),
      disappeared: disappearedNow.length,
      stillMissing,
      returned: returnedCount,
      moved: movedCount,
      renamed: renamedCount,
      samples: {
        newProducts,
        disappeared: disappearedNow.slice(0, SAMPLE).map((r) => ({
          storeProductId: r.storeProductId,
          name: r.name,
        })),
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
    },
    live: { trackedListingsMissing, candidatePairsAffected },
    drift: input.drift,
  };
}
