import { prisma } from "./db";
import {
  cheapestPerStore,
  cheapestStore,
  comparableStoreCount,
  namedGroup,
  ownBrandPerStore,
  unitsFor,
  type Cell,
  type ComparableProduct,
} from "./comparison";
import { FOOD_TYPE_BY_ID } from "./food-types";
import { FOOD_TYPES } from "../../data/food-types";

/**
 * Reading the catalogue for the comparison pages.
 *
 * The judgement lives in `comparison.ts`, which is pure; this only fetches rows
 * and hands them over. Same split as the crawlers, and for the same reason: the
 * rules that decide what a store "says" about a food are testable without a
 * database.
 */

/** Rows of one food type, in the shape the comparison rules take. */
async function rowsFor(foodTypeId: string): Promise<ComparableProduct[]> {
  return prisma.catalogueProduct.findMany({
    where: { foodType: foodTypeId, delistedAt: null },
    select: {
      storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true,
    },
  });
}

/** One ranking: the three stores' answers, measured in one unit. */
export interface Ranking {
  unit: "kg" | "l";
  cheapest: Map<string, Cell>;
  ownBrand: Map<string, Cell>;
  /** the confirmed same-product groups, largest price gap first */
  named: NamedGroups;
  /** the store with the lowest price, or null when fewer than two can be compared */
  winner: string | null;
  storesCompared: number;
}

export interface FoodTypePage {
  id: string;
  label: string;
  /**
   * One per unit. Nearly always a single ranking; a food genuinely sold both
   * ways (tarts baked and frozen, mayonnaise) gets two, shown side by side.
   */
  rankings: Ranking[];
  /** distinct products of this food type we hold, across all three chains */
  productCount: number;
}

export async function getFoodTypePage(foodTypeId: string): Promise<FoodTypePage | null> {
  const type = FOOD_TYPE_BY_ID.get(foodTypeId);
  if (!type) return null;

  const rows = await rowsFor(foodTypeId);
  if (rows.length === 0) return null;

  const rankings: Ranking[] = [];
  for (const unit of unitsFor(foodTypeId, rows)) {
    const cheapest = cheapestPerStore(rows, foodTypeId, unit);
    rankings.push({
      unit,
      cheapest,
      ownBrand: ownBrandPerStore(rows, foodTypeId, unit),
      named: await getNamedGroups(foodTypeId, unit),
      winner: cheapestStore(cheapest),
      storesCompared: comparableStoreCount(cheapest),
    });
  }

  return { id: type.id, label: type.label, rankings, productCount: rows.length };
}

export interface IndexEntry {
  id: string;
  label: string;
  unit: "kg" | "l";
  storesCompared: number;
  winner: string | null;
  cheapestPrice: number | null;
}

/**
 * The index: every kind of food that can be compared across ALL THREE chains.
 *
 * Three is the bar because the page's promise is a three-way comparison; a food
 * only two chains can be priced on is a thinner claim and would need saying so
 * on the page rather than sitting silently in the same list. Those are not lost
 * - `validate:comparisons` reports them - they simply are not this page yet.
 *
 * One query for the whole catalogue rather than 177 queries: the per-type work
 * is grouping in memory, which is far cheaper than 177 round trips.
 */
export async function getComparableFoodTypes(): Promise<IndexEntry[]> {
  const rows = await prisma.catalogueProduct.findMany({
    where: { foodType: { not: null }, delistedAt: null },
    select: {
      storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true, foodType: true,
    },
  });

  const byType = new Map<string, ComparableProduct[]>();
  for (const row of rows) {
    const list = byType.get(row.foodType as string) ?? [];
    list.push(row);
    byType.set(row.foodType as string, list);
  }

  const entries: IndexEntry[] = [];
  for (const type of FOOD_TYPES) {
    const typeRows = byType.get(type.id);
    if (!typeRows) continue;

    for (const unit of unitsFor(type.id, typeRows)) {
      const cheapest = cheapestPerStore(typeRows, type.id, unit);
      if (comparableStoreCount(cheapest) < 3) continue;

      let lowest: number | null = null;
      for (const cell of cheapest.values()) {
        if (cell.kind === "price" && (lowest === null || cell.unitPrice < lowest)) {
          lowest = cell.unitPrice;
        }
      }
      entries.push({
        id: type.id,
        label: type.label,
        unit,
        storesCompared: 3,
        winner: cheapestStore(cheapest),
        cheapestPrice: lowest,
      });
    }
  }

  return entries.sort((a, b) => a.label.localeCompare(b.label, "pt"));
}

/**
 * How many named-product groups a food page shows before it stops.
 *
 * The 90th percentile of the real distribution: median 4, 75th 11, 90th 20,
 * max 168 (vinho). Twenty leaves 90% of food pages complete and shortens only
 * ten. An earlier draft said six, which would have truncated 38% of them.
 */
export const MAX_NAMED_GROUPS = 20;

