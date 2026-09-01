import { prisma } from "../lib/db";
import {
  cheapestPerStore,
  comparable,
  comparableStoreCount,
  STORES,
  type Cell,
  type ComparableProduct,
} from "../lib/comparison";
import { FOOD_TYPE_BY_ID } from "../lib/food-types";
import { unitPrice } from "../lib/pricing";
import { FOOD_TYPES } from "../../data/food-types";
import { renderComparisonReport } from "./comparison-report-html";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Check every kind of food before any of it reaches a page.
 *
 *   npm run validate:comparisons
 *   npm run validate:comparisons -- --html=reports/comparisons.html
 *
 * Phase 0 fixed the errors we had already found. This finds the ones we had
 * not, and it exists because of a specific property of the page: it ranks by
 * CHEAPEST, and cheapest is where every error lands. A size recorded too large
 * makes a price per kilo too small, so the worst row in a food type is the
 * first one a visitor sees. A page built on this query would show its own bugs
 * and little else.
 *
 * Three questions per food type, and the third is the one that needs a human.
 */

/** Below this per kilo or litre, a grocery price is a parse error. */
const MIN_UNIT_PRICE = 0.1;
/** Above it, likewise - saffron is the only thing that comes close. */
const MAX_UNIT_PRICE = 200;
/** Largest pack over smallest, above which the sizes disagree with each other. */
const SIZE_SPREAD_LIMIT = 50;
/**
 * Median price per kilo divided by the cheapest. High means the cheapest is
 * nothing like a typical member, which is the signature of a food type holding
 * more than one kind of thing - dessert cheese beside aged cheese.
 */
const BREADTH_LIMIT = 4;

export interface TypeReport {
  id: string;
  label: string;
  unit: string;
  /** priced, sized, comparable products */
  n: number;
  /** how many stores can be compared */
  stores: number;
  cheapest: number | null;
  median: number | null;
  /** median / cheapest */
  breadth: number | null;
  sizeSpread: number | null;
  /** the cheapest product at each store, for a human to eyeball */
  cheapestNames: { store: string; unitPrice: number; name: string }[];
  problems: Problem[];
}

/**
 * Grouped by REMEDY, not by severity. Each kind is fixed somewhere different,
 * and three of the four are not decisions I can make.
 */
export type ProblemKind =
  /** declare the unit in data/food-types.ts - mechanical, and mine to fix */
  | "unit"
  /** a size or price is wrong - a parser or a store placeholder */
  | "data"
  /** the food type holds more than one kind of thing - your judgement */
  | "breadth";

export interface Problem {
  kind: ProblemKind;
  text: string;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function reportFor(id: string, rows: ComparableProduct[]): TypeReport {
  const type = FOOD_TYPE_BY_ID.get(id);
  const usable = rows.filter((r) => comparable(r, id));
  const prices = usable.map((r) => unitPrice(r.price as number, r.packageSize as number));
  const sizes = usable.map((r) => r.packageSize as number);

  const cheapest = prices.length > 0 ? Math.min(...prices) : null;
  const mid = median(prices);
  const breadth = cheapest !== null && mid !== null && cheapest > 0 ? mid / cheapest : null;
  const sizeSpread =
    sizes.length > 0 && Math.min(...sizes) > 0 ? Math.max(...sizes) / Math.min(...sizes) : null;

  const cells = cheapestPerStore(rows, id);
  const cheapestNames: TypeReport["cheapestNames"] = [];
  for (const store of STORES) {
    const cell = cells.get(store) as Cell;
    if (cell?.kind === "price") {
      cheapestNames.push({ store, unitPrice: cell.unitPrice, name: cell.product.name });
    }
  }

  const problems: Problem[] = [];

  // A food type that declares no unit lets kilos and litres into the same
  // ranking, and there is no arithmetic that makes those comparable. `cha`
  // holds 1.5 L bottles of iced tea at EUR 1.49 per LITRE beside 50 g boxes of
  // tea bags at EUR 39.80 per KILO, and calls the bottle the cheaper.
  //
  // This is the one problem here with a mechanical fix - declaring the unit in
  // data/food-types.ts - so it is reported apart from the judgement calls.
  const kg = usable.filter((r) => r.unit === "kg").length;
  const l = usable.filter((r) => r.unit === "l").length;
  // "either" is a declared answer - two rankings - not a missing one.
  const mixesUnits = !type?.unit && kg > 0 && l > 0;
  if (mixesUnits) {
    problems.push({ kind: "unit", text: `no unit declared: ${kg} priced by weight, ${l} by volume` });
  }

  // Products the store measures the OTHER way from what this food type
  // declares. A few are a bad parse; many mean the declaration is wrong and the
  // food is really sold both ways - "Chantilly" in litres under a kg type. So
  // it is reported as something to look at, never acted on: clearing every such
  // row was tried and would have erased 765 correctly-measured products.
  const declared = type?.unit;
  if (declared && declared !== "either") {
    const other = rows.filter(
      (r) => r.price !== null && r.packageSize !== null &&
        (r.unit === "kg" || r.unit === "l") && r.unit !== declared
    ).length;
    if (other > 0 && other >= usable.length * 0.05) {
      problems.push({
        kind: "unit",
        text: `declared ${declared}, but ${other} products are measured the other way`,
      });
    }
  }

  const tooCheap = prices.filter((p) => p < MIN_UNIT_PRICE).length;
  const tooDear = prices.filter((p) => p > MAX_UNIT_PRICE).length;
  if (tooCheap > 0) {
    problems.push({ kind: "data", text: `${tooCheap} priced under ${MIN_UNIT_PRICE} per ${type?.unit ?? "unit"}` });
  }
  if (tooDear > 0) {
    problems.push({ kind: "data", text: `${tooDear} priced over ${MAX_UNIT_PRICE} per ${type?.unit ?? "unit"}` });
  }
  if (sizeSpread !== null && sizeSpread > SIZE_SPREAD_LIMIT) {
    problems.push({ kind: "data", text: `pack sizes span ${sizeSpread.toFixed(0)}x` });
  }
  if (breadth !== null && breadth > BREADTH_LIMIT) {
    problems.push({ kind: "breadth", text: `cheapest is ${breadth.toFixed(1)}x below typical` });
  }

  return {
    id,
    label: type?.label ?? id,
    unit: type?.unit ?? "un",
    n: usable.length,
    stores: comparableStoreCount(cells),
    cheapest,
    median: mid,
    breadth,
    sizeSpread,
    cheapestNames,
    problems,
  };
}

/**
 * At or below this, a store is not quoting a price.
 *
 * Pingo Doce publishes "0,00 EUR" for a product that is listed but not
 * sellable, and one cent for a handful it cannot price at all - measured, six
 * products: a picanha, two fresh prawns, a bread, a yogurt and a tin of
 * frankfurters. Nothing in a supermarket costs a cent, and the next cheapest
 * real price in the catalogue is five, so the cut is unambiguous.
 *
 * The scraper now refuses these at the source. This clears the ones collected
 * before it did, because a one-cent picanha is the cheapest beef in the country
 * and would head the ranking until the next crawl three hours from now.
 */
const PLACEHOLDER_PRICE = 0.01;

async function clearPlaceholderPrices(apply: boolean): Promise<number> {
  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null, price: { lte: PLACEHOLDER_PRICE, gt: 0 } },
    select: { id: true, store: true, name: true, price: true },
  });
  if (rows.length === 0) return 0;

  console.log(`\n${rows.length} placeholder price(s) - a store not quoting a price:`);
  for (const r of rows) console.log(`  EUR ${r.price}  ${r.store.padEnd(11)} ${r.name.slice(0, 46)}`);
  if (apply) {
    await prisma.catalogueProduct.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { price: null },
    });
    console.log("  cleared to no-price.");
  } else {
    console.log("  --dry: not cleared.");
  }
  return rows.length;
}

