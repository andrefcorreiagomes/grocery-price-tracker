/**
 * Cross-store product matching primitives.
 *
 * Pure and I/O-free on purpose: the pilot measures these against real crawled
 * data, and they are meant to survive into the production matcher unchanged.
 * Nothing here decides anything on its own - the functions score and classify,
 * and a caller (or a human, via the review queue) makes the call.
 */

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Drop diacritics so "cafe" and "café" compare equal. */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const SIZE_TOKEN =
  /\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|gr|grs|l|lt|ml|cl)\b/gi;
const PACK_TOKEN = /\b(?:pack|emb|embalagem|un|uni|unidades?)\b\.?/gi;

/**
 * Lowercased, accent-free, size- and pack-word-stripped, whitespace-collapsed.
 * The size is removed because it is matched separately and numerically; leaving
 * it in the name would let "1 kg" vs "5 kg" of the same rice score as similar
 * text when they must be treated as different products.
 */
export function normalizeName(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(SIZE_TOKEN, " ")
    .replace(PACK_TOKEN, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(name: string): Set<string> {
  return new Set(normalizeName(name).split(" ").filter((t) => t.length > 1));
}

/** Jaccard overlap of the two token sets, 0..1. */
export function tokenSimilarity(a: string, b: string): number {
  const sa = nameTokens(a);
  const sb = nameTokens(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return shared / (sa.size + sb.size - shared);
}

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

export type SizeUnit = "kg" | "l";

export interface ParsedSize {
  /** total base quantity: packCount * each, in kg or L */
  total: number;
  unit: SizeUnit;
  packCount: number;
}

/**
 * Pull a size out of a product name: "6x1 L", "3 x 120 g", "500 gr", "1,5L",
 * "33 cl". Returns null when the name carries no size (common for fresh/counter
 * goods sold by weight) - the caller must treat that as "unknown", never as a
 * match. Grams fold to kg and ml/cl to L so cross-store comparison is unit-safe.
 */
export function parseSize(name: string): ParsedSize | null {
  const flat = stripAccents(name).toLowerCase();

  // A RANGE is not a size. Auchan grades fish by weight and writes the grade
  // where a size would go, in grams but labelled kg:
  //
  //   TRUTA SALMONADA 800/1600 KG        a trout graded 800-1600 GRAMS
  //   DOURADA FRESCA INTEIRA 400/600 KG
  //
  // Taking the number nearest the unit read that as 1,600 kg. We genuinely do
  // not know what one of these weighs, so the honest answer is "unknown" -
  // and an unknown size is already handled everywhere, whereas a wrong one
  // sorts to the top of every cheapest-per-kilo ranking.
  if (/\d+\s*\/\s*\d+\s*(?:kg|gr?s?|g|lt?|ml|cl)\b/.test(flat)) return null;

  const m = flat.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|gr?s?|g|lt?|ml|cl)\b/);
  if (!m) return null;

  const packCount = m[1] ? Number(m[1]) : 1;
  let each = Number(m[2].replace(",", "."));
  if (!Number.isFinite(each) || !Number.isFinite(packCount) || each <= 0) return null;

  const raw = m[3];

  // Auchan writes volumes as CENTILITRES with the decimal point dropped, and
  // labels them L. Read literally these were 100x too large:
  //
  //   033L -> 0.33    050L -> 0.50    075L -> 0.75
  //   100L -> 1.00    150L -> 1.50
  //
  // Applied only to LITRES and only to exactly three digits with no separator.
  // No grocery item is sold in 100-999 litres, so nothing real is caught.
  // Grams are left alone: 500 g is both plausible and common.
  const isLitres = raw === "l" || raw === "lt";
  if (isLitres && /^\d{3}$/.test(m[2])) {
    each = each / 100;
  }

  let unit: SizeUnit;
  let eachBase: number;
  if (raw === "kg") {
    unit = "kg";
    eachBase = each;
  } else if (raw.startsWith("g")) {
    unit = "kg";
    eachBase = each / 1000;
  } else if (raw === "ml") {
    unit = "l";
    eachBase = each / 1000;
  } else if (raw === "cl") {
    unit = "l";
    eachBase = each / 100;
  } else {
    unit = "l"; // l, lt
    eachBase = each;
  }

  // A single container of ten litres or more is not a grocery product, so a
  // value this large means the name was misread and we do not know the size.
  //
  // It is the TWO-digit form of the notation above, and unlike the three-digit
  // form it cannot be decoded, because the two readings contradict each other
  // on real products:
  //
  //   6X33L   is 0.33 L cans        -> the digits are centilitres
  //   4X15L   is 1.5 L bottles      -> the decimal goes after the first digit
  //
  // Both are Auchan water and soft drinks; nothing in the string separates
  // them. Guessing would be right about half the time and silently wrong the
  // rest, and a size that is too large lands at the top of every
  // cheapest-per-kilo ranking. Unknown is already handled everywhere, so it is
  // the answer that cannot mislead.
  // Ten litres, or thirty kilos, in ONE container is not a grocery product, so
  // a value this large means the name was misread and the size is unknown.
  //
  // For volumes it is the TWO-digit form of the notation above, which unlike
  // the three-digit form cannot be decoded, because the two readings
  // contradict each other on real products:
  //
  //   6X33L   is 0.33 L cans       -> the digits are centilitres
  //   4X15L   is 1.5 L bottles     -> the decimal goes after the first digit
  //
  // Both are Auchan water and soft drinks and nothing in the string separates
  // them. Guessing would be right about half the time and silently wrong the
  // rest. For weights it catches a calibre written where a size goes, as in
  // `CHOURICAO PROBAR T/80 KG`, an 80 kg sausage.
  //
  // The thresholds are set above the largest real thing each unit sells: a 10 L
  // water garrafao and a 25 kg sack both survive. Unknown is already handled
  // everywhere, and a size that is too large lands at the top of every
  // cheapest-per-kilo ranking, so it is the answer that cannot mislead.
  if (unit === "l" && eachBase > 10) return null;
  if (unit === "kg" && eachBase > 30) return null;

  return { total: packCount * eachBase, unit, packCount };
}

/** Same dimension, and total quantity within tolerance (default 5%). */
export function sizesMatch(a: ParsedSize, b: ParsedSize, tolerance = 0.05): boolean {
  if (a.unit !== b.unit) return false;
  const hi = Math.max(a.total, b.total);
  const lo = Math.min(a.total, b.total);
  return hi > 0 && (hi - lo) / hi <= tolerance;
}

// ---------------------------------------------------------------------------
// EAN
// ---------------------------------------------------------------------------

/** Zero-pad to GTIN-14, the GS1 standard form and a clean fixed index width. */
export function normalizeEan(raw: string): string {
  return raw.replace(/\D/g, "").padStart(14, "0");
}

/**
 * GS1 prefix 2 = restricted circulation: codes each retailer mints for its own
 * weighed/counter goods. They identify a scale ticket, not a product, so they
 * must never be matched between stores. Tested on the GTIN-14 form, where the
 * leading pad zero puts the "2" at index 1.
 */
export function isRestrictedCirculationEan(raw: string): boolean {
  const n = normalizeEan(raw);
  return n[1] === "2";
}

/** Standard GS1 mod-10 check digit over the GTIN-14 form. */
export function isValidEan(raw: string): boolean {
  const n = normalizeEan(raw);
  if (!/^\d{14}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const d = n.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === n.charCodeAt(13) - 48;
}

/** A barcode usable for cross-store matching: valid, and not restricted-circulation. */
export function matchableEan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!isValidEan(raw)) return null;
  if (isRestrictedCirculationEan(raw)) return null;
  return normalizeEan(raw);
}

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
  return normalizeName(a) === normalizeName(b) && normalizeName(a).length > 0;
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
