import { prisma } from "./db";
import { unitPrice } from "./pricing";
import { STORE_ORDER } from "./stores";

// Re-exported so the many existing `from "@/lib/queries"` imports keep working;
// the definitions themselves live in ./stores so database-free modules can use
// them without importing Prisma.
export { STORE_LABELS, STORE_ORDER } from "./stores";

export async function getCategories(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((row) => row.category as string);
}

export async function getSubcategories(category: string): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { category, subcategory: { not: null } },
    select: { subcategory: true },
    distinct: ["subcategory"],
    orderBy: { subcategory: "asc" },
  });
  return rows.map((row) => row.subcategory as string);
}

/**
 * The most recent day any listing was successfully scraped, across the whole
 * database. Deliberately global rather than scoped to the products on screen:
 * it answers "when did the scraper last run", which is the claim the table's
 * caption makes. A page-scoped version would report a category of frozen
 * listings as fresh.
 *
 * Null when the database has no snapshots at all (nothing scraped yet).
 */
export async function getLatestSnapshotDate(): Promise<Date | null> {
  const row = await prisma.priceSnapshot.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return row?.date ?? null;
}

export interface ComparisonFilter {
  category?: string;
  subcategory?: string;
}

export async function getComparisonData(filter?: ComparisonFilter) {
  const products = await prisma.product.findMany({
    where: {
      category: filter?.category,
      subcategory: filter?.subcategory,
    },
    include: {
      listings: {
        include: {
          snapshots: { orderBy: { date: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((product) => ({
    ...product,
    // A store can have more than one listing for the same product (e.g. a
    // promo SKU alongside a regular one, or different pack sizes) - always
    // surface whichever one is currently cheapest per unit, so the display
    // automatically follows promotions rotating between sibling SKUs.
    listings: STORE_ORDER.map((store) => {
      const forStore = product.listings.filter((listing) => listing.store === store);
      const withPrice = forStore.filter((listing) => listing.snapshots[0]);
      if (withPrice.length === 0) return forStore[0];
      return withPrice.reduce((cheapest, candidate) =>
        unitPrice(candidate.snapshots[0].price, candidate.packageSize) <
        unitPrice(cheapest.snapshots[0].price, cheapest.packageSize)
          ? candidate
          : cheapest
      );
    }),
  }));
}

export async function getProductHistory(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    include: {
      listings: {
        include: {
          snapshots: { orderBy: { date: "asc" } },
        },
      },
    },
  });
}
