import { prisma } from "./db";
import { STORE_LIST } from "./stores";

/**
 * Write the code's list of stores into the database's `Store` table.
 *
 * Run at the start of every nightly crawl, before anything is saved, so a store
 * added to `STORE_LIST` exists in the table by the time its first product
 * points at it. Only adds and updates: a store removed from the list keeps its
 * row, because its old products and runs still point at it.
 */
export async function syncStores(): Promise<void> {
  for (const [position, s] of STORE_LIST.entries()) {
    const data = {
      name: s.name,
      website: s.website,
      crawlMethod: s.crawlMethod,
      barcodeSource: s.barcodeSource,
      position,
    };
    await prisma.store.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }
}
