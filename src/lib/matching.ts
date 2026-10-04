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

/**
 * Does a product name contain every word of a search term? Accents, case and
 * punctuation are ignored, and a trailing "s" on a term word is optional, so
 * "acucar mascavado" finds "Açúcar Mascavado", "ovos" finds "Ovo Cozido" and
 * "limao" finds "Limões". Whole words only, so "sal" does not find "salmão".
 * Used by `npm run discover`, which searches our own catalogue.
 */
export function matchesTerm(name: string, term: string): boolean {
  // Portuguese plurals, folded on both sides: the same rules as `foldPlural`
  // in food-types.ts (which imports this file, so it cannot be imported here).
  const fold = (w: string) =>
    w.length >= 5 && w.endsWith("oes") ? w.slice(0, -3) + "ao"
    : w.length >= 4 && w.endsWith("aes") ? w.slice(0, -3) + "ao"
    : w.length >= 5 && w.endsWith("ais") ? w.slice(0, -3) + "al"
    : w.length >= 4 && w.endsWith("s") ? w.slice(0, -1)
    : w;
  const words = (t: string) =>
    stripAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(fold);
  const inName = new Set(words(name));
  return words(term).every((w) => inName.has(w));
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
  /** total base quantity, in kg or L: packCount * each, plus any "+30G" added amount */
  total: number;
  unit: SizeUnit;
  packCount: number;
}

/**
 * A name saying the product is sold loose by weight, so the listed price is the
 * price per kilo: ending in KG ("BATATA VERMELHA LAVADA KG"), or saying
 * granel / ao quilo. Deliberately narrow - a name merely CONTAINING "kg" is
 * usually a pack size, which parseSize handles better.
 *
 * Also a name ENDING in a weight range - "SALMÃO FRESCO INTEIRO 2KG A 3KG",
 * "ROBALO GRANDE 800G A 1KG" - which is how the fish counter grades a fish it
 * sells by the kilo. Read as a 2 kg pack, that salmon was EUR 4.00/kg.
 * The unit may be written once and the range bracketed, as in "POLVO
 * CONGELADO (4 A 5 KG)": six Auchan octopuses read as 2-5 kg packs, at EUR
 * 3-8 a kilo instead of their EUR 15-17.
 *
 * A strong hint, not proof: Auchan's own per-unit figure showed "LINGUIÇA ...
 * KG" to be a 150 g pack and a quail "KG" to be priced per bird. Where Auchan's
 * listing gives that figure, `auchanTileSize` decides instead.
 */
export const SOLD_PER_KG =
  /(\bkg\b\s*$)|(\d\s*(?:kg|g)?\s+a\s+\d+(?:[.,]\d+)?\s*kg\s*\)?\s*$)|\bgranel\b|\bao\s+quilo\b|\bpor\s+kg\b/i;

/** What Auchan's own per-unit figure says about a product's size. */
export interface TileSize {
  packageSize: number | null;
  unit: SizeUnit | null;
  sizeSource: "listing";
}

/**
 * Read a product's size from the per-unit figure Auchan prints on every listing
 * tile (`.auc-measures--price-per-unit`), instead of guessing from the name.
 * Returns undefined when the figure settles nothing, so the name decides as
 * before. Measured on 64 tiles across three listings, 3 October 2026:
 *
 *   "8.6 €/Kg"   any product   Auchan's own price per kilo. The pack is the
 *                              price over it: LINGUIÇA ... KG at EUR 1.29 is
 *                              150 g, not a kilo.
 *   "8.98 €/un"  name says KG  the price differs from the figure, so the price
 *                              is per kilo and the figure is one piece: a whole
 *                              duck at EUR 4.49/kg, EUR 8.98 the bird.
 *   "1.25 €/un"  name says KG  the price EQUALS the figure: per item, or one
 *                              item weighing a kilo - the tile cannot say. A
 *                              quail at EUR 1.25 is almost certainly per bird.
 *                              Unknown, and the KG rule must not fill it in.
 *   "0.21 €/un"  otherwise     no verdict. A box of 12 eggs shows the price of
 *                              one egg; calling that a price per kilo would be
 *                              wrong, so the name decides.
 *
 * Sizes are kept to three significant figures, which is gram precision on a
 * pack and still right for 0.3 g of saffron.
 */
export function auchanTileSize(price: number, figureText: string, name: string): TileSize | undefined {
  const m = figureText.match(/([\d.,]+)\s*€\s*\/\s*(kg|lt?|un)\b/i);
  if (!m || !(price > 0)) return undefined;
  const figure = Number(m[1].replace(",", "."));
  if (!Number.isFinite(figure) || figure <= 0) return undefined;
  const per = m[2].toLowerCase();

  if (per === "kg" || per === "l" || per === "lt") {
    const unit: SizeUnit = per === "kg" ? "kg" : "l";
    const size = Number((price / figure).toPrecision(3));
    if (!Number.isFinite(size) || size <= 0) return undefined;
    return reconcileTileSize({ total: size, unit }, name);
  }

  // "€/un" only means something for a name that claims to be sold by the kilo.
  if (!SOLD_PER_KG.test(stripAccents(name))) return undefined;
  if (Math.abs(figure - price) > 0.005) return { packageSize: 1, unit: "kg", sizeSource: "listing" };
  // Equal: the tile cannot tell per-item from a one-kilo piece. A size written
  // in the name still beats nothing; otherwise unknown, deliberately.
  if (parseSize(name)) return undefined;
  return { packageSize: null, unit: null, sizeSource: "listing" };
}

