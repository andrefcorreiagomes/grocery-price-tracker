import { prisma } from "../../lib/db";
import { matchableEan } from "../../lib/matching";
import type { Store } from "@/generated/prisma/client";
import { recordPrices, type PriceHistorySummary } from "./price-history";
import type { SearchHit } from "../search/types";
import type { CategoryResult } from "./types";

export interface PersistSummary {
  label: string;
  total: number;
  created: number;
  updated: number;
}

/**
 * How many upserts to send per transaction. SQLite commits every statement it is
 * given on its own unless they are wrapped, and that commit - not the write - is
 * what costs. Batching keeps the win without holding the single write lock for
 * the length of a whole department.
 */
const CHUNK = 500;

export interface PersistResult {
  summaries: PersistSummary[];
  prices: PriceHistorySummary;
  /**
   * Products whose id arrived carrying a different barcode than the row holds -
   * held aside, unwritten, for the caller to archive once the brakes have
   * cleared. Empty on every normal run.
   */
  swaps: IdentitySwap[];
  /** rows whose stored barcode stopped being readable this run */
  barcodesLost: number;
  /** rows where a stored barcode could be compared at all - the denominator */
  barcodesCompared: number;
  /**
   * The single instant this run stamped on everything it saw. The daily report
   * needs it to ask the only question the catalogue cannot answer for itself:
   * which products did this crawl NOT see?
   */
  seenAt: Date;
}

/**
 * Barcode and size, but only from a source that could actually know them.
 *
 * A listing crawl leaves these `undefined`, and undefined fields are omitted
 * from the write - so a fast crawl cannot erase a barcode that a product-page
 * crawl established. A product-page crawl sets them, including to null, because
 * there it means "this page has no barcode" rather than "I did not look".
 */
function enrichment(p: {
  ean?: string | null;
  packageSize?: number | null;
  unit?: string | null;
}) {
  if (p.ean === undefined && p.packageSize === undefined) return {};
  return {
    ean: p.ean ?? null,
    eanNormalized: matchableEan(p.ean),
    packageSize: p.packageSize ?? null,
    unit: p.unit ?? null,
    enrichedAt: new Date(),
  };
}

/**
 * A save path held open for the length of a crawl, so results can be written as
 * they arrive instead of all at the end.
 *
 * The compliant Continente crawler runs for about five hours. Accumulating five
 * hours of results in memory and writing once, at the end, means a dropped
 * connection at hour four loses the whole night. Saving every batch caps that
 * loss at a few minutes, and costs nothing: the same number of transactions, in
 * the same size, just spread across the run.
 *
 * Two things must still happen exactly once per run, which is why this is opened
 * rather than called:
 *
 *   - ONE `seenAt`. The report answers "which products did this run not see?" by
 *     comparing `lastSeenAt` against the run's instant. Per-batch timestamps
 *     would leave that question with no single answer.
 *   - ONE read of the existing ids. "Is this product new?" has to be judged
 *     against the table as it was BEFORE the run; re-reading per batch would
 *     make products created by batch 3 look pre-existing to batch 4.
 */
/**
 * A product arriving under an id that already belongs to a DIFFERENT product,
 * proven by the barcode changing from one real value to another.
 *
 * Held aside rather than written. The decision to archive needs whole-run
 * totals - a thousand of these at once means the barcode reader broke, not that
 * a thousand products swapped - but batches are written as they arrive. Upsert
 * it now and the old row's name, price and category are gone before the brake
 * can decide, so the eventual tombstone would carry the impostor's data.
 */
export interface IdentitySwap {
  storeProductId: string;
  /** the barcode the row held before this run */
  previousEan: string;
  /** what arrived under the same id */
  incomingEan: string;
  /** the incoming product, unwritten - the caller inserts it after archiving */
  incoming: SearchHit;
  /** which section it arrived in, so the summary can still account for it */
  label: string;
}

export interface CatalogueWriter {
  /** the instant this whole run stamps on everything it saves */
  seenAt: Date;
  /** upsert one batch; safe to call repeatedly as the crawl proceeds */
  save(products: SearchHit[], label: string): Promise<void>;
  /**
   * Write products whose identity swap has already been resolved - the old row
   * archived under a retired id, leaving this one free. Skips swap detection,
   * which would otherwise hold the same product aside forever: the pre-run
   * barcode map still remembers the id's previous owner.
   */
  saveResolved(products: SearchHit[], label: string): Promise<void>;
  /** merged counts across every batch saved */
  finish(): PersistResult;
}

