import { nameTokens, normalizeName, stripAccents } from "./matching";

/**
 * Candidate generation: given the whole catalogue, produce the pairs of
 * products, at different stores, that are worth comparing.
 *
 * This is a cheap-guess stage, not a decision stage. It works from name, brand
 * and listing price alone, because barcode and package size do not exist until
 * a product page has been fetched, and fetching 42,000 of those is exactly what
 * this stage exists to avoid. Nothing here is a verdict: `classifyCandidate` in
 * `matching.ts` makes those, later, with the evidence.
 *
 * The problem it solves is quadratic. Scoring every cross-store pair would be
 * ~554 million comparisons; blocking - indexing straight to the small set worth
 * scoring - brings that to ~4.5 million, and runs in seconds in memory. This is
 * standard record linkage, applied rather than invented.
 *
 * I/O-free by design, like `matching.ts`, so it can be tested without a
 * database and reasoned about without a network.
 */

/** Minimum token overlap for a pair to be worth storing (FUZZY_NAME in matching.ts). */
export const MIN_SCORE = 0.45;
/**
 * A token in more than this many products at one store is useless as a block
 * key - "bio", "sem", "com" - and would degenerate into a full scan.
 */
export const TOO_COMMON = 400;
/** How many of a product's rarest tokens to look up when blocking by name. */
export const RAREST_TOKENS = 2;
/** Cap per product per target store, so one product cannot flood the table. */
export const MAX_PER_TARGET = 5;

export interface CatalogueEntry {
  id: string;
  /** the `Store` enum value, as a string - keeps this file free of Prisma */
  store: string;
  name: string;
  brand: string | null;
  price: number | null;
}

export interface CandidatePair {
  aId: string;
  bId: string;
  storeA: string;
  storeB: string;
  nameSimilarity: number;
  block: "brand" | "token";
  /** larger listing price over smaller; NOT euro per kilo, which needs a size */
  priceRatio: number | null;
}

export interface CandidateStats {
  entries: number;
  pairs: number;
  lookupsByBrand: number;
  lookupsByToken: number;
  /** products for which no target store produced any candidate above the floor */
  withoutCandidate: number;
  blockSize: { median: number; p90: number; p99: number; max: number };
  comparisons: number;
}

/**
 * Each chain's own labels, by store, accent-free and lowercase. Data rather
 * than a hardcoded condition, so a fourth or fifth store is a new entry here and
 * nothing else.
 *
 * Used for two things: skipping the brand block for own-brand products, and
 * removing the chain's name from the PRODUCT name before scoring. The second
 * matters more than it sounds. Stores put their own name in the title, so
 * "Maçã Golden Continente" and "Maçã Golden das Serras" scored 0.40 for no
 * reason but the labels - measured, removing them lifted recall against the
 * known groups from 64% to 81%.
 *
 * Pingo Doce carries several sub-labels because that is how it brands its
 * departments and ranges.
 */
export const HOUSE_LABELS: Record<string, readonly string[]> = {
  CONTINENTE: ["continente"],
  PINGO_DOCE: ["pingo doce", "as nossas planicies", "das serras", "nossa", "nosso"],
  AUCHAN: ["auchan"],
};

/**
 * Accent-free, lowercase, and stripped of everything that is not a letter or
 * digit.
 *
 * Deliberately NOT `normalizeName`, which replaces punctuation with a space:
 * that turns Pingo Doce's "L'Or" into "l or" while Continente's "LOr" becomes
 * "lor", and the two would never block together. Removing punctuation outright
 * makes both "lor". The stores really do spell the same brand differently.
 */
