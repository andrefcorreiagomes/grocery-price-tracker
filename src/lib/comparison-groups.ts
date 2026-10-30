import { CATCH_ALL_KINDS, CATCH_ALL_SUB_KINDS, FORM_LABELS, FORM_SUB_KIND_KINDS, LABELS, SUB_KINDS } from "../../data/food-tree";
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
  /**
   * Never shown: "Outros" (the products of a kind with sub-kinds that fit none
   * of them), or a catch-all kind or sub-kind (CATCH_ALL_KINDS in the tree)
   */
  others: boolean;
}

/**
 * Left out of every comparison: the "imperfect produce" lines, Continente's
 * "Zero Desperdício" and "Combate ao Desperdício" and Pingo Doce's "sem
 * Desperdício". They often won "cheapest", and we do not know they are sold in
 * shops across the country (the user's decision, 29 October 2026; Auchan has
 * no such line).
 */
export function leftOutOfComparisons(name: string): boolean {
  return /desperd[ií]cio/i.test(name);
}

/** A whole kind kept off the site because its products are too unlike to compare. */
export function isCatchAllKind(kind: string): boolean {
  return CATCH_ALL_KINDS.has(kind);
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
    if (leftOutOfComparisons(r.name)) continue;
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
        others:
          (b.subKind === null && SUB_KINDS[kind] !== undefined) ||
          CATCH_ALL_KINDS.has(kind) ||
          (b.subKind !== null && (CATCH_ALL_SUB_KINDS[kind] ?? []).includes(b.subKind)),
      });
    }
  }
  return groups;
}

export interface AnyForm {
  /** the key of the group after which the line goes: the family's last one */
  afterKey: string;
  /** the comparisons it spans, as titled on the page */
  titles: string[];
  store: string;
  productName: string;
  unitPrice: number;
  unit: MeasureUnit;
}

/**
 * "The cheapest per kilo in any form": one line under comparisons that differ
 * only by form - sliced or not, fillets or whole fish, cinnamon sticks or
 * ground (FORM_LABELS in the tree). The forms are compared apart, and this
 * still answers the question across them (the user's decision, 29 October
 * 2026). Only where two or more such comparisons are shown.
 */
export function anyFormLines(kind: string, shown: ComparisonGroup[]): AnyForm[] {
  const families = new Map<string, ComparisonGroup[]>();
  for (const g of shown) {
    const head = FORM_SUB_KIND_KINDS.has(kind) ? "" : g.subKind ?? "";
    const key = `${head}|${g.labels.filter((l) => !FORM_LABELS.has(l)).join(",")}|${g.unit}`;
    families.set(key, [...(families.get(key) ?? []), g]);
  }
  const lines: AnyForm[] = [];
  for (const groups of families.values()) {
    if (groups.length < 2) continue;
    let best: AnyForm | null = null;
    for (const g of groups) {
      for (const [store, cell] of g.cheapest) {
        if (cell.kind !== "price" || (best !== null && cell.unitPrice >= best.unitPrice)) continue;
        best = { afterKey: "", titles: [], store, productName: cell.product.name, unitPrice: cell.unitPrice, unit: g.unit };
      }
    }
    if (best) lines.push({ ...best, afterKey: groups[groups.length - 1].key, titles: groups.map((g) => g.title) });
  }
  return lines;
}

/**
 * The groups a page shows: comparable at MIN_CHAINS chains or more, and never
 * "Outros". That group gathers whatever fits no named sub-kind, so its cheapest
 * products are often unlike things - on 29 October 2026 a light milk against a
 * growing-up milk for children and 200 ml cartons, beef for roasting against
 * beef ribs - and the user decided it is not shown at all.
 */
export function shownGroups(groups: ComparisonGroup[]): ComparisonGroup[] {
  return groups.filter((g) => g.storesCompared >= MIN_CHAINS && !g.others);
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
