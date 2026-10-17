/*
 * The stores this project crawls, and the one place in the code that lists them.
 *
 * The database keeps the same list in its `Store` table, which every table
 * that records a store points to. The code needs its own copy because each
 * store's reader is code; `syncStores` (src/lib/stores-db.ts) writes this list
 * into the table, and a test checks the two are equal. Adding a store is one
 * entry here plus its crawler - no change to the database's structure.
 *
 * Kept free of the Prisma client so that modules with no business touching the
 * database - the cabaz maths, any future pure helper - can import it.
 * queries.ts re-exports the labels and order, so existing imports keep working.
 */

export interface StoreInfo {
  /** the identifier every table stores */
  id: string;
  /** as shown on the site */
  name: string;
  website: string;
  /** how the nightly crawl reaches the products, in a few words */
  crawlMethod: string;
  /** where its barcodes come from; null when the store publishes none */
  barcodeSource: string | null;
}

/** In the order the site shows them. */
export const STORE_LIST = [
  {
    id: "CONTINENTE",
    name: "Continente",
    website: "https://www.continente.pt",
    crawlMethod: "sitemap and product pages",
    barcodeSource: "product page",
  },
  {
    id: "PINGO_DOCE",
    name: "Pingo Doce",
    website: "https://www.pingodoce.pt",
    crawlMethod: "sitemap and product pages",
    barcodeSource: null,
  },
  {
    id: "AUCHAN",
    name: "Auchan",
    website: "https://www.auchan.pt",
    crawlMethod: "listing pages",
    barcodeSource: "product page",
  },
] as const satisfies readonly StoreInfo[];

/** A store identifier: "CONTINENTE", "PINGO_DOCE" or "AUCHAN". */
export type Store = (typeof STORE_LIST)[number]["id"];

export const STORE_ORDER: Store[] = STORE_LIST.map((s) => s.id);

export const STORE_LABELS = Object.fromEntries(STORE_LIST.map((s) => [s.id, s.name])) as Record<
  Store,
  string
>;

/** True for a string that names one of the stores. */
export function isStore(value: string): value is Store {
  return STORE_ORDER.includes(value as Store);
}

/** A store's name as shown on the site, for an identifier read from the database. */
export function storeName(id: string): string {
  return isStore(id) ? STORE_LABELS[id] : id;
}
