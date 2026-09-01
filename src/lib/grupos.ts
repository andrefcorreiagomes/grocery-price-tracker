import { prisma } from "./db";
import {
  cheapestPerStore,
  cheapestStore,
  comparableStoreCount,
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

  const rankings = unitsFor(foodTypeId, rows).map((unit) => {
    const cheapest = cheapestPerStore(rows, foodTypeId, unit);
    return {
      unit,
      cheapest,
      ownBrand: ownBrandPerStore(rows, foodTypeId, unit),
      winner: cheapestStore(cheapest),
      storesCompared: comparableStoreCount(cheapest),
    };
  });

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
