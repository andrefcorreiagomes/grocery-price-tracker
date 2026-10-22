import { prisma } from "./db";
import {
  cheapestStores,
  comparable,
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
import { STORE_ORDER } from "./stores";
import { unitPrice } from "./pricing";
import { promotionOf, type Promotion } from "./promotion";
import { shownOnSite } from "./grouping";

/**
 * Reading the catalogue for the comparison pages.
 *
 * The judgement lives in `comparison.ts`, which is pure; this only fetches rows
 * and hands them over. Same split as the crawlers, and for the same reason: the
 * rules that decide what a store "says" about a food are testable without a
 * database.
 */

/**
 * How long after its chain's latest crawl a product still counts as on sale.
 *
 * A product the crawls have stopped seeing keeps the price it had when last
 * seen, and that price can be months old: on 18 October 2026, 180 Pingo Doce
 * products had not been seen since August, among them three melons priced from
 * before the per-kilo fix at EUR 0.34 a kilo - the "cheapest melon" on the
 * site. Measured from each chain's own latest crawl rather than from today, so
 * a fortnight without crawling empties nothing.
 */
export const STALE_AFTER_DAYS = 14;

/** The oldest sighting that still counts as current, given a chain's latest crawl. */
export function currentSince(latestCrawl: Date): Date {
  return new Date(latestCrawl.getTime() - STALE_AFTER_DAYS * 86_400_000);
}

/** A database filter keeping only products seen recently by their own chain's crawls. */
async function currentOnly() {
  const fresh = await getFreshness();
  return { OR: fresh.map((f) => ({ store: f.store, lastSeenAt: { gte: currentSince(f.lastSeenAt) } })) };
}

/** Rows of one food type, with their place in the tree. */
async function rowsFor(foodTypeId: string): Promise<TreeProduct[]> {
  return prisma.catalogueProduct.findMany({
    where: { foodType: foodTypeId, delistedAt: null, ...(await currentOnly()) },
    select: {
      storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true, onPromotion: true, regularPrice: true, promoEndsAt: true, subKind: true, labels: true,
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
 */
export async function getComparableFoodTypes(): Promise<IndexEntry[]> {
  const byType = await currentRowsByType();
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
 * Every current catalogue row with a kind of food, by kind. One query for the
 * whole catalogue rather than one per kind: the per-kind work is grouping in
 * memory, which is far cheaper than two hundred round trips.
 */
async function currentRowsByType(): Promise<Map<string, TreeProduct[]>> {
  const rows = await prisma.catalogueProduct.findMany({
    where: { foodType: { not: null }, delistedAt: null, ...(await currentOnly()) },
    select: {
      storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true, onPromotion: true, regularPrice: true, promoEndsAt: true, foodType: true, subKind: true, labels: true,
    },
  });
  const byType = new Map<string, TreeProduct[]>();
  for (const row of rows) {
    const list = byType.get(row.foodType as string) ?? [];
    list.push(row);
    byType.set(row.foodType as string, list);
  }
  return byType;
}

/** One store's answer for a basket line, small enough to send to the browser. */
export type BasketCell =
  | { kind: "price"; unitPrice: number; productName: string; promotion: Promotion | null }
  | { kind: "not-stocked" }
  | { kind: "no-size"; productName: string };

/**
 * A line the basket can hold: one comparison of a food's page ("Leite ·
 * Meio-gordo", per litre), with each chain's cheapest product in it. So a
 * basket line means "the cheapest of this at each store", not one exact
 * product - the user's choice of 21 October 2026.
 */
export interface BasketLine {
  /** "leite~meio-gordo~~l": kind, sub-kind, labels joined by ".", unit - safe in an address */
  id: string;
  /** "Leite · Meio-gordo", "Manteiga · Biológico", or just "Manteiga" */
  name: string;
  unit: MeasureUnit;
  categoryId: string;
  categoryLabel: string;
  kindId: string;
  kindLabel: string;
  /** aligned to STORE_ORDER */
  cells: BasketCell[];
}

/**
 * Every comparison the food pages show, as basket lines, in the tree's
 * category order and alphabetical by kind within a category.
 */
export async function getBasketLines(): Promise<BasketLine[]> {
  const byType = await currentRowsByType();
  const lines: BasketLine[] = [];
  for (const category of CATEGORIES) {
    const kinds = category.kinds
      .map((id) => FOOD_TYPE_BY_ID.get(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined && !t.hidden)
      .sort((a, b) => a.label.localeCompare(b.label, "pt"));
    for (const type of kinds) {
      const typeRows = byType.get(type.id);
      if (!typeRows) continue;
      for (const g of shownGroups(comparisonGroups(type.id, typeRows))) {
        lines.push({
          id: `${type.id}~${comparisonSlug(g)}`,
          // A kind without sub-kinds already heads its own titles ("Manteiga ·
          // Biológico"); the others name the sub-kind only ("Meio-gordo").
          name: g.title === type.label || g.title.startsWith(`${type.label} · `) ? g.title : `${type.label} · ${g.title}`,
          unit: g.unit,
          categoryId: category.id,
          categoryLabel: category.label,
          kindId: type.id,
          kindLabel: type.label,
          cells: STORE_ORDER.map((store): BasketCell => {
            const cell = g.cheapest.get(store) as Cell;
            if (cell.kind === "price") {
              return { kind: "price", unitPrice: cell.unitPrice, productName: cell.product.name, promotion: promotionOf(cell.product) };
            }
            if (cell.kind === "no-size") return { kind: "no-size", productName: cell.example.name };
            return { kind: "not-stocked" };
          }),
        });
      }
    }
  }
  return lines;
}

/**
 * A comparison's name in an address: sub-kind, labels joined by ".", unit -
 * "meio-gordo~~l". Only letters, digits, "-", "." and "~", so it needs no
 * escaping. A basket line's id is the kind followed by this.
 */
export function comparisonSlug(g: Pick<ComparisonGroup, "subKind" | "labels" | "unit">): string {
  return [g.subKind ?? "", g.labels.join("."), g.unit].join("~");
}

/**
 * Where the price history of every comparison starts. Before 3 October 2026
 * the page readers mis-sized goods sold by the kilo, so stored prices from then
 * work out at impossible prices per kilo: picanha at EUR 0.02, shrimp at 0.01.
 * Measured on 21 October 2026 across all 578 comparisons: 59 jumps of more than
 * 2.5x between neighbouring points from August, 3 from this date - and those 3
 * are a genuinely cheaper product arriving.
 */
export const HISTORY_SINCE = "2026-10-03";

/** A calendar day in Portugal, as "2026-10-21": crawls start late in the evening, so UTC would misdate them. */
const LISBON_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const lisbonDay = (d: Date) => LISBON_DAY.format(d);

/** One store's cheapest price on a day, and the product it belongs to. */
export interface HistoryPoint {
  unitPrice: number;
  productName: string;
}

export interface ComparisonHistory {
  kindId: string;
  kindLabel: string;
  category: { id: string; label: string } | null;
  /** as on the basket: "Leite · Meio-gordo" */
  name: string;
  unit: MeasureUnit;
  /** in date order; a store missing from a day had nothing to say that day */
  days: { date: string; stores: Partial<Record<string, HistoryPoint>> }[];
}

/**
 * How the cheapest price of one comparison moved, store by store, since
 * HISTORY_SINCE.
 *
 * Read from the catalogue's price periods (CataloguePrice), which hold a price
 * from the day it was first seen. A product's price is taken to hold until its
 * NEXT price - not just until it was last seen at that price - because a crawl
 * does not always reach every product: on a day it missed one, that product's
 * last known price still stands. After its final price, a product counts only
 * up to its last sighting, so one the store stopped selling drops out.
 *
 * Every product that ever belonged to the comparison counts, delisted ones
 * included, so the cheapest of August is not forgotten because it is gone now.
 * A store gets a point only on days something changed for it in this
 * comparison; between points its price held. Its line starts at its first
 * such day from HISTORY_SINCE on, so stores can start on different days.
 */
export async function getComparisonHistory(kindId: string, slug: string): Promise<ComparisonHistory | null> {
  const type = FOOD_TYPE_BY_ID.get(kindId);
  if (!type || type.hidden) return null;
  const [sub, labelText, unit] = slug.split("~");
  if (unit !== "kg" && unit !== "l" && unit !== "un") return null;

  // The comparison must be one the food page shows today, which also gives it its title.
  const page = await getFoodTypePage(kindId);
  const group = page?.groups.find((g) => comparisonSlug(g) === slug);
  if (!page || !group) return null;

  const sameLabels = (stored: string | null) =>
    (stored ?? "").split(",").filter(Boolean).sort().join(",") === labelText.split(".").filter(Boolean).sort().join(",");
  const rows = (
    await prisma.catalogueProduct.findMany({
      where: { foodType: kindId, subKind: sub === "" ? null : sub },
      select: {
        storeProductId: true, store: true, name: true, brand: true, packageSize: true, unit: true, labels: true,
        prices: { select: { price: true, firstSeenAt: true, lastSeenAt: true }, orderBy: { firstSeenAt: "asc" } },
      },
    })
  ).filter((r) => sameLabels(r.labels));

  // Each product's prices as stretches of days: [from, to) while a later price
  // follows, [from, to] for the last one.
  const stretches = rows.flatMap((r) =>
    r.prices.flatMap((p, i) => {
      if (!comparable({ ...r, price: p.price }, kindId, unit)) return [];
      const next = r.prices[i + 1];
      return [{
        store: r.store,
        productName: r.name,
        unitPrice: unitPrice(p.price, r.packageSize as number),
        from: lisbonDay(p.firstSeenAt),
        to: next ? lisbonDay(next.firstSeenAt) : lisbonDay(p.lastSeenAt),
        last: !next,
      }];
    })
  ).filter((s) => s.to >= HISTORY_SINCE);

  const byDay = new Map<string, Partial<Record<string, HistoryPoint>>>();
  for (const store of STORE_ORDER) {
    const own = stretches.filter((s) => s.store === store);
    // Only days with a reading from HISTORY_SINCE on - not HISTORY_SINCE itself
    // for everyone, which started Continente's milk at an August price carried
    // forward to 3 October because no crawl reached it until the 4th.
    const days = new Set(own.flatMap((s) => [s.from, s.to]).filter((d) => d >= HISTORY_SINCE));
    for (const d of days) {
      let best: HistoryPoint | null = null;
      for (const s of own) {
        const holds = s.from <= d && (s.last ? d <= s.to : d < s.to);
        if (holds && (best === null || s.unitPrice < best.unitPrice)) best = { unitPrice: s.unitPrice, productName: s.productName };
      }
      if (best) byDay.set(d, { ...byDay.get(d), [store]: best });
    }
  }

  return {
    kindId,
    kindLabel: type.label,
    category: page.category,
    name: group.title === type.label || group.title.startsWith(`${type.label} · `) ? group.title : `${type.label} · ${group.title}`,
    unit,
    days: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, stores]) => ({ date, stores })),
  };
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
 * A group spans two or three chains. Continente and Auchan are matched by
 * barcode; Pingo Doce publishes none, so it joins on brand, size and name. A
 * chain not in a group renders "not stocked" rather than disappearing.
 */
export async function getNamedGroups(
  foodTypeId: string,
  measuredIn: MeasureUnit
): Promise<NamedGroups> {
  // Which catalogue rows of this food type belong to a group.
  const current = await currentOnly();
  const rows = await prisma.catalogueProduct.findMany({
    where: { foodType: foodTypeId, delistedAt: null, ...current },
    select: {
      id: true, storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true, onPromotion: true, regularPrice: true, promoEndsAt: true,
    },
  });
  if (rows.length === 0) return { shown: [], comparable: 0, found: 0 };

  const byId = new Map(rows.map((r) => [r.id, r]));

  // Only groups that are current and passed every check the site needs
  // (shownOnSite: no store with two unproven products, every barcode agreeing
  // and known). Decided with the user on 22 October 2026.
  const shown = new Set(
    (await prisma.productGroup.findMany({ where: { retiredAt: null }, select: { id: true, flags: true } }))
      .filter((g) => shownOnSite(g.flags))
      .map((g) => g.id)
  );
  // Every membership, then matched in memory rather than `where productId in
  // [...]`: reading the whole table costs little, and it avoids handing SQLite
  // an IN clause of thousands of ids for a food type as large as `vinho`.
  const allMemberships = (
    await prisma.productGroupMember.findMany({ select: { groupId: true, productId: true } })
  ).filter((m) => shown.has(m.groupId));
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
      where: { id: { in: otherIds.slice(i, i + 500) }, delistedAt: null, ...current },
      select: {
        id: true, storeProductId: true, store: true, name: true, brand: true,
        price: true, packageSize: true, unit: true, onPromotion: true, regularPrice: true, promoEndsAt: true,
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
