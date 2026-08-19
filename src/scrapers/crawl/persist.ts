import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";
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

/**
 * Upsert crawled products into CatalogueProduct by (store, storeProductId), so
 * all three runners share one save path. Listing data only - name, brand,
 * categoryPath, price, url; ean/size are left to enrichment. On an existing row,
 * refreshes those fields and `lastSeenAt`; leaves firstSeenAt, enrichedAt, ean
 * and size untouched.
 *
 * Whether a row is new is decided from one up-front read of the store's existing
 * ids rather than a lookup before each upsert, and the upserts go out in
 * batches. A full three-store crawl saves ~75,000 products, which cost ~150,000
 * individually-committed queries before.
 */
export async function persistCatalogue(
  store: Store,
  results: CategoryResult[]
): Promise<PersistSummary[]> {
  const known = new Set(
    (
      await prisma.catalogueProduct.findMany({
        where: { store },
        select: { storeProductId: true },
      })
    ).map((row) => row.storeProductId)
  );

  const summaries: PersistSummary[] = [];

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
      await prisma.$transaction(
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
            },
            update: {
              name: p.name,
              brand: p.brand,
              categoryPath: p.category || null,
              price: p.price,
              url: p.url,
              lastSeenAt: new Date(),
            },
          })
        )
      );
    }

    summaries.push({ label: category.label, total: products.length, created, updated });
  }

  return summaries;
}
