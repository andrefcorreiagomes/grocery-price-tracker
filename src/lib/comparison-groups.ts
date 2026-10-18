import { LABELS, SUB_KINDS } from "../../data/food-tree";
import {
  cheapestPerStore,
  cheapestStores,
  comparableStoreCount,
  ownBrandPerStore,
  unitsFor,
  type Cell,
  type ComparableProduct,
  type MeasureUnit,
} from "./comparison";
import { FOOD_TYPE_BY_ID } from "./food-types";
import { labelName } from "./food-tree";

/**
 * Which products may be compared with each other, inside one kind of food.
 *
 * The food tree (data/food-tree.ts) says a price-per-kilo comparison is fair
 * only among products a shopper would swap: the same SUB-KIND (chicken breast
 * with chicken breast) and the same LABELS (fresh with fresh, tinned with
 * tinned). So a kind's products are split into groups by sub-kind, labels and
 * unit, and each group gets its own "cheapest at each chain". A product with no
 * sub-kind is compared with the others of its kind that have none.
 *
 * A group is shown when at least MIN_CHAINS chains can be priced in it - two,
 * by the user's rule of 18 October 2026, so that a store added later does not
 * change what counts as a comparison.
 *
 * Pure and I/O-free, like comparison.ts.
 */

export const MIN_CHAINS = 2;

/** A catalogue row with its place in the tree. */
export interface TreeProduct extends ComparableProduct {
  subKind: string | null;
  /** comma-separated label ids, as stored */
  labels: string | null;
}

export interface ComparisonGroup {
  /** stable within a kind: "peito|congelado|kg" */
  key: string;
  subKind: string | null;
  labels: string[];
  unit: MeasureUnit;
  /** "Peito", "Peito · Congelado", "Outros", or the kind's own name */
  title: string;
  products: number;
  cheapest: Map<string, Cell>;
  ownBrand: Map<string, Cell>;
  winners: string[];
  ownBrandWinners: string[];
  storesCompared: number;
  /** the lowest price per unit across the chains, or null */
  cheapestPrice: number | null;
}

const LABEL_ORDER = new Map(LABELS.map((l, i) => [l.id, i]));

function labelsOfRow(p: TreeProduct): string[] {
  if (!p.labels) return [];
  return p.labels
    .split(",")
    .filter(Boolean)
    .sort((a, b) => (LABEL_ORDER.get(a) ?? 99) - (LABEL_ORDER.get(b) ?? 99));
}

function title(kind: string, subKind: string | null, labels: string[]): string {
  const subs = SUB_KINDS[kind];
  const head = subKind
    ? subs?.find((s) => s.id === subKind)?.label ?? subKind
    : subs
      ? "Outros"
      : FOOD_TYPE_BY_ID.get(kind)?.label ?? kind;
  return [head, ...labels.map(labelName)].join(" · ");
}

/**
 * Every comparison group of one kind, in the order a page shows them: by
 * sub-kind as the tree lists them (products with none last), then plain before
 * labelled, then by unit. Groups below MIN_CHAINS are included with their
 * count, so a page can say how many products it could not compare.
 */
export function comparisonGroups(kind: string, rows: TreeProduct[]): ComparisonGroup[] {
  const buckets = new Map<string, { subKind: string | null; labels: string[]; rows: TreeProduct[] }>();
  for (const r of rows) {
    const labels = labelsOfRow(r);
    const k = `${r.subKind ?? ""}|${labels.join(",")}`;
    const b = buckets.get(k) ?? { subKind: r.subKind, labels, rows: [] };
    b.rows.push(r);
    buckets.set(k, b);
  }

  const subOrder = new Map((SUB_KINDS[kind] ?? []).map((s, i) => [s.id, i]));
  const ordered = [...buckets.values()].sort(
    (a, b) =>
      (a.subKind === null ? 999 : subOrder.get(a.subKind) ?? 998) -
        (b.subKind === null ? 999 : subOrder.get(b.subKind) ?? 998) ||
      a.labels.length - b.labels.length ||
      a.labels.join(",").localeCompare(b.labels.join(","))
  );

  const groups: ComparisonGroup[] = [];
  for (const b of ordered) {
    for (const unit of unitsFor(kind, b.rows)) {
      const cheapest = cheapestPerStore(b.rows, kind, unit);
      const ownBrand = ownBrandPerStore(b.rows, kind, unit);
      let lowest: number | null = null;
      for (const cell of cheapest.values()) {
        if (cell.kind === "price" && (lowest === null || cell.unitPrice < lowest)) lowest = cell.unitPrice;
      }
      groups.push({
        key: `${b.subKind ?? ""}|${b.labels.join(",")}|${unit}`,
        subKind: b.subKind,
        labels: b.labels,
        unit,
        title: title(kind, b.subKind, b.labels),
        products: b.rows.length,
        cheapest,
        ownBrand,
        winners: cheapestStores(cheapest),
        ownBrandWinners: cheapestStores(ownBrand),
        storesCompared: comparableStoreCount(cheapest),
        cheapestPrice: lowest,
      });
    }
  }
  return groups;
}

/** The groups a page shows: comparable at MIN_CHAINS chains or more. */
export function shownGroups(groups: ComparisonGroup[]): ComparisonGroup[] {
  return groups.filter((g) => g.storesCompared >= MIN_CHAINS);
}

/**
 * The group that stands for the kind in the food list: a named sub-kind before
 * "Outros" (chicken is better represented by its breast than by whatever names
 * no cut), plain (no labels) before labelled, then the one with the most
 * products. Null when nothing can be compared.
 */
export function mainGroup(groups: ComparisonGroup[]): ComparisonGroup | null {
  const shown = shownGroups(groups);
  if (shown.length === 0) return null;
  return [...shown].sort(
    (a, b) =>
      Number(a.subKind === null) - Number(b.subKind === null) ||
      a.labels.length - b.labels.length ||
      b.products - a.products
  )[0];
}
