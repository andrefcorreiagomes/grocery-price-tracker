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
 * Upsert crawled products into CatalogueProduct by (store, storeProductId), so
 * both the Continente and Pingo Doce runners share one save path. Listing data
 * only - name, brand, categoryPath, price, url; ean/size are left to enrichment.
 * On an existing row, refreshes those fields and `lastSeenAt`; leaves
 * firstSeenAt, enrichedAt, ean and size untouched.
 */
export async function persistCatalogue(
  store: Store,
  results: CategoryResult[]
): Promise<PersistSummary[]> {
  const summaries: PersistSummary[] = [];
  for (const { category, products } of results) {
    let created = 0;
    let updated = 0;
    for (const p of products) {
      const existing = await prisma.catalogueProduct.findUnique({
        where: { store_storeProductId: { store, storeProductId: p.id } },
        select: { id: true },
      });
      await prisma.catalogueProduct.upsert({
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
      });
      if (existing) updated++;
      else created++;
    }
    summaries.push({ label: category.label, total: products.length, created, updated });
  }
  return summaries;
}