export interface NamedGroup {
  id: string;
  /**
   * The shortest member name. Groups have no name of their own, only members,
   * and the shortest is reliably the least store-specific - "Nutella" over
   * "Creme para Barrar Nutella Pack Poupança Continente".
   */
  name: string;
  cells: Map<string, Cell>;
  /** the spread between the dearest and cheapest chain, in euros per unit */
  gap: number;
  /** the cheaper chain - the answer the row exists to give */
  winner: string | null;
}

export interface NamedGroups {
  /** the comparable ones, largest gap first, cut at MAX_NAMED_GROUPS */
  shown: NamedGroup[];
  /** how many could be compared at all, before the cut */
  comparable: number;
  /**
   * How many confirmed same-product groups exist for this food, comparable or
   * not. Kept apart from `comparable` because the difference is worth saying
   * out loud: `vinho` has 168 groups and NONE can be compared, because every
   * one pairs a sized Auchan bottle with a Continente row that has no size.
   * Reporting that as "no identical products" would be false.
   */
  found: number;
}

/**
 * "This exact thing I buy - where is it cheapest?"
 *
 * The confirmed same-product groups from the matching layer, which has already
 * decided the members are one product. Here they are only priced.
 *
 * Every group today spans exactly TWO chains, because Pingo Doce publishes no
 * barcode and so cannot be matched with certainty. That is not hidden: the
 * third chain renders "not stocked", which is the shape of the original
 * "Batata do Zé" example.
 */
export async function getNamedGroups(
  foodTypeId: string,
  measuredIn: "kg" | "l"
): Promise<NamedGroups> {
  // Which catalogue rows of this food type belong to a group.
  const rows = await prisma.catalogueProduct.findMany({
    where: { foodType: foodTypeId, delistedAt: null },
    select: {
      id: true, storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true,
    },
  });
  if (rows.length === 0) return { shown: [], comparable: 0, found: 0 };

  const byId = new Map(rows.map((r) => [r.id, r]));

  // Every membership, then matched in memory rather than `where productId in
  // [...]`. The whole table is 1,936 rows, so reading it costs nothing, and it
  // avoids handing SQLite an IN clause of 7,472 ids for a food type as large as
  // `vinho`.
  const allMemberships = await prisma.productGroupMember.findMany({
    select: { groupId: true, productId: true },
  });
  const groupIds = new Set(
    allMemberships.filter((m) => byId.has(m.productId)).map((m) => m.groupId)
  );
  if (groupIds.size === 0) return { shown: [], comparable: 0, found: 0 };

  // A group is reachable from any of its members, so take every member of every
  // group we touched - the other side may be a different food type, or carry no
  // food type at all, and still belongs in the comparison.
  const allMembers = allMemberships.filter((m) => groupIds.has(m.groupId));
  const otherIds = allMembers.map((m) => m.productId).filter((id) => !byId.has(id));
  const others = await prisma.catalogueProduct.findMany({
    where: { id: { in: otherIds } },
    select: {
      id: true, storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true,
    },
  });
  for (const o of others) byId.set(o.id, o);

  const byGroup = new Map<string, ComparableProduct[]>();
  for (const m of allMembers) {
    const product = byId.get(m.productId);
    if (!product) continue;
    const list = byGroup.get(m.groupId) ?? [];
    list.push(product);
    byGroup.set(m.groupId, list);
  }

  const groups: NamedGroup[] = [];
  for (const [id, members] of byGroup) {
    const cells = namedGroup(members, foodTypeId, measuredIn);

    const prices: number[] = [];
    for (const cell of cells.values()) if (cell.kind === "price") prices.push(cell.unitPrice);
    // Two prices or it is not a comparison. One priced side and one "no size"
    // is a true statement but answers nothing, and this row exists to answer
    // "where is this cheaper". The count of these is reported instead.
    if (prices.length < 2) continue;

    groups.push({
      id,
      name: members.reduce((a, b) => (b.name.length < a.name.length ? b : a)).name,
      cells,
      gap: Math.max(...prices) - Math.min(...prices),
      winner: cheapestStore(cells),
    });
  }

  // Largest gap first: the products where the choice of shop matters most, so a
  // page cut at 20 still leads with its most useful rows.
  groups.sort((a, b) => b.gap - a.gap);
  return {
    shown: groups.slice(0, MAX_NAMED_GROUPS),
    comparable: groups.length,
    found: byGroup.size,
  };
}

/** When the catalogue was last confirmed, per chain - the page's honesty line. */
export async function getFreshness(): Promise<{ store: string; lastSeenAt: Date }[]> {
  const out: { store: string; lastSeenAt: Date }[] = [];
  for (const store of ["CONTINENTE", "PINGO_DOCE", "AUCHAN"] as const) {
    const newest = await prisma.catalogueProduct.findFirst({
      where: { store, delistedAt: null },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    });
    if (newest) out.push({ store, lastSeenAt: newest.lastSeenAt });
  }
  return out;
}
