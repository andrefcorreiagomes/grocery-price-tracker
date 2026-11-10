import { isTinnedFood } from "./sizes";
import { stripAccents } from "./text";
import { STORE_LABELS } from "./stores";

/**
 * Tins compared like with like (the owner's choice, 10 November 2026; the
 * private notes' assumptions 8.27, 8.28, 8.34 and 8.35).
 *
 * A tin has two weights: the FULL one, with its liquid, and the DRAINED one
 * ("peso escorrido"). The stores give one, the other or both, and a row of
 * tins must compare all its tins by the same one. Each product carries the
 * weights its store LABELS (fullWeight/drainedWeight, from the store's page or
 * name); a single number nobody labels is "unplaced".
 *
 * Every night, before the comparisons are read (npm run tins:weights), a tin
 * missing a weight is placed from another store's label:
 *   1. the same barcode at another store that labels both weights;
 *   2. the product our matcher grouped with it there (same name, brand, size);
 *   4. a judgement checked by hand (data/tin-weights.ts).
 * Each placed weight says where it came from, and the site marks it.
 *
 * In a row: by the drained weight if every tin has one, else by the full weight
 * if every tin has one, else by whichever more tins have (drained on a tie). An
 * unplaced tin counts either way and stays at the number its store shows; a
 * tin whose weights are known but not of the row's kind sits out of that row.
 *
 * Pure, like comparison.ts.
 */

export type Weights = { full: number | null; drained: number | null };
export type Basis = "drained" | "full";

/** What a tin row needs of a catalogue row. */
export interface TinFields {
  name: string;
  labels?: string | null;
  packageSize: number | null;
  unit: string | null;
  fullWeight?: number | null;
  fullWeightSource?: string | null;
  drainedWeight?: number | null;
  drainedWeightSource?: string | null;
  /** a size proven in data/store-errors.ts, left exactly as it is */
  sizeConfirmed?: boolean;
}

/** A food in a tin or jar of liquid: the tin label, or a tin's words in the name. */
export function isTin(p: { name: string; labels?: string | null }): boolean {
  return (p.labels ?? "").split(",").includes("lata") || isTinnedFood(p.name);
}

/** Nothing to drain: a sauce or pulp sold in a tin ("TOMATE FRITO HEINZ 350(210)G"). */
const SAUCE = /^\s*(tomate frito|molho|polpa|passata|ketchup)\b/;

/**
 * Both weights from an Auchan name, in kg: "PÊSSEGO EM CALDA 840 (480)G",
 * "(85)120G", "115G (72G)", a pack "3X75(65)G". The larger is the full weight.
 * Null when the name gives one weight or none, and for a sauce, whose second
 * figure is not a drained weight (src/lib/sizes.ts, parseSize).
 */
export function nameTinWeights(name: string): Weights | null {
  const flat = stripAccents(name).toLowerCase();
  if (SAUCE.test(flat)) return null;
  const n = (s: string) => Number(s.replace(",", "."));
  const kg = (grams: number, unit: string) => (unit.startsWith("k") ? grams : grams / 1000);
  let m = flat.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(?:kg|gr?s?|g)?\s*\)\s*(kg|gr?s?|g)\b/);
  let pair: [number, number, number, string] | null = m ? [m[1] ? Number(m[1]) : 1, n(m[2]), n(m[3]), m[4]] : null;
  if (!pair) {
    m = flat.match(/\(\s*(\d{2,}(?:[.,]\d+)?)\s*(?:kg|gr?s?|g)?\s*\)\s*(\d+(?:[.,]\d+)?)\s*(kg|gr?s?|g)\b/);
    if (m) pair = [1, n(m[1]), n(m[2]), m[3]];
  }
  if (!pair) {
    m = flat.match(/(\d+(?:[.,]\d+)?)\s*(kg|grs?|gr|g)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(kg|grs?|gr|g)\s*\)/);
    // a larger bracket is a multipack's total ("4X 36.5G (146G)"), not a weight pair
    if (m && m[2].startsWith("k") === m[4].startsWith("k") && n(m[3]) < n(m[1])) pair = [1, n(m[1]), n(m[3]), m[2]];
  }
  if (!pair) return null;
  const [count, a, b, unit] = pair;
  const full = count * kg(Math.max(a, b), unit);
  const drained = count * kg(Math.min(a, b), unit);
  if (!(drained > 0) || drained === full) return null;
  return { full: Number(full.toFixed(4)), drained: Number(drained.toFixed(4)) };
}