/**
 * Decide between the size Auchan's per-kilo figure implies and the size its
 * product name states.
 *
 * Auchan's figure is right far more often than not, but it is not proof: its
 * figure is computed from a size Auchan stores, and that size is sometimes
 * wrong too. Measured over 16,106 products on 4 October 2026:
 *
 *   14,509  agree within 2%           the figure confirms the name
 *    1,136  name states no size       the figure is all there is
 *      372  disagree, both believable mixed: "4*100G" burgers are 400 g as the
 *                                     figure says; a 75 G rocket bag is not the
 *                                     100 g its figure implies
 *       72  kilos versus litres       the same number, a different unit
 *       17  figure impossible         LASANHA IGLO BOLONHESA 300G as 399 kg
 *
 * Trusting the figure everywhere (the first version) priced that lasagna and a
 * Magnum multipack at EUR 0.01 per kilo. So the figure decides only where it
 * clearly helps, and every other case keeps the name - which is what decided
 * before the figure was read, so no product ends up worse than it was:
 *
 *   - no size in the name      the figure, if believable (30 kg, 10 L at most)
 *   - within 10% of the name   the name's exact size; the gap is mostly Auchan
 *                              rounding its figure to the cent on cheap items
 *   - 2 to 9 times the name    the figure: a pack count the name reader missed,
 *                              as in "SNICKERS SNACK 3 PACK 50G" (150 g)
 *   - anything else            undefined, so the name decides as before
 */
export function reconcileTileSize(tile: { total: number; unit: SizeUnit }, name: string): TileSize | undefined {
  const believable = tile.unit === "kg" ? tile.total <= 30 : tile.total <= 10;
  const named = parseSize(name);
  if (!named) return believable ? { packageSize: tile.total, unit: tile.unit, sizeSource: "listing" } : undefined;
  if (!believable || named.unit !== tile.unit) return undefined;

  const ratio = tile.total / named.total;
  if (Math.abs(ratio - 1) <= 0.1) return { packageSize: named.total, unit: named.unit, sizeSource: "listing" };
  // Two to nine only. Ten is not a missed pack count but Auchan's own error:
  // some figures are a price per 100 g labelled per kilo, which makes "GEL
  // MYPROTEIN ... 60G" look like 601 g. A real ten-pack says "10X" in its name,
  // and the name reader already counts that.
  //
  // And only where the name itself says multipack - PACK, *, +, "LEVE 4 PAGUE
  // 3", GRÁTIS, OFERTA - and the name reader did NOT already count it. Without
  // that, a plain "SALSICHA BEYOND MEAT VEGETAL 200G" became 1 kg, and "QUINOA
  // ... 2X100G", already read as 2 x 100 g, became 1 kg too: whole multiples,
  // but Auchan's error, not a missed count.
  const count = Math.round(ratio);
  const saysMultipack = /\bpack\b|\*|\+|\bleve\s+\d|\bgratis\b|\boferta\b/i.test(stripAccents(name));
  if (saysMultipack && named.packCount === 1 &&
      count >= 2 && count <= 9 && Math.abs(ratio - count) / count <= 0.02) {
    return { packageSize: tile.total, unit: tile.unit, sizeSource: "listing" };
  }
  return undefined;
}

/**
 * Pull a size out of a product name: "6x1 L", "3 x 120 g", "500 gr", "1,5L",
 * "33 cl". Returns null when the name carries no size (common for fresh/counter
 * goods sold by weight) - the caller must treat that as "unknown", never as a
 * match. Grams fold to kg and ml/cl to L so cross-store comparison is unit-safe.
 */
