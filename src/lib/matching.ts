/**
 * Cross-store product matching: scoring and classifying a candidate pair.
 * The text, size and barcode helpers it uses were moved to text.ts,
 * sizes.ts and barcodes.ts on 22 October 2026 (code review M8), unchanged.
 *
 * Pure and I/O-free on purpose: the pilot measures these against real crawled
 * data, and they are meant to survive into the production matcher unchanged.
 * Nothing here decides anything on its own - the functions score and classify,
 * and a caller (or a human, via the review queue) makes the call.
 */

import { matchableEan } from "./barcodes";
import { sizesMatch, type ParsedSize } from "./sizes";
import { normalizeBrand, stripAccents, tokenSimilarity } from "./text";

// ---------------------------------------------------------------------------
// Candidate classification
// ---------------------------------------------------------------------------

export type Rung = "ean" | "exact" | "cross-size" | "fuzzy" | "reject";

export interface Candidate {
  name: string;
  brand: string;
  ean?: string | null;
  size: ParsedSize | null;
  /** price per base unit (kg or L); null when size is unknown */
  unitPrice: number | null;
  /**
   * Whether this is the selling chain's own label. Supplied by the caller,
   * which knows the store; this module stays store-agnostic. It matters only
   * for barcodes - see `classifyCandidate`.
   */
  ownBrand?: boolean;
}

export interface Classification {
  rung: Rung;
  nameSimilarity: number;
  sizeKnown: boolean;
  sizeMatches: boolean;
  /** larger total / smaller total when both sizes are known (1 = equal); null otherwise */
  sizeRatio: number | null;
  /** relative euro-per-base-unit gap, when both unit prices are known */
  priceGap: number | null;
  /** false when a hard signal contradicts the match (same-size EAN clash, or price divergence) */
  vetoed: boolean;
  reason: string;
}

const EXACT_NAME = 0.7;
const FUZZY_NAME = 0.45;
/**
 * euro-per-kg this far apart is evidence the two are not the same product. This
 * is the guard that still bites on cross-size matches: two Nutella jars of
 * different sizes should have SIMILAR euro/kg, so a wide gap there is suspicious
 * even though the pack prices differ.
 */
const PRICE_GUARD = 0.4;

function brandsEqual(a: string, b: string): boolean {
  return normalizeBrand(a) === normalizeBrand(b) && normalizeBrand(a).length > 0;
}

/**
 * Words that make a different product of the same brand and size. Without a
 * barcode, "exact" rested on brand, size and a similar name - and Continente's
 * regular "Leite UHT Meio Gordo Mimosa" was confirmed as Auchan's "LEITE MIMOSA
 * UHT ESPECIAL 0% LACTOSE MEIO GORDO 6X1L". Measured on 17 October 2026, 31 of
 * the 150 such pairs differed on one of these words: organic against regular,
 * zero against regular, light against full-fat, vegan against regular.
 *
 * Some of them may really be one product whose other listing leaves the word
 * out. The names cannot say which, so they go to a person rather than being
 * confirmed or rejected.
 */
const QUALIFIERS: [string, RegExp][] = [
  ["lactose", /lactose/],
  ["light", /\blight\b|\bmagr[oa]s?\b/],
  ["meio gordo", /meio[ -]gord/],
  ["gordo", /(?<!meio[ -])\bgord[oa]s?\b|\binteir[oa]\b/],
  ["zero", /\bzero\b|\b0%/],
  ["bio", /\bbio(logic[oa])?\b/],
  ["sem açúcar", /sem acucar|s\/ ?acucar/],
  ["descafeinado", /descafeinad/],
  ["proteína", /protein/],
  ["sem glúten", /sem gluten/],
  ["vegan", /\bvegan|\bvegetal\b/],
];

/** The first qualifier one name has and the other lacks, or null. */
export function qualifierMismatch(a: string, b: string): string | null {
  const na = stripAccents(a).toLowerCase();
  const nb = stripAccents(b).toLowerCase();
  for (const [word, re] of QUALIFIERS) if (re.test(na) !== re.test(nb)) return word;
  return null;
}

/**
 * Score a candidate pair.
 *
 * Two different questions hide inside "do these match", and this project cares
 * about both:
 *   - same SKU?         the identical 400 g jar. EAN-confirmable, sizes equal.
 *   - same product?     Nutella at whatever size each store stocks. Compared on
 *                       euro/kg, which is the whole point of the app's unit
 *                       pricing - a store selling only the 800 g jar should
 *                       still be comparable to one selling only the 400 g.
 *
 * So a size mismatch is NOT a rejection - it demotes the pair to "cross-size",
 * which goes to review carrying the size ratio, never auto-tracked. And an EAN
 * conflict only vetoes when the sizes are EQUAL (same size + different barcode =
 * genuinely different products, e.g. two coffees a manufacturer numbers
 * separately); different size + different barcode is expected and must not veto.
 *
 * Rungs: "ean"/"exact" = safe to auto-track unless vetoed; "cross-size"/"fuzzy"
 * = send to review; "reject" = not the same product. `vetoed` (a same-size EAN
 * clash, or euro/unit divergence) overrides a positive rung however good the
 * name looks.
 */
