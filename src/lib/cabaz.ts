import { unitPrice } from "./pricing";
import { STORE_ORDER } from "./stores";
import type { Store } from "@/generated/prisma/client";

/*
 * Basket maths, kept free of React and Prisma so it can be reasoned about (and
 * one day tested) on its own.
 *
 * The rule that shapes everything here: a store's total may only be compared
 * against another store's total when both cover *the same products*. Summing
 * whatever each store happens to stock lets a store win by not selling things.
 * So an item priceable at only two of the three stores is excluded from all
 * three totals, and the user is told which item and why.
 */

/** Structural minimum this module needs; getComparisonData()'s output satisfies it. */
export interface CabazListing {
  packageSize: number;
  snapshots: { date: Date; price: number }[];
}

export interface CabazProduct {
  id: string;
  name: string;
  unit: string | null;
  /** one entry per store, aligned to STORE_ORDER; undefined = no listing there */
  listings: (CabazListing | undefined)[];
}

export type CellState =
  /** priced in the most recent scrape */
  | "current"
  /** priced, but not since some earlier scrape - opt-in via allowStale */
  | "stale"
  /*
   * No listing at this store. Deliberately named for what we know rather than
   * what we might infer: the absence of a listing is equally consistent with
   * the store not selling it and with nobody having added it to the tracker
   * yet, and the UI copy must not claim the stronger of the two.
   */
  | "noListing"
  /** listing exists but has never been scraped: our gap, not the store's */
  | "neverPriced";

export interface CabazCell {
  state: CellState;
  /** price for one unit of the product's canonical unit; null when unpriced */
  unitPrice: number | null;
  /** day the price was captured; null when unpriced */
  capturedOn: Date | null;
}

export interface CabazRow {
  product: CabazProduct;
  quantity: number;
  /** aligned to STORE_ORDER */
  cells: CabazCell[];
  /** stores that cannot price this row under the current rules */
  blockers: Store[];
  /** quantity > 0 - a row at zero stays on screen but takes part in nothing */
  counted: boolean;
  /** contributes to every store's total (counted, and no blockers) */
  included: boolean;
}

export interface CabazExclusion {
  product: CabazProduct;
  blockers: { store: Store; state: CellState }[];
  /** no store can price this at all - toggling stale prices will not help */
  pricedNowhere: boolean;
}

export interface Cabaz {
  rows: CabazRow[];
  exclusions: CabazExclusion[];
  selectedCount: number;
  includedCount: number;
  /** aligned to STORE_ORDER; null throughout when no item is priceable everywhere */
  totals: (number | null)[];
  /** every store whose total ties for lowest */
  cheapestStores: Store[];
  /** at least one included price came from an earlier scrape */
  usesStalePrices: boolean;
}

export interface SelectedItem {
  productId: string;
  quantity: number;
}

/** Calendar day as YYYY-MM-DD, so dates compare by day rather than clock time. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function classifyCell(
  listing: CabazListing | undefined,
  latestDay: string | null
): CabazCell {
  if (!listing) {
    return { state: "noListing", unitPrice: null, capturedOn: null };
  }
  const snapshot = listing.snapshots[0];
  if (!snapshot) {
    return { state: "neverPriced", unitPrice: null, capturedOn: null };
  }
  // latestDay is only null when the database holds no snapshots at all, in
  // which case we could not be looking at one - treat as current rather than
  // marking every price stale against a missing reference.
  const state: CellState =
    latestDay === null || dayKey(snapshot.date) === latestDay ? "current" : "stale";
  return {
    state,
    unitPrice: unitPrice(snapshot.price, listing.packageSize),
    capturedOn: snapshot.date,
  };
}

function isUsable(cell: CabazCell, allowStale: boolean): boolean {
  if (cell.unitPrice === null) return false;
  return cell.state === "current" || (allowStale && cell.state === "stale");
}

export function buildCabaz(
  products: CabazProduct[],
  selection: SelectedItem[],
  latestScrapeDate: Date | null,
  allowStale: boolean
): Cabaz {
  const latestDay = latestScrapeDate ? dayKey(latestScrapeDate) : null;
  const byId = new Map(products.map((product) => [product.id, product]));

  const rows: CabazRow[] = [];
  for (const item of selection) {
    const product = byId.get(item.productId);
    if (!product) continue; // stale id from a shared URL - drop it silently
    const cells = STORE_ORDER.map((_, i) => classifyCell(product.listings[i], latestDay));
    const blockers = STORE_ORDER.filter((_, i) => !isUsable(cells[i], allowStale));
    const counted = item.quantity > 0;
    rows.push({
      product,
      quantity: item.quantity,
      cells,
      blockers,
      counted,
      included: counted && blockers.length === 0,
    });
  }

  /*
   * A row at quantity zero is inert on purpose: it is a shopping decision, not
   * a data gap. It must not shrink the shared subset, must not appear under
   * "fora da comparação", and must not count in either half of the scope line -
   * otherwise "I am not buying this" gets conflated with "the data cannot
   * compare this", which is the distinction the whole feature rests on.
   */
  const counted = rows.filter((row) => row.counted);
  const included = rows.filter((row) => row.included);

  // Null rather than 0 when nothing is comparable: a zero total would read as
  // "this basket is free" rather than "there is nothing to compare".
  const totals: (number | null)[] = STORE_ORDER.map((_, i) =>
    included.length === 0
      ? null
      : included.reduce((sum, row) => sum + (row.cells[i].unitPrice as number) * row.quantity, 0)
  );

  const priced = totals.filter((total): total is number => total !== null);
  const lowest = priced.length > 0 ? Math.min(...priced) : null;
  const cheapestStores =
    lowest === null ? [] : STORE_ORDER.filter((_, i) => totals[i] === lowest);

  return {
    rows,
    exclusions: rows
      .filter((row) => row.counted && row.blockers.length > 0)
      .map((row) => ({
        product: row.product,
        blockers: row.blockers.map((store) => ({
          store,
          state: row.cells[STORE_ORDER.indexOf(store)].state,
        })),
        pricedNowhere: row.blockers.length === STORE_ORDER.length,
      })),
    selectedCount: counted.length,
    includedCount: included.length,
    totals,
    cheapestStores,
    usesStalePrices: included.some((row) => row.cells.some((cell) => cell.state === "stale")),
  };
}

/*
 * URL encoding: `itens=<id>,<id>:3,<id>` with the quantity omitted when it is 1,
 * plus `ultimo=1` for the stale-price toggle. Parsing is deliberately forgiving
 * - a hand-edited or truncated shared link should drop the bad parts and render,
 * never throw.
 */

export const MAX_QUANTITY = 99;

export function parseSelection(raw: string | undefined): SelectedItem[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const items: SelectedItem[] = [];
  for (const chunk of raw.split(",")) {
    const [productId, rawQuantity] = chunk.split(":");
    if (!productId || seen.has(productId)) continue;
    // 0 is meaningful (kept in the basket, counted toward nothing), so it must
    // survive a round-trip through the URL rather than being coerced up to 1.
    const parsed = rawQuantity === undefined ? 1 : Number.parseInt(rawQuantity, 10);
    const quantity =
      Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, MAX_QUANTITY) : 1;
    seen.add(productId);
    items.push({ productId, quantity });
  }
  return items;
}

export function serializeSelection(selection: SelectedItem[]): string {
  return selection
    .map((item) => (item.quantity === 1 ? item.productId : `${item.productId}:${item.quantity}`))
    .join(",");
}
