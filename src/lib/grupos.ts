import { prisma } from "./db";
import {
  cheapestStores,
  namedGroup,
  unitsFor,
  type Cell,
  type ComparableProduct,
  type MeasureUnit,
} from "./comparison";
import { FOOD_TYPE_BY_ID } from "./food-types";
import { CATEGORIES } from "../../data/food-tree";
import { categoryOf } from "./food-tree";
import { comparisonGroups, mainGroup, shownGroups, type ComparisonGroup, type TreeProduct } from "./comparison-groups";

/**
 * Reading the catalogue for the comparison pages.
 *
 * The judgement lives in `comparison.ts`, which is pure; this only fetches rows
 * and hands them over. Same split as the crawlers, and for the same reason: the
 * rules that decide what a store "says" about a food are testable without a
 * database.
 */

/** Rows of one food type, with their place in the tree. */
async function rowsFor(foodTypeId: string): Promise<TreeProduct[]> {
  return prisma.catalogueProduct.findMany({
    where: { foodType: foodTypeId, delistedAt: null },
    select: {
      storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true, subKind: true, labels: true,
    },
  });
}

export interface FoodTypePage {
  id: string;
  label: string;
  category: { id: string; label: string } | null;
  /**
   * One per comparison group - same sub-kind, same labels, same unit - that at
   * least two chains can be priced in (src/lib/comparison-groups.ts).
   */
  groups: ComparisonGroup[];
  /** products in groups too thin to compare (fewer than two chains priced) */
  notCompared: number;
  /** the confirmed same-product groups, one block per unit the kind is measured in */
  named: { unit: MeasureUnit; groups: NamedGroups }[];
  /** distinct products of this food type we hold, across all chains */
  productCount: number;
}

export async function getFoodTypePage(foodTypeId: string): Promise<FoodTypePage | null> {
  const type = FOOD_TYPE_BY_ID.get(foodTypeId);
  // Set aside for later (sweets, drinks): no page, exactly as for an unknown id.
  if (!type || type.hidden) return null;

  const rows = await rowsFor(foodTypeId);
  if (rows.length === 0) return null;

  const all = comparisonGroups(foodTypeId, rows);
  const groups = shownGroups(all);
  const notCompared = all.filter((g) => !groups.includes(g)).reduce((n, g) => n + g.products, 0);

  const named: FoodTypePage["named"] = [];
  for (const unit of unitsFor(foodTypeId, rows)) {
    named.push({ unit, groups: await getNamedGroups(foodTypeId, unit) });
  }

  const category = categoryOf(foodTypeId);
  return {
    id: type.id,
    label: type.label,
    category: category ? { id: category.id, label: category.label } : null,
    groups,
    notCompared,
    named,
    productCount: rows.length,
  };
}

export interface IndexEntry {
  id: string;
  label: string;
  categoryId: string;
  categoryLabel: string;
  /** the comparison that stands for the kind: plain before labelled, then the largest */
  mainTitle: string;
  unit: MeasureUnit;
  storesCompared: number;
  winners: string[];
  cheapestPrice: number | null;
  /** how many comparisons the kind's page holds */
  comparisons: number;
}

/**
 * The food list: every kind of food with at least one comparison that two or
 * more chains can be priced in, grouped by category in the tree's order.
 *
 * Two chains, not three, by the user's rule of 18 October 2026: a store added
 * later should not change what counts as a comparison, and a store that does
 * not sell a food says so on the page ("Não vende").
 *
 * One query for the whole catalogue rather than one per kind: the per-kind work
 * is grouping in memory, which is far cheaper than two hundred round trips.
 */
export async function getComparableFoodTypes(): Promise<IndexEntry[]> {
  const rows = await prisma.catalogueProduct.findMany({
    where: { foodType: { not: null }, delistedAt: null },
    select: {
      storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true, foodType: true, subKind: true, labels: true,
    },
  });

  const byType = new Map<string, TreeProduct[]>();
  for (const row of rows) {
    const list = byType.get(row.foodType as string) ?? [];
    list.push(row);
    byType.set(row.foodType as string, list);
  }

  const entries: IndexEntry[] = [];
  for (const category of CATEGORIES) {
    const kinds = category.kinds
      .map((id) => FOOD_TYPE_BY_ID.get(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined && !t.hidden)
      .sort((a, b) => a.label.localeCompare(b.label, "pt"));
    for (const type of kinds) {
      const typeRows = byType.get(type.id);
      if (!typeRows) continue;
      const groups = comparisonGroups(type.id, typeRows);
      const main = mainGroup(groups);
      if (!main) continue;
      entries.push({
        id: type.id,
        label: type.label,
        categoryId: category.id,
        categoryLabel: category.label,
        mainTitle: main.title,
        unit: main.unit,
        storesCompared: main.storesCompared,
        winners: main.winners,
        cheapestPrice: main.cheapestPrice,
        comparisons: shownGroups(groups).length,
      });
    }
  }
  return entries;
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
  /** the cheaper chain, or both on a tie - the answer the row exists to give */
  winners: string[];
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
 * third chain renders "not stocked" rather than disappearing from the row.
 */
export async function getNamedGroups(
  foodTypeId: string,
  measuredIn: MeasureUnit
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
  // In batches: the database driver accepts at most 999 values per query. Wine
  // alone reaches about 340 today, and groups only grow.
  for (let i = 0; i < otherIds.length; i += 500) {
    const others = await prisma.catalogueProduct.findMany({
      where: { id: { in: otherIds.slice(i, i + 500) } },
      select: {
        id: true, storeProductId: true, store: true, name: true, brand: true,
        price: true, packageSize: true, unit: true,
      },
    });
    for (const o of others) byId.set(o.id, o);
  }

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
      winners: cheapestStores(cells),
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
