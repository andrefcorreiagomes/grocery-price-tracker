import { FOOD_TYPE_BY_ID } from "./food-types";
import { isOwnBrand } from "./candidates";
import { unitPrice } from "./pricing";
import { isStoreError } from "../../data/store-errors";

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
 * The unit check is what prevents nonsense. Grams and millilitres measure
 * different things and there is no honest arithmetic between them, so a product
 * recorded in the wrong one is EXCLUDED rather than converted - the same rule
 * the matching layer already applies in `sizeSpreadOk`.
 *
 * Most foods declare one unit. A few are genuinely sold both ways and declare
 * `"either"`, which does not relax the rule: it means TWO rankings, and the
 * caller narrows to one with `measuredIn`. Ask `unitsFor` for the list.
 */
export function comparable(
  p: ComparableProduct,
  foodTypeId: string,
  /** narrows to one ranking; required for a food measured both ways */
  measuredIn?: "kg" | "l"
): boolean {
  if (p.price === null || p.packageSize === null || p.packageSize <= 0) return false;
  if (p.unit !== "kg" && p.unit !== "l") return false;
  // The store's own data is wrong (data/store-errors.ts): its price per kilo
  // would be impossible, so it sits out, as if its size were unknown.
  if (isStoreError(p.store, p.storeProductId)) return false;

  if (measuredIn) return p.unit === measuredIn;

  const declared = FOOD_TYPE_BY_ID.get(foodTypeId)?.unit;
  // "either" means the food is genuinely sold both ways and gets one ranking
  // per unit; with no `measuredIn` there is nothing to narrow to, so both pass
  // and the caller is expected to have asked `unitsFor` first.
  if (!declared || declared === "either") return true;
  return p.unit === declared;
}

/**
 * The rankings this kind of food should produce: one unit, or both.
 *
 * A food declared `"either"` yields a ranking per unit ACTUALLY PRESENT, so a
 * page never renders an empty second table just because the table said it could
 * exist. Everything else yields its declared unit.
 */
export function unitsFor(foodTypeId: string, rows: ComparableProduct[]): ("kg" | "l")[] {
  const declared = FOOD_TYPE_BY_ID.get(foodTypeId)?.unit;
  if (declared === "kg" || declared === "l") return [declared];

  const present: ("kg" | "l")[] = [];
  for (const u of ["kg", "l"] as const) {
    if (rows.some((r) => comparable(r, foodTypeId, u))) present.push(u);
  }
  return present;
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
  foodTypeId: string,
  measuredIn?: "kg" | "l"
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
      if (p.store !== store || !comparable(p, foodTypeId, measuredIn)) continue;
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
  foodTypeId: string,
  measuredIn?: "kg" | "l"
): Map<string, Cell> {
  return cheapestOf(rows, rows, foodTypeId, measuredIn);
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
  foodTypeId: string,
  measuredIn?: "kg" | "l"
): Map<string, Cell> {
  const own = rows.filter((p) => isOwnBrand(p.brand, p.store));
  return cheapestOf(own, own, foodTypeId, measuredIn);
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
  foodTypeId: string,
  measuredIn?: "kg" | "l"
): Map<string, Cell> {
  return cheapestOf(members, members, foodTypeId, measuredIn);
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

/**
 * Every store with the lowest price per unit, or none when fewer than two can
 * be compared.
 *
 * ALL of them on a tie. Naming only the first used to highlight Continente
 * alone where all three sold cooking oil at EUR 1.55 a litre, which told the
 * reader Continente was cheaper when it was not. Ties are judged in whole
 * cents, because cents are what the page shows: two prices the reader sees as
 * equal must not be ranked by a fraction they cannot see.
 */
export function cheapestStores(cells: Map<string, Cell>): string[] {
  const cents = new Map<string, number>();
  for (const [store, cell] of cells) {
    if (cell.kind === "price") cents.set(store, Math.round(cell.unitPrice * 100));
  }
  // One priced store is not a comparison, and naming it "cheapest" would imply
  // it beat something.
  if (cents.size < 2) return [];
  const lowest = Math.min(...cents.values());
  return [...cents].filter(([, c]) => c === lowest).map(([store]) => store);
}