/** Two weights the same, give or take a store's rounding: 2 g or 2%. */
export function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.002, 0.02 * Math.max(a, b));
}

/**
 * Place a tin's missing weight from another store's label for the same product,
 * which gives both. The weight we have (or, with none labelled, the single
 * number the store shows) must equal one of the other's; the other then gives
 * the missing one. Null when it settles nothing, or when the numbers disagree.
 */
export function placeFrom(
  own: Weights,
  packageSize: number | null,
  other: { full: number; drained: number }
): { full: number; drained: number } | null {
  if (own.full !== null && own.drained !== null) return null;
  if (own.drained !== null) return sameWeight(own.drained, other.drained) ? { full: other.full, drained: own.drained } : null;
  if (own.full !== null) return sameWeight(own.full, other.full) ? { full: own.full, drained: other.drained } : null;
  if (packageSize === null) return null;
  // The other labels the same number twice ("125 gr (peso escorrido 125 gr)",
  // sardines in tomato sauce): the single number is both.
  if (sameWeight(other.full, other.drained)) return sameWeight(packageSize, other.full) ? { full: packageSize, drained: packageSize } : null;
  // The same tin at both: its single number is whichever of the other's it equals.
  if (sameWeight(packageSize, other.drained) && !sameWeight(packageSize, other.full)) return { full: other.full, drained: packageSize };
  if (sameWeight(packageSize, other.full) && !sameWeight(packageSize, other.drained)) return { full: packageSize, drained: other.drained };
  return null;
}

/** Where a weight we did not read on the product's own page came from, as the site says it. */
export function weightNote(basis: Basis, source: string | null | undefined): string | null {
  if (!source || source === "page" || source === "name") return null;
  const what = basis === "drained" ? "Peso escorrido" : "Peso total";
  const [how, store] = source.split(":");
  const at = store ? (STORE_LABELS as Record<string, string>)[store] ?? store : "";
  if (how === "barcode") return `${what} do rótulo do mesmo produto (mesmo código de barras) no ${at}; a loja não o indica.`;
  if (how === "same-product") return `${what} do rótulo do mesmo produto no ${at}; a loja não o indica.`;
  if (how === "reviewed") return `${what} estimado por nós e verificado; a loja não o indica.`;
  return null;
}

/**
 * One row's tins by one weight. Returns the row's kind of weight (null when it
 * holds no tins sold by weight) and its rows: each tin's `packageSize` set to
 * the weight compared, with `weightNote` where that weight was not on the
 * product's own page; a tin whose known weights are not of the row's kind
 * sits out - no size, and `tinSitsOut` naming the only weight it has, so the
 * page says why. Every other product is passed through untouched.
 */
export function tinRow<T extends TinFields>(rows: T[]): { basis: Basis | null; rows: (T & { weightNote?: string | null; tinSitsOut?: Basis })[] } {
  const tins = rows.filter((r) => r.unit === "kg" && !r.sizeConfirmed && isTin(r));
  if (tins.length === 0) return { basis: null, rows };
  const unplaced = (r: T) => (r.fullWeight ?? null) === null && (r.drainedWeight ?? null) === null;
  const hasDrained = (r: T) => (r.drainedWeight ?? null) !== null || unplaced(r);
  const hasFull = (r: T) => (r.fullWeight ?? null) !== null || unplaced(r);
  const drained = tins.filter(hasDrained).length;
  const full = tins.filter(hasFull).length;
  const basis: Basis = drained === tins.length ? "drained" : full === tins.length ? "full" : drained >= full ? "drained" : "full";
  const tinSet = new Set<T>(tins);
  const out: (T & { weightNote?: string | null; tinSitsOut?: Basis })[] = [];
  for (const r of rows) {
    if (!tinSet.has(r) || unplaced(r)) {
      out.push(r);
      continue;
    }
    const weight = basis === "drained" ? r.drainedWeight : r.fullWeight;
    // Sits out: kept without a size, so it is no store's cheapest, but the store
    // still shows as selling it, with the reason (never as "not available").
    if (weight === null || weight === undefined) {
      out.push({ ...r, packageSize: null, tinSitsOut: basis === "drained" ? "full" : "drained" });
      continue;
    }
    const source = basis === "drained" ? r.drainedWeightSource : r.fullWeightSource;
    out.push({ ...r, packageSize: weight, weightNote: weightNote(basis, source) });
  }
  return { basis, rows: out };
}