export function normalizeBrand(brand: string | null | undefined): string {
  return stripAccents(String(brand ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Is this the store's own label? House brands are skipped for brand blocking:
 * "Continente" and "Auchan" are different companies, not a shared brand, so
 * their own-brand products can only be matched on their names. This is a fifth
 * of the catalogue, and the hard part of the problem.
 */
export function isHouseBrand(brand: string | null | undefined, store: string): boolean {
  const normalized = normalizeBrand(brand);
  if (!normalized) return false;
  return (HOUSE_LABELS[store] ?? []).some((label) => normalized.startsWith(normalizeBrand(label)));
}

/**
 * Portuguese plurals are overwhelmingly a trailing "s", and the stores disagree
 * about number for the same product - "Bifes de Peru" against "BIFE DE PERU"
 * scored 0.40 on that alone. Folding is applied to both sides, so it can only
 * make genuinely similar names compare closer. Short tokens are left alone,
 * where a trailing "s" is more likely to be part of the word.
 */
function foldPlural(token: string): string {
  return token.length >= 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

/**
 * The tokens a product is compared on: its name, minus its own chain's labels,
 * with plurals folded. Both adjustments were measured against the 95 hand-made
 * groups rather than assumed - together they take name-only recall from 64% to
 * 83%.
 */
export function productTokens(name: string, store: string): Set<string> {
  let normalized = normalizeName(name);
  for (const label of HOUSE_LABELS[store] ?? []) {
    normalized = normalized.split(label).join(" ");
  }
  return new Set([...nameTokens(normalized)].map(foldPlural));
}

/**
 * No third-party brand: either the chain's own label, or no brand at all.
 *
 * The two cases behave identically wherever it matters. Auchan leaves the brand
 * empty on 1,267 products, mostly loose fresh produce, and Continente's empty
 * brand means "our own fresh-food range" rather than "unbranded". Neither has a
 * manufacturer behind it, so neither can share a barcode with another chain's
 * equivalent - the codes are assigned by the retailer.
 */
export function isOwnBrand(brand: string | null | undefined, store: string): boolean {
  return normalizeBrand(brand) === "" || isHouseBrand(brand, store);
}

/** A brand usable as a block key: present, and not the store's own label. */
export function blockableBrand(entry: CatalogueEntry): string | null {
  if (isOwnBrand(entry.brand, entry.store)) return null;
  return normalizeBrand(entry.brand);
}

/** Jaccard overlap of two prepared token sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Order a pair so the same two products always produce the same row, whichever
 * side found the other. Without this every pair is stored twice.
 */
function canonical(x: Prepared, y: Prepared): [Prepared, Prepared] {
  const xKey = `${x.entry.store}:${x.entry.id}`;
  const yKey = `${y.entry.store}:${y.entry.id}`;
  return xKey <= yKey ? [x, y] : [y, x];
}

interface Prepared {
  entry: CatalogueEntry;
  tokens: Set<string>;
  brandKey: string | null;
}

interface StoreIndex {
  items: Prepared[];
  byBrand: Map<string, number[]>;
  byToken: Map<string, number[]>;
}

function buildIndex(items: Prepared[]): StoreIndex {
  const byBrand = new Map<string, number[]>();
  const byToken = new Map<string, number[]>();

  items.forEach((item, i) => {
    if (item.brandKey) {
      const bucket = byBrand.get(item.brandKey);
      if (bucket) bucket.push(i);
      else byBrand.set(item.brandKey, [i]);
    }
    for (const token of item.tokens) {
      const bucket = byToken.get(token);
      if (bucket) bucket.push(i);
      else byToken.set(token, [i]);
    }
  });

  return { items, byBrand, byToken };
}

/**
 * Candidates for `item` at one other store: the brand block when the brand is
 * real and known there, otherwise the union of the buckets for the product's
 * rarest tokens. Blocking is an accelerator, never a filter - a product whose
 * brand block comes up empty still falls through to the broad pass rather than
 * being abandoned.
 */
function lookup(
  item: Prepared,
  target: StoreIndex
): { indices: number[]; block: "brand" | "token" } {
  if (item.brandKey) {
    const bucket = target.byBrand.get(item.brandKey);
    if (bucket && bucket.length > 0) return { indices: bucket, block: "brand" };
  }

  const ranked = [...item.tokens]
    .map((token) => ({ token, df: target.byToken.get(token)?.length ?? 0 }))
    .filter((t) => t.df > 0)
    .sort((a, b) => a.df - b.df);

  // Prefer rare tokens; fall back to the rarest available if everything this
  // product says about itself is common.
  const usable = ranked.filter((t) => t.df <= TOO_COMMON).slice(0, RAREST_TOKENS);
  const keys = usable.length > 0 ? usable : ranked.slice(0, 1);

  const indices = new Set<number>();
  for (const { token } of keys) {
    for (const i of target.byToken.get(token) ?? []) indices.add(i);
  }
  return { indices: [...indices], block: "token" };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

export function generateCandidates(
  entries: CatalogueEntry[],
  opts: { minScore?: number; maxPerTarget?: number } = {}
): { pairs: CandidatePair[]; stats: CandidateStats } {
  const minScore = opts.minScore ?? MIN_SCORE;
  const maxPerTarget = opts.maxPerTarget ?? MAX_PER_TARGET;

  const byStore = new Map<string, Prepared[]>();
  for (const entry of entries) {
    const prepared: Prepared = {
      entry,
      tokens: productTokens(entry.name, entry.store),
      brandKey: blockableBrand(entry),
    };
    const bucket = byStore.get(entry.store);
    if (bucket) bucket.push(prepared);
    else byStore.set(entry.store, [prepared]);
  }

  const indexes = new Map<string, StoreIndex>();
  for (const [store, items] of byStore) indexes.set(store, buildIndex(items));

  // One entry per unordered pair. Both directions find the same pair, and the
  // score is symmetric, so the only thing to reconcile is provenance: a pair
  // seen through a brand block is the stronger claim and wins.
  const pairs = new Map<string, CandidatePair>();
  const blockSizes: number[] = [];
  let lookupsByBrand = 0;
  let lookupsByToken = 0;
  let withoutCandidate = 0;
  let comparisons = 0;

  for (const [store, items] of byStore) {
    for (const item of items) {
      let found = false;

      for (const [otherStore, target] of indexes) {
        if (otherStore === store) continue;

        const { indices, block } = lookup(item, target);
        if (indices.length === 0) continue;
        blockSizes.push(indices.length);
        if (block === "brand") lookupsByBrand++;
        else lookupsByToken++;

        const scored: { other: Prepared; score: number }[] = [];
        for (const i of indices) {
          const other = target.items[i];
          comparisons++;
          const score = jaccard(item.tokens, other.tokens);
          if (score >= minScore) scored.push({ other, score });
        }

        scored.sort((x, y) => y.score - x.score);
        for (const { other, score } of scored.slice(0, maxPerTarget)) {
          found = true;
          const [a, b] = canonical(item, other);
          const key = `${a.entry.id}|${b.entry.id}`;
          const existing = pairs.get(key);
          if (existing && !(existing.block === "token" && block === "brand")) continue;

          const prices = [a.entry.price, b.entry.price];
          const priceRatio =
            prices[0] !== null && prices[1] !== null && Math.min(prices[0], prices[1]) > 0
              ? Math.max(prices[0], prices[1]) / Math.min(prices[0], prices[1])
              : null;

          pairs.set(key, {
            aId: a.entry.id,
            bId: b.entry.id,
            storeA: a.entry.store,
            storeB: b.entry.store,
            nameSimilarity: score,
            block,
            priceRatio,
          });
        }
      }

      if (!found) withoutCandidate++;
    }
  }

  blockSizes.sort((a, b) => a - b);

  return {
    pairs: [...pairs.values()],
    stats: {
      entries: entries.length,
      pairs: pairs.size,
      lookupsByBrand,
      lookupsByToken,
      withoutCandidate,
      blockSize: {
        median: percentile(blockSizes, 0.5),
        p90: percentile(blockSizes, 0.9),
        p99: percentile(blockSizes, 0.99),
        max: blockSizes[blockSizes.length - 1] ?? 0,
      },
      comparisons,
    },
  };
}
