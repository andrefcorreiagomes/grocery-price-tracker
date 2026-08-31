import { FOOD_TYPE_BY_ID } from "./food-types";
import { isOwnBrand } from "./candidates";
import { unitPrice } from "./pricing";

/**
 * Deciding what each store has to say about one kind of food.
 *
 * The page asks a store three questions - what is your cheapest rice, your own
 * rice, and your price for THIS rice - and every answer is one of three things.
 * Getting those three straight is the whole job of this file, because two of
 * them look like a blank cell and mean completely different things.
 *
 * Pure and I/O-free, like matching.ts, candidates.ts and food-types.ts: the
 * caller reads rows from the database and passes them in. That is what lets the
 * judgements be tested without a crawl.
 */

/** A catalogue row, reduced to what a comparison needs. */
export interface ComparableProduct {
  storeProductId: string;
  store: string;
  name: string;
  brand: string | null;
  price: number | null;
  packageSize: number | null;
  /** "kg" or "l" as stored; anything else is treated as unknown */
  unit: string | null;
}

/** What one store has to say about one kind of food. */
export type Cell =
  | {
      kind: "price";
      /** euros per kilo or per litre, whichever the food type is measured in */
      unitPrice: number;
      product: ComparableProduct;
    }
  /** The store sells nothing of this kind of food. */
  | { kind: "not-stocked" }
  /**
   * The store sells it, but no product of it has both a price and a size, so a
   * price per kilo cannot be computed.
   *
   * This is NOT the same as not stocking it, and the page must never render the
   * two alike. It is common rather than rare: Continente publishes a size for
   * 57% of its products, and 21% of Pingo Doce's pages carry no sellable price.
   * `example` is carried so the page can still name something the store sells.
   */
  | { kind: "no-size"; example: ComparableProduct };

/** Every store the app compares, in the order the page shows them. */
export const STORES = ["CONTINENTE", "PINGO_DOCE", "AUCHAN"] as const;

/**
 * Can this product take part in a price-per-kilo comparison of `foodType`?
 *
 * The unit check is the one that prevents nonsense. A kind of food is measured
 * in kilos or in litres, never both, and a product recorded in the other one
 * cannot be converted - olive oil sold by the litre and olive oil sold by the
 * kilo are different measurements of different things. So it is EXCLUDED rather
 * than converted, the same rule the matching layer already applies in
 * `sizeSpreadOk`.
 */
export function comparable(p: ComparableProduct, foodTypeId: string): boolean {
  if (p.price === null || p.packageSize === null || p.packageSize <= 0) return false;
  const expected = FOOD_TYPE_BY_ID.get(foodTypeId)?.unit;
  // A food type that declares no unit accepts either, since there is nothing to
  // contradict; one that declares a unit accepts only that one.
  if (expected && p.unit !== expected) return false;
  return p.unit === "kg" || p.unit === "l";
}

/**
 * The cheapest of `candidates` per store, as one answer per store.
 *
 * `stocked` is separate from `candidates` on purpose. Without it, a store that
 * sells the food but has no usable size would be indistinguishable from one
 * that does not sell it at all, and the page would tell the same lie for both.
 */
function cheapestOf(
  stocked: ComparableProduct[],
  candidates: ComparableProduct[],
  foodTypeId: string
): Map<string, Cell> {
  const byStore = new Map<string, Cell>();

  for (const store of STORES) {
    const here = stocked.filter((p) => p.store === store);
    if (here.length === 0) {
      byStore.set(store, { kind: "not-stocked" });
      continue;
    }

    let best: { product: ComparableProduct; unitPrice: number } | null = null;
    for (const p of candidates) {
      if (p.store !== store || !comparable(p, foodTypeId)) continue;
      const each = unitPrice(p.price as number, p.packageSize as number);
      if (best === null || each < best.unitPrice) best = { product: p, unitPrice: each };
    }

    byStore.set(
      store,
      best === null
        ? { kind: "no-size", example: here[0] }
        : { kind: "price", unitPrice: best.unitPrice, product: best.product }
    );
  }

  return byStore;
}

/**
 * "Where do I go for cheap rice?" - the cheapest product of this kind of food
 * at each store, whatever its brand.
 *
 * `rows` must be every product of ONE food type, across all stores. A store
 * absent from `rows` entirely is the only thing that counts as not stocking it.
 */
export function cheapestPerStore(
  rows: ComparableProduct[],
  foodTypeId: string
): Map<string, Cell> {
  return cheapestOf(rows, rows, foodTypeId);
}

/**
 * "At the same quality tier, who is cheaper?" - each chain's own label.
 *
 * A different question from the cheapest overall, and it can give a different
 * winner: the store with the cheapest ANYTHING is not always the store with the
 * cheapest COMPARABLE thing. Own-brand is the closest thing to like-for-like
 * that exists across chains, because the products are never identical.
 *
 * A store here reads "not stocked" when it has no own-brand product of this
 * food type, which is a true statement about the own-brand comparison even when
 * the store does sell the food under other brands.
 */
export function ownBrandPerStore(
  rows: ComparableProduct[],
  foodTypeId: string
): Map<string, Cell> {
  const own = rows.filter((p) => isOwnBrand(p.brand, p.store));
  return cheapestOf(own, own, foodTypeId);
}

/**
 * "This exact thing I buy - where is it cheapest?" - one confirmed group of the
 * same product across stores.
 *
 * The members come from the matching layer, which has already decided they are
 * the same product. Here they are only priced, so a member whose store lacks a
 * size still shows as "no size" rather than vanishing from its own group.
 */
export function namedGroup(
  members: ComparableProduct[],
  foodTypeId: string
): Map<string, Cell> {
  return cheapestOf(members, members, foodTypeId);
}

/**
 * How many stores this kind of food can actually be compared across.
 *
 * The count the page's index sorts on, and the honest headline: three means a
 * real three-way comparison, one means there is nothing to compare.
 */
export function comparableStoreCount(cells: Map<string, Cell>): number {
  let n = 0;
  for (const cell of cells.values()) if (cell.kind === "price") n++;
  return n;
}

/** The store with the lowest price per unit, or null when fewer than two can be compared. */
export function cheapestStore(cells: Map<string, Cell>): string | null {
  let best: { store: string; unitPrice: number } | null = null;
  let priced = 0;
  for (const [store, cell] of cells) {
    if (cell.kind !== "price") continue;
    priced++;
    if (best === null || cell.unitPrice < best.unitPrice) best = { store, unitPrice: cell.unitPrice };
  }
  // One priced store is not a comparison, and naming it "cheapest" would imply
  // it beat something.
  return priced >= 2 && best ? best.store : null;
}