export function parseSize(name: string): ParsedSize | null {
  // "Nº20" is a model number, not a quantity. Auchan's made-to-order cakes are
  // "BOLO CAKE DESIGN PRODUÇÃO PRÓPRIA Nº20 KG" - design 20, sold by the kilo -
  // and reading 20 kg put cake at EUR 0.95/kg, the cheapest in the country.
  // Removed rather than refused, so a real size elsewhere in the name survives.
  const flat = stripAccents(name).toLowerCase().replace(/\bn\.?\s*[º°]\s*\d+/g, " ");

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

  // The same thing written out with "a" for "to", which is how the fish counter
  // states a grade rather than a weight:
  //
  //   ROBALO GRANDE 800G A 1KG        a sea bass graded 800 g to 1 kg
  //   SALMAO CABEÇA 2KG A 3KG
  //
  // Taking the first number called that salmon head 2 kg, and at EUR 1.89 the
  // cheapest salmon in the country.
  if (/\d+\s*(?:kg|gr?s?|g|lt?|ml|cl)\s+a\s+\d+\s*(?:kg|gr?s?|g|lt?|ml|cl)\b/.test(flat)) return null;
  // And with the unit written once: "POLVO CONGELADO (4 A 5 KG)". Kilos only,
  // because in grams it is a net weight, not a grade - "PÊSSEGO FERBAR
  // METADES 810 A 860G" is a can.
  if (/\d+(?:[.,]\d+)?\s+a\s+\d+(?:[.,]\d+)?\s*kg\b/.test(flat)) return null;

  // A MINIMUM is not a size either: "POLVO GRANDE CONGELADO (+6 KG)" is an
  // octopus weighing more than 6 kg, priced per kilo. Read as a 6 kg pack it
  // was EUR 2.83/kg, the cheapest octopus in the country.
  if (/\(\s*\+\s*\d+(?:[.,]\d+)?\s*(?:kg|gr?s?|g)\s*\)/.test(flat)) return null;

  // Two digits with a leading zero before L is the dropped-decimal notation
  // below in a form it cannot decode: "PEPSI ZERO 1+05L OFERTA" is 1 L plus
  // 0.5 L free, and read as 5 L it was EUR 0.25 a litre. One name, 4 Oct 2026.
  if (/(?<![\d.,])0\d\s*lt?\b/.test(flat)) return null;

  // `L'Or` is a coffee brand, not a litre. Continente writes the roast strength
  // into the name and the brand straight after it, so "Cápsulas de Café
  // Fortissimo Int 10 L'Or" read as 10 LITRES of coffee - and at EUR 4.99 that
  // is EUR 0.50 a litre, the cheapest coffee in the catalogue by a distance.
  //
  // Anchored on the apostrophe, which is what separates the brand from a real
  // unit: "10 L" keeps its meaning, "10 L'Or" does not.
  if (/\d\s*l\s*['’]/.test(flat)) return null;

  const m = flat.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|gr?s?|g|lt?|ml|cl)\b/);
  if (!m) return null;

  const packCount = m[1] ? Number(m[1]) : 1;
  let each = Number(m[2].replace(",", "."));
  if (!Number.isFinite(each) || !Number.isFinite(packCount) || each <= 0) return null;

  const raw = m[3];

  // Portuguese writes a THOUSANDS separator as a dot, and Auchan leaves it in
  // front of a small unit, where it reads as a decimal point:
  //
  //   MARISCADA COZIDA UNIDADE 1.200 GR   is 1200 g, read as 1.2 g
  //   RATATOUILLE BONDUELLE 0.375G        is  375 g, read as 0.375 g
  //   KOMBUCHA PLENO CHA VERDE BIO 0.250ML is 250 ml, read as 0.25 ml
  //
  // Exactly THREE digits after the dot, and only before g/gr/ml/cl. That is
  // what a thousands group looks like, and nothing is sold in fractions of a
  // gram - whereas one or two decimals genuinely are used for the tiny
  // expensive things, and must be left alone:
  //
  //   ACAFRAO AUCHAN MOIDO 3 DOSES 0.3 G   really is 0.3 g of saffron
  //   VAGEM ESPIGA DE BAUNILHA SAQUETA 1.2G really is a 1.2 g vanilla pod
  //
  // Those come out at roughly EUR 10,000 and 3,800 per kilo, which is what
  // saffron and vanilla actually cost.
  if (/^\d+\.\d{3}$/.test(m[2]) && (raw.startsWith("g") || raw === "ml" || raw === "cl")) {
    each = each * 1000;
  }

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
    // Nothing is sold in fractions of a centilitre: "0.33CL" and "0.75CL" are
    // Auchan writing litres with the wrong unit - a 0.33 L can, a 0.75 L bottle
    // - and its own per-litre figure agrees. Read as cl they were 3.3 ml and
    // 7.5 ml, a smoothie at EUR 492 a litre. Three names in the catalogue.
    eachBase = each < 1 ? each : each / 100;
  } else {
    unit = "l"; // l, lt
    eachBase = each;
  }

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

  // An amount ADDED to the pack, usually free for a while, is part of what the
  // shopper takes home and pays the one price for:
  //
  //   FIAMBRE DA PERNA EXTRA IZIDORO FATIAS FINAS 120G+30G      150 g
  //   MEL GRANJA SAN FRANCISCO 850G+150G GRÁTIS                 1 kg
  //   REFRIGERANTE ... FANTA LARANJA 1.5L+0.5L GRÁTIS (SDR)     2 L
  //
  // Reading only the first amount made all 14 such names (Auchan, 4 October
  // 2026) 18-33% dearer per kilo than they are. Added only when the second
  // amount is in the same dimension; anything else keeps the first alone.
  let total = packCount * eachBase;
  const extra = flat.slice((m.index ?? 0) + m[0].length).match(/^\s*\+\s*(\d+(?:[.,]\d+)?\s*(?:kg|gr?s?|g|lt?|ml|cl))\b/);
  const added = extra ? parseSize(extra[1]) : null;
  if (added && added.unit === unit) total += added.total;

  return { total, unit, packCount };
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
