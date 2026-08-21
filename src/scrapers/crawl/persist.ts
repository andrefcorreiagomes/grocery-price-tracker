import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";
import { recordPrices, type PriceHistorySummary } from "./price-history";
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
 */
export async function persistCatalogue(
  store: Store,
  results: CategoryResult[]
): Promise<PersistResult> {
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

  const summaries: PersistSummary[] = [];
  const observations: { productId: string; price: number | null }[] = [];

  for (const { category, products } of results) {
    let created = 0;
    let updated = 0;
    for (const p of products) {
      if (known.has(p.id)) {
        updated++;
      } else {
        created++;
        known.add(p.id); // so a repeat later in the same run counts as an update
      }
    }

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
            },
            update: {
              name: p.name,
              brand: p.brand,
              categoryPath: p.category || null,
              price: p.price,
              url: p.url,
              lastSeenAt: seenAt,
            },
            select: { id: true, price: true },
          })
        )
      );

      for (const row of saved) {
        observations.push({ productId: row.id, price: row.price });
      }
    }

    summaries.push({ label: category.label, total: products.length, created, updated });
  }

  const prices = await recordPrices(observations, seenAt);

  return { summaries, prices, seenAt };
}
