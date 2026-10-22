import { prisma } from "../../lib/db";
import { storeName } from "../../lib/stores";

/**
 * How many of a run's products the store marked as on promotion - the early
 * warning that the store changed how it marks them.
 *
 * Every reader turns a missing promotion marker into "not on promotion" rather
 * than an error (src/scrapers/types.ts), so a markup change does not stop a
 * crawl; it quietly turns every promotion into a full price. Counting is the
 * only way to notice. The retired daily scrape printed these counts until 21
 * October 2026; this brings them back into each crawl's report.
 *
 * Measured on 21 October 2026, products on sale: Continente 4,730 of 17,197 on
 * promotion (28%), Pingo Doce 2,675 of 9,791 (27%). Auchan's listing walk read
 * no promotion at all until 22 October 2026; since then it reads the struck
 * earlier price on each tile (auchanTilePromotion) - 3 of the 48 tiles on its
 * first listing page, so its share may well sit below the others'. A store
 * not in this set is reported as not read, and never warned about.
 */

/** Stores whose crawl reads the promotion marker today. */
const READS_PROMOTIONS = new Set(["CONTINENTE", "PINGO_DOCE", "AUCHAN"]);

/** Fewer products than this is a test or partial run: too few to judge a share. */
const MIN_SEEN = 500;
/** About a quarter is normal; most of the catalogue on promotion means a misread marker. */
const MAX_SHARE = 0.7;
/** Most products with no promotion state at all means the marker is no longer found. */
const MAX_UNKNOWN = 0.5;

export interface PromotionTally {
  store: string;
  /** products this run saw (last seen at or after its start) */
  seen: number;
  onPromotion: number;
  notOnPromotion: number;
  /** no promotion state recorded */
  unknown: number;
  /** set when the count itself failed; the figures above are then zero, not measured */
  error?: string;
}

/**
 * The promotion state of every product the run starting at `since` saw.
 *
 * Never throws: it runs at the very end of a crawl, after everything is saved,
 * and a failed count must not cost the night its report. A failure comes back
 * as `error`, which the line and the warning both state.
 */
export async function tallyPromotions(store: string, since: Date): Promise<PromotionTally> {
  try {
    const where = { store, delistedAt: null, lastSeenAt: { gte: since } };
    const [seen, onPromotion, notOnPromotion] = await Promise.all([
      prisma.catalogueProduct.count({ where }),
      prisma.catalogueProduct.count({ where: { ...where, onPromotion: true } }),
      prisma.catalogueProduct.count({ where: { ...where, onPromotion: false } }),
    ]);
    return { store, seen, onPromotion, notOnPromotion, unknown: seen - onPromotion - notOnPromotion };
  } catch (e) {
    return { store, seen: 0, onPromotion: 0, notOnPromotion: 0, unknown: 0, error: (e as Error).message };
  }
}

const pct = (n: number, of: number) => `${of === 0 ? 0 : Math.round((n / of) * 100)}%`;

/** One line for a report: "promotions: 4,730 of 17,095 seen (28%), 82 unknown". */
export function promotionLine(t: PromotionTally): string {
  if (t.error) return `promotions: could not be counted (${t.error.slice(0, 120)})`;
  if (!READS_PROMOTIONS.has(t.store)) {
    return `promotions: not read for ${storeName(t.store)} by this crawl (${t.seen.toLocaleString()} seen, no promotion state recorded)`;
  }
  const known = t.onPromotion + t.notOnPromotion;
  return (
    `promotions: ${t.onPromotion.toLocaleString()} of ${known.toLocaleString()} seen (${pct(t.onPromotion, known)})` +
    (t.unknown > 0 ? `, ${t.unknown.toLocaleString()} unknown` : "")
  );
}

/** A warning when the counts suggest the promotion marker is misread, or null. */
export function promotionWarning(t: PromotionTally): string | null {
  if (t.error) return `the promotion count failed (${t.error.slice(0, 120)}) - the rest of the report is unaffected`;
  if (!READS_PROMOTIONS.has(t.store) || t.seen < MIN_SEEN) return null;
  if (t.unknown / t.seen > MAX_UNKNOWN) {
    return `${pct(t.unknown, t.seen)} of the products seen have no promotion state - the promotion marker may no longer be found`;
  }
  const known = t.onPromotion + t.notOnPromotion;
  if (t.onPromotion === 0) {
    return `no product seen is marked on promotion (usually about a quarter) - the store may have changed how it marks them`;
  }
  if (t.onPromotion / known > MAX_SHARE) {
    return `${pct(t.onPromotion, known)} of the products seen are marked on promotion (usually about a quarter) - the marker may be misread`;
  }
  return null;
}