async function main() {
  const dry = process.argv.includes("--dry");
  await clearPlaceholderPrices(!dry);

  const rows = (await prisma.catalogueProduct.findMany({
    where: { foodType: { not: null }, delistedAt: null },
    select: {
      storeProductId: true, store: true, name: true, brand: true,
      price: true, packageSize: true, unit: true, foodType: true,
    },
  })) as (ComparableProduct & { foodType: string })[];

  const byType = new Map<string, ComparableProduct[]>();
  for (const r of rows) {
    const list = byType.get(r.foodType) ?? [];
    list.push(r);
    byType.set(r.foodType, list);
  }

  const reports = FOOD_TYPES.map((t) => reportFor(t.id, byType.get(t.id) ?? []))
    .filter((r) => r.n > 0)
    .sort((a, b) => (b.breadth ?? 0) - (a.breadth ?? 0));

  const flagged = reports.filter((r) => r.problems.length > 0);
  const threeStore = reports.filter((r) => r.stores === 3);

  console.log(
    `${reports.length} kinds of food with at least one comparable product\n` +
      `  comparable across all three stores: ${threeStore.length}\n` +
      `  with at least one problem:          ${flagged.length}\n`
  );

  console.log("worst by breadth (cheapest far below typical):\n");
  console.log("  " + "food".padEnd(20) + "n".padStart(6) + "cheapest".padStart(10) + "median".padStart(9) + "  x    cheapest product");
  for (const r of reports.slice(0, 25)) {
    const first = r.cheapestNames[0];
    console.log(
      "  " + r.label.slice(0, 19).padEnd(20) +
        String(r.n).padStart(6) +
        (r.cheapest?.toFixed(2) ?? "-").padStart(10) +
        (r.median?.toFixed(2) ?? "-").padStart(9) +
        "  " + (r.breadth?.toFixed(1) ?? "-").padStart(5) +
        "  " + (first ? first.name.slice(0, 42) : "")
    );
  }

  const htmlPath = process.argv.find((a) => a.startsWith("--html="))?.split("=")[1];
  if (htmlPath) {
    await mkdir(dirname(htmlPath), { recursive: true });
    await writeFile(htmlPath, renderComparisonReport(reports, new Date()), "utf8");
    console.log(`\nreview page written to ${htmlPath}`);
  }

  console.log("\nother problems:\n");
  for (const r of reports) {
    for (const p of r.problems.filter((x) => x.kind !== "breadth")) {
      console.log(`  ${r.label.padEnd(20)} ${p.text}`);
    }
  }
}

main().then(() => prisma.$disconnect());
