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
  const m = stripAccents(name)
    .toLowerCase()
    .match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|gr?s?|g|lt?|ml|cl)\b/);
  if (!m) return null;

  const packCount = m[1] ? Number(m[1]) : 1;
  const each = Number(m[2].replace(",", "."));
  if (!Number.isFinite(each) || !Number.isFinite(packCount) || each <= 0) return null;

  const raw = m[3];
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

export type Rung = "ean" | "exact" | "fuzzy" | "reject";

export interface Candidate {
  name: string;
  brand: string;
  ean?: string | null;
  size: ParsedSize | null;
  /** price per base unit (kg or L); null when size is unknown */
  unitPrice: number | null;
}

export interface Classification {
  rung: Rung;
  nameSimilarity: number;
  sizeKnown: boolean;
  sizeMatches: boolean;
  /** relative euro-per-base-unit gap, when both unit prices are known */
  priceGap: number | null;
  /** false when a hard signal contradicts the match (EAN, or price divergence) */
  vetoed: boolean;
  reason: string;
}

const EXACT_NAME = 0.7;
const FUZZY_NAME = 0.45;
/** euro-per-kg this far apart is evidence they are not the same product. */
const PRICE_GUARD = 0.4;

function brandsEqual(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b) && normalizeName(a).length > 0;
}

/**
 * Score a candidate pair. Never returns a decision to ship - "ean"/"exact" mean
 * "safe to auto-track unless vetoed", "fuzzy" means "send to review", "reject"
 * means "not the same product". The price guard and a real EAN conflict set
 * `vetoed`, which a caller must treat as overriding the rung however good the
 * name looks.
 */
export function classifyCandidate(a: Candidate, b: Candidate): Classification {
  const nameSimilarity = tokenSimilarity(a.name, b.name);
  const sizeKnown = a.size !== null && b.size !== null;
  const sizeMatches = sizeKnown && sizesMatch(a.size as ParsedSize, b.size as ParsedSize);

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

  // A real barcode conflict is the strongest signal there is: different products.
  if (eanConflict) {
    return {
      rung: "reject", nameSimilarity, sizeKnown, sizeMatches, priceGap,
      vetoed: true, reason: "barcodes differ",
    };
  }

  const priceVeto = priceGap !== null && priceGap > PRICE_GUARD;

  if (eanAgree) {
    return {
      rung: "ean", nameSimilarity, sizeKnown, sizeMatches, priceGap,
      vetoed: priceVeto,
      reason: priceVeto ? "barcodes agree but euro/unit diverges" : "barcodes agree",
    };
  }

  const sameBrand = brandsEqual(a.brand, b.brand);

  if (sameBrand && sizeMatches && nameSimilarity >= EXACT_NAME) {
    return {
      rung: "exact", nameSimilarity, sizeKnown, sizeMatches, priceGap,
      vetoed: priceVeto,
      reason: priceVeto ? "exact match but euro/unit diverges" : "brand+size+name",
    };
  }

  if (nameSimilarity >= FUZZY_NAME && (!sizeKnown || sizeMatches)) {
    return {
      rung: "fuzzy", nameSimilarity, sizeKnown, sizeMatches, priceGap,
      vetoed: false, reason: "needs review",
    };
  }

  return {
    rung: "reject", nameSimilarity, sizeKnown, sizeMatches, priceGap,
    vetoed: false,
    reason: sizeKnown && !sizeMatches ? "different size" : "low name similarity",
  };
}
