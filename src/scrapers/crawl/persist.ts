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
export interface CatalogueWriter {
  /** the instant this whole run stamps on everything it saves */
  seenAt: Date;
  /** upsert one batch; safe to call repeatedly as the crawl proceeds */
  save(products: SearchHit[], label: string): Promise<void>;
  /** merged counts across every batch saved */
  finish(): PersistResult;
}

export async function openCatalogueWriter(store: Store): Promise<CatalogueWriter> {
  // One instant for the whole run, so a crawl lands at a single point in time
  // rather than smeared across however long it took.
  const seenAt = new Date();

  const known = new Set(
    (
      await prisma.catalogueProduct.findMany({
        where: { store },
        select: { storeProductId: true },
      })
    ).map((row) => row.storeProductId)
  );

  const byLabel = new Map<string, PersistSummary>();
  const priceTotals: PriceHistorySummary = {
    opened: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
  };

  return {
    seenAt,

    async save(products, label) {
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
                // not delisted, however many nights it was missing.
                deadCount: 0,
                delistedAt: null,
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
    },

    finish() {
      return { summaries: [...byLabel.values()], prices: priceTotals, seenAt };
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
