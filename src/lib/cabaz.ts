import { euros } from "./money";
import { STORE_ORDER } from "./stores";
import type { Store } from "@/lib/stores";
import type { BasketCell } from "./grupos";

/*
 * Basket maths, kept free of React and Prisma so it can be checked on its own
 * (src/scripts/verify-basket.ts).
 *
 * The rule that shapes everything here: a store's total may only be compared
 * against another store's total when both cover *the same products*. Summing
 * whatever each store happens to stock lets a store win by not selling things.
 *
 * So there are two totals per store (the user's design, 22 October 2026):
 *   - the COMPARABLE total, of the items every store prices. The same items in
 *     every column; the only one that names a cheapest store.
 *   - the FULL total, of every item that store prices, with the items it
 *     lacks named beside it.
 * No item is ever dropped from the basket, and adding a store never changes
 * what another store's full total covers. Until then an item one store could
 * not price was left out of every total, so a store added later would have
 * emptied other people's baskets - against the rule of 18 October 2026 that a
 * new store must not change what counts as a comparison.
 *
 * Rewritten on 22 October 2026 around the basket lines themselves (code review
 * M6). It used to turn each catalogue price into a listing of the retired
 * tracked-products model, with a pack size of 1 and an invented capture date,
 * and to carry a whole "out-of-date price" feature that could no longer
 * happen: every price the catalogue shows is current (STALE_AFTER_DAYS).
 */

/** One store's answer for a basket line: priced, sold without a size, or not sold. */
export type CabazCell = BasketCell;

export interface CabazProduct {
  id: string;
  name: string;
  unit: string | null;
  /** one per store, aligned to STORE_ORDER */
  cells: CabazCell[];
}

export interface CabazRow {
  product: CabazProduct;
  quantity: number;
  /** stores that cannot price this row */
  blockers: Store[];
  /** quantity > 0 - a row at zero stays on screen but takes part in nothing */
  counted: boolean;
  /** contributes to every store's total (counted, and no blockers) */
  included: boolean;
  /** stores showing the row's cheapest price; empty when nothing was beaten */
  lowestStores: Store[];
}

export interface CabazExclusion {
  product: CabazProduct;
  blockers: { store: Store; kind: "not-stocked" | "no-size" }[];
  /** no store can price this at all */
  pricedNowhere: boolean;
}

export interface Cabaz {
  rows: CabazRow[];
  exclusions: CabazExclusion[];
  selectedCount: number;
  includedCount: number;
  /** the comparable totals, aligned to STORE_ORDER; null throughout when no item is priceable everywhere */
  totals: (number | null)[];
  /** every store whose comparable total ties for lowest */
  cheapestStores: Store[];
  /** each store's sum of every counted item it prices, aligned to STORE_ORDER; null when it prices none */
  fullTotals: (number | null)[];
  /** the counted items each store cannot price, aligned to STORE_ORDER */
  missing: CabazProduct[][];
}

export interface SelectedItem {
  productId: string;
  quantity: number;
}

/** The price of one unit (kilo, litre or item), or null when the store gives none. */
function priceOf(cell: CabazCell): number | null {
  return cell.kind === "price" ? cell.unitPrice : null;
}

/**
 * A row at quantity 0 still shows each store's price - the price of one - so
 * the row stays informative while counting toward nothing. Shared with the
 * table so the highlight and the rendered figure can never disagree.
 */
export function shownQuantity(quantity: number): number {
  return quantity === 0 ? 1 : quantity;
}

/** A price as the basket shows it, in the cents its cheapest marker compares (lib/money.ts). */
export function formatEuros(value: number): string {
  return `${euros(value)}€`;
}

/**
 * Which stores get the cheapest-in-row marker.
 *
 * The marker means "this beat something". So it appears only when at least one
 * other price is strictly higher: a three-way tie highlights nothing, two tied
 * at the bottom with a third above highlights both, and a row with only one
 * price highlights nothing, because none of those beat anything.
 *
 * Compared in whole cents, on the same figure the cell renders. Comparing raw
 * floats would leave two cells both reading 1.49€ with only one marked.
 */
function lowestInRow(cells: CabazCell[], quantity: number): Store[] {
  const shown = shownQuantity(quantity);
  const cents = cells.map((cell) => {
    const price = priceOf(cell);
    return price === null ? null : Math.round(price * shown * 100);
  });
  const values = cents.filter((value): value is number => value !== null);
  if (values.length === 0) return [];
  const lowest = Math.min(...values);
  if (!values.some((value) => value > lowest)) return [];
  return STORE_ORDER.filter((_, i) => cents[i] === lowest);
}

export function buildCabaz(products: CabazProduct[], selection: SelectedItem[]): Cabaz {
  const byId = new Map(products.map((product) => [product.id, product]));

  const rows: CabazRow[] = [];
  for (const item of selection) {
    const product = byId.get(item.productId);
    if (!product) continue; // stale id from a shared URL - drop it silently
    const blockers = STORE_ORDER.filter((_, i) => priceOf(product.cells[i]) === null);
    const counted = item.quantity > 0;
    rows.push({
      product,
      quantity: item.quantity,
      blockers,
      counted,
      included: counted && blockers.length === 0,
      lowestStores: lowestInRow(product.cells, item.quantity),
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
      : included.reduce((sum, row) => sum + (priceOf(row.product.cells[i]) as number) * row.quantity, 0)
  );

  const fullTotals: (number | null)[] = STORE_ORDER.map((_, i) => {
    const priced = counted.filter((row) => priceOf(row.product.cells[i]) !== null);
    return priced.length === 0
      ? null
      : priced.reduce((sum, row) => sum + (priceOf(row.product.cells[i]) as number) * row.quantity, 0);
  });
  const missing = STORE_ORDER.map((_, i) =>
    counted.filter((row) => priceOf(row.product.cells[i]) === null).map((row) => row.product)
  );

  // Compared in whole cents, as the totals are shown.
  const cents = totals.map((total) => (total === null ? null : Math.round(total * 100)));
  const priced = cents.filter((c): c is number => c !== null);
  const lowest = priced.length > 0 ? Math.min(...priced) : null;
  const cheapestStores = lowest === null ? [] : STORE_ORDER.filter((_, i) => cents[i] === lowest);

  return {
    rows,
    exclusions: counted
      .filter((row) => row.blockers.length > 0)
      .map((row) => ({
        product: row.product,
        blockers: row.blockers.map((store) => {
          const cell = row.product.cells[STORE_ORDER.indexOf(store)];
          return { store, kind: cell.kind === "no-size" ? ("no-size" as const) : ("not-stocked" as const) };
        }),
        pricedNowhere: row.blockers.length === STORE_ORDER.length,
      })),
    selectedCount: counted.length,
    includedCount: included.length,
    totals,
    cheapestStores,
    fullTotals,
    missing,
  };
}

/*
 * URL encoding: `itens=<id>,<id>:3,<id>` with the quantity omitted when it is 1.
 * Parsing is deliberately forgiving - a hand-edited or truncated shared link
 * should drop the bad parts and render, never throw.
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