export function classifyCandidate(
  a: Candidate,
  b: Candidate,
  opts: {
    /**
     * A name score computed by the caller, used instead of comparing the raw
     * names here.
     *
     * This module is store-agnostic, so `tokenSimilarity` cannot strip a chain's
     * own label out of a product name or fold Portuguese plurals - and both
     * matter enormously. Measured: "Maçã Golden das Serras" against "Maçã Golden
     * Continente" scores 0.40 on raw tokens and 1.00 once the house labels go;
     * "Bifes de Peru" against "BIFE DE PERU" scores 0.29 raw. Candidate
     * GENERATION already computes the better score with `productTokens`, which
     * knows the store, so the caller passes it in rather than this function
     * recomputing a worse one and rejecting pairs generation was right about.
     */
    nameSimilarity?: number;
  } = {}
): Classification {
  const nameSimilarity = opts.nameSimilarity ?? tokenSimilarity(a.name, b.name);
  const sizeKnown = a.size !== null && b.size !== null;
  const sizeMatches = sizeKnown && sizesMatch(a.size as ParsedSize, b.size as ParsedSize);

  let sizeRatio: number | null = null;
  if (sizeKnown) {
    const x = (a.size as ParsedSize).total;
    const y = (b.size as ParsedSize).total;
    sizeRatio = Math.min(x, y) > 0 ? Math.max(x, y) / Math.min(x, y) : null;
  }

  let priceGap: number | null = null;
  if (a.unitPrice !== null && b.unitPrice !== null) {
    const hi = Math.max(a.unitPrice, b.unitPrice);
    const lo = Math.min(a.unitPrice, b.unitPrice);
    priceGap = hi > 0 ? (hi - lo) / hi : 0;
  }

  const ea = matchableEan(a.ean);
  const eb = matchableEan(b.ean);
  const eanAgree = ea !== null && eb !== null && ea === eb;
  const eanConflict = ea !== null && eb !== null && ea !== eb;

  const base = { nameSimilarity, sizeKnown, sizeMatches, sizeRatio, priceGap };
  const priceVeto = priceGap !== null && priceGap > PRICE_GUARD;

  /**
   * Two chains' own labels ALWAYS carry different barcodes - they are different
   * SKUs made for different companies - so a clash between them is guaranteed in
   * advance and therefore proves nothing. Vetoing on it rejected 34 of 64
   * own-brand pairs in a measured slice, including "MORANGO AUCHAN 500 G"
   * against "Morango Continente", which is exactly the comparison a shopper
   * wants.
   *
   * Such pairs fall through to name, size and euro/unit instead. They can still
   * be rejected on that evidence, and they can never reach "ean" or "exact"
   * (the brands differ), so they land in review rather than being auto-tracked -
   * which is right, since nothing available can confirm them outright.
   */
  const bothOwnBrand = a.ownBrand === true && b.ownBrand === true;

  // Same-size (or size-unknown) barcode clash = genuinely different products.
  // A cross-size clash is expected, so it falls through to the size logic below.
  if (eanConflict && !bothOwnBrand && !(sizeKnown && !sizeMatches)) {
    return { ...base, rung: "reject", vetoed: true, reason: "same-size barcodes differ" };
  }

  if (eanAgree) {
    return {
      ...base, rung: "ean", vetoed: priceVeto,
      reason: priceVeto ? "barcodes agree but euro/unit diverges" : "barcodes agree",
    };
  }

  const sameBrand = brandsEqual(a.brand, b.brand);

  // Same brand and size, but one name says lactose-free, organic, zero, light...
  // and the other does not: probably a different product, so a person looks.
  const differs = sameBrand && sizeMatches && nameSimilarity >= EXACT_NAME ? qualifierMismatch(a.name, b.name) : null;
  if (differs) {
    return { ...base, rung: "fuzzy", vetoed: priceVeto, reason: `names differ on "${differs}"` };
  }

  // Clean same-size match: safe to auto-track.
  if (sameBrand && sizeMatches && nameSimilarity >= EXACT_NAME) {
    return {
      ...base, rung: "exact", vetoed: priceVeto,
      reason: priceVeto ? "exact match but euro/unit diverges" : "brand+size+name",
    };
  }

  // Same product line, different pack size: compare on euro/kg, but a human
  // confirms it (packaging economies make big size gaps quietly misleading).
  if (nameSimilarity >= FUZZY_NAME && sizeKnown && !sizeMatches) {
    return {
      ...base, rung: "cross-size", vetoed: priceVeto,
      reason: priceVeto
        ? `different size (${sizeRatio?.toFixed(1)}x) and euro/unit diverges`
        : `same product, different size (${sizeRatio?.toFixed(1)}x)`,
    };
  }

  // Decent name, size matches or unknown: uncertain, review.
  if (nameSimilarity >= FUZZY_NAME) {
    return { ...base, rung: "fuzzy", vetoed: priceVeto, reason: "needs review" };
  }

  return { ...base, rung: "reject", vetoed: false, reason: "low name similarity" };
}