export async function openCatalogueWriter(store: Store): Promise<CatalogueWriter> {
  // One instant for the whole run, so a crawl lands at a single point in time
  // rather than smeared across however long it took.
  const seenAt = new Date();

  // The pre-run barcode of every row, read in the same pass as the ids. This is
  // the only moment it exists: the upsert overwrites it, so a swap is
  // undetectable a millisecond later.
  const previousEan = new Map<string, string | null>();
  const known = new Set(
    (
      await prisma.catalogueProduct.findMany({
        where: { store },
        select: { storeProductId: true, eanNormalized: true },
      })
    ).map((row) => {
      previousEan.set(row.storeProductId, row.eanNormalized);
      return row.storeProductId;
    })
  );

  const byLabel = new Map<string, PersistSummary>();
  const priceTotals: PriceHistorySummary = {
    opened: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
  };
  const swaps: IdentitySwap[] = [];
  let barcodesLost = 0;
  let barcodesCompared = 0;

  /**
   * Remove products whose id already belongs to a different product, holding
   * them aside unwritten. Comparing BEFORE the upsert is the whole point: the
   * write overwrites the stored barcode, so a swap is undetectable afterwards.
   */
  function withoutSwaps(incoming: SearchHit[], label: string): SearchHit[] {
    const kept: SearchHit[] = [];
    for (const p of incoming) {
      const stored = previousEan.get(p.id);
      const arriving = matchableEan(p.ean);

      // `undefined` means the row did not exist before this run; a listing crawl
      // leaves `ean` undefined, meaning "this source could not know". Neither is
      // evidence of anything.
      if (stored !== undefined && stored !== null && p.ean !== undefined) {
        barcodesCompared++;
        if (arriving === null) {
          // A barcode we held has stopped being readable. Far likelier to be our
          // parser than a real product change, so it never archives anything -
          // it is only counted, and a mass occurrence fails the run.
          barcodesLost++;
        } else if (arriving !== stored) {
          swaps.push({
            storeProductId: p.id,
            previousEan: stored,
            incomingEan: arriving,
            incoming: p,
            label,
          });
          continue; // held aside: not written this run
        }
      }
      kept.push(p);
    }
    return kept;
  }

  /** The upsert itself, shared by both entry points. */
  async function write(products: SearchHit[], label: string): Promise<void> {
      const summary = byLabel.get(label) ?? { label, total: 0, created: 0, updated: 0 };
      for (const p of products) {
        summary.total++;
        if (known.has(p.id)) {
          summary.updated++;
        } else {
          summary.created++;
          known.add(p.id); // so a repeat later in the same run counts as an update
        }
      }
      byLabel.set(label, summary);

      const observations: { productId: string; price: number | null }[] = [];
      for (let i = 0; i < products.length; i += CHUNK) {
        // The transaction returns the upserted rows, so ids for products created
        // just now are available without a second read.
        const saved = await prisma.$transaction(
          products.slice(i, i + CHUNK).map((p) =>
            prisma.catalogueProduct.upsert({
              where: { store_storeProductId: { store, storeProductId: p.id } },
              create: {
                store,
                storeProductId: p.id,
                name: p.name,
                brand: p.brand,
                categoryPath: p.category || null,
                price: p.price,
                url: p.url,
                firstSeenAt: seenAt,
                lastSeenAt: seenAt,
                lastCheckedAt: seenAt,
                ...enrichment(p),
              },
              update: {
                name: p.name,
                brand: p.brand,
                categoryPath: p.category || null,
                price: p.price,
                url: p.url,
                lastSeenAt: seenAt,
                lastCheckedAt: seenAt,
                // Answering at all clears a delisting: a product that returns is
                // not delisted, however many nights it was missing. Seeing it in
                // a grid also means it is back in stock, so any "unavailable"
                // marker is stale.
                deadCount: 0,
                delistedAt: null,
                unavailableAt: null,
                ...enrichment(p),
              },
              select: { id: true, price: true },
            })
          )
        );

        for (const row of saved) {
          observations.push({ productId: row.id, price: row.price });
        }
      }

      const prices = await recordPrices(observations, seenAt);
      priceTotals.opened += prices.opened;
      priceTotals.changed += prices.changed;
      priceTotals.unchanged += prices.unchanged;
      priceTotals.skipped += prices.skipped;
  }

  return {
    seenAt,
    save: (products, label) => write(withoutSwaps(products, label), label),
    saveResolved: (products, label) => write(products, label),
    finish() {
      return {
        summaries: [...byLabel.values()],
        prices: priceTotals,
        seenAt,
        swaps,
        barcodesLost,
        barcodesCompared,
      };
    },
  };
}

/**
 * Upsert crawled products into CatalogueProduct by (store, storeProductId), so
 * all three runners share one save path. Listing data only - name, brand,
 * categoryPath, price, url; ean/size are left to enrichment. On an existing row,
 * refreshes those fields and `lastSeenAt`; leaves firstSeenAt, enrichedAt, ean
 * and size untouched.
 *
 * Whether a row is new is decided from one up-front read of the store's existing
 * rows rather than a lookup before each upsert, and the upserts go out in
 * batches. A full three-store crawl saves ~75,000 products, which cost ~150,000
 * individually-committed queries before.
 *
 * It also records the price into `CataloguePrice`, which is why this reads the
 * existing price as well as the id: the crawl already knows every product's
 * price, and overwriting the column without keeping it threw away a daily
 * reading we had already paid the requests for.
 *
 * The one-shot form, for crawls that finish fast enough to save at the end. The
 * nightly Continente run opens the writer directly instead.
 */
export async function persistCatalogue(
  store: Store,
  results: CategoryResult[]
): Promise<PersistResult> {
  const writer = await openCatalogueWriter(store);
  for (const { category, products } of results) {
    await writer.save(products, category.label);
  }
  return writer.finish();
}
