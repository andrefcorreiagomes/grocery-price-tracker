import { isMeaningfulShortfall } from "./report";
import { MIN_ATTEMPTED } from "./reidentification";

/**
 * The guards a GRID crawl needs and a sitemap crawl does not.
 *
 * Continente reads one product page at a time against a sitemap that lists every
 * published id, so "is the catalogue complete" is a set subtraction it can trust.
 * Auchan reads listing grids, and a grid can lie by omission: a truncated
 * response, a renamed tile attribute, a category field that stopped being
 * emitted - each shrinks what we collect with nothing thrown and nothing logged.
 * Absence is the whole basis for delisting, so a walk that under-collected must
 * never be allowed to delist: these guards turn each silent shortfall into a
 * number the run can FAIL on, and freeze delisting when they do.
 *
 * All are pure, so the thresholds are tested without a crawl, and all skip a
 * `--max-pages` smoke test (`complete === false`), which is meant to collect part
 * of the catalogue and would trip every one of them.
 */

/**
 * Above this share of KEPT tiles arriving with no category, the food filter is
 * about to drop most of the catalogue: `topSegment("")` is empty, and
 * `isFoodSegment` says false, so an empty category field reads as non-food.
 */
export const EMPTY_CATEGORY_LIMIT = 0.05;
/**
 * Above this share of `[data-gtm]` tiles failing to parse, the tile reader is
 * broken rather than the odd malformed tile. A renamed attribute discards every
 * tile at once; a healthy grid discards essentially none.
 */
export const TILE_DISCARD_LIMIT = 0.05;

function overLimit(count: number, of: number, limit: number, complete: boolean): boolean {
  if (!complete) return false;
  if (of < MIN_ATTEMPTED) return false;
  return count / of > limit;
}

// --- the incomplete-walk brake -------------------------------------------

export interface WalkCompleteness {
  /**
   * Tiles the grid actually HANDED OVER, whether or not we could read them.
   *
   * Deliberately not the count of products we parsed. Those are different
   * questions with different owners, and conflating them made the first real
   * Auchan run fail for no reason: the grid served all 55,200 tiles it
   * published, our tile reader could not parse 805 of them (a 98.5% yield, well
   * inside what the yield guard allows), and comparing PARSED against PUBLISHED
   * re-counted those same 805 as evidence the grid had been truncated. Two
   * guards then disagreed about one set of numbers, and the stricter one froze
   * a healthy run. Truncation is the grid's failure; a low yield is ours.
   */
  delivered: number;
  /** what the store's own counter published across the walk */
  published: number;
  /** department slugs whose grid id could not be read, so were never walked */
  failedDepartments: string[];
  /** false on a `--max-pages` smoke test, which is meant to be partial */
  complete: boolean;
}

/**
 * Did the grid hand over materially fewer tiles than Auchan said it holds, or
 * was a whole department never walked? Either way part of the catalogue was
 * never offered to us, absence stops being evidence, and the caller must freeze
 * delisting.
 *
 * Reuses `isMeaningfulShortfall` - the same more-than-5 AND more-than-1% bar the
 * coverage report already applies per category - so there is no new threshold to
 * calibrate, and 1% of the root catalogue is ~550 products, far more than any
 * real night's turnover.
 *
 * What this does NOT judge: whether we could read what arrived (isTileYieldCollapse)
 * or whether the grid repeated itself (the duplicate figure, reported not
 * alarmed - measured at 1 tile in 54,395, so a threshold would be noise).
 */
export function isTruncatedWalk(input: WalkCompleteness): boolean {
  if (!input.complete) return false;
  if (input.failedDepartments.length > 0) return true;
  if (input.published <= 0) return false; // no counter to judge against
  const gap = input.published - input.delivered;
  return gap > 0 && isMeaningfulShortfall(gap, input.published);
}

/**
 * Above this share of the catalogue we hold going unseen by a single walk, the
 * walk under-collected. This is the same signal as `isTruncatedWalk` measured
 * against OUR OWN catalogue rather than the store's counter, so it still fires
 * when the store publishes no count - and it is what stops phase 2 from fetching
 * a product page for every one of thousands of falsely-missing products.
 */
export const MISSING_LIMIT = 0.1;

/** Did a single walk miss an implausible share of the catalogue we already hold? */
export function isUnderCollectedWalk(input: {
  missing: number;
  live: number;
  complete: boolean;
}): boolean {
  return overLimit(input.missing, input.live, MISSING_LIMIT, input.complete);
}

export function underCollectedReason(input: {
  missing: number;
  live: number;
  complete: boolean;
}): string | null {
  if (!isUnderCollectedWalk(input)) return null;
  return (
    `${((100 * input.missing) / input.live).toFixed(0)}% of the catalogue we hold ` +
    `(${input.missing.toLocaleString()} of ${input.live.toLocaleString()}) was not seen by this walk - ` +
    `far more than a night's turnover, so the walk under-collected. Delisting was frozen and no page was ` +
    `fetched to confirm those absences: on a truncated walk they are not real.`
  );
}

export function incompleteWalkReasons(input: WalkCompleteness): string[] {
  if (!input.complete) return [];
  const reasons: string[] = [];
  if (input.failedDepartments.length > 0) {
    reasons.push(
      `${input.failedDepartments.length} department(s) could not be walked (${input.failedDepartments.join(", ")}) ` +
        `- a whole slice of the catalogue is absent, so delisting was frozen. Nothing was marked gone.`
    );
  }
  const gap = input.published - input.delivered;
  if (input.published > 0 && gap > 0 && isMeaningfulShortfall(gap, input.published)) {
    reasons.push(
      `the grid served ${input.delivered.toLocaleString()} tiles of the ${input.published.toLocaleString()} the store ` +
        `published (${gap.toLocaleString()} short, ${((100 * gap) / input.published).toFixed(1)}%) - part of the ` +
        `catalogue was never offered to us, so absence is not evidence and delisting was frozen. Nothing was marked gone.`
    );
  }
  return reasons;
}

// --- the empty-category brake --------------------------------------------

export interface TileHealth {
  /** `[data-gtm]` tiles encountered */
  tilesSeen: number;
  /** of those, how many parsed to a usable product */
  tilesKept: number;
  /** kept tiles that carried no category path */
  withoutCategory: number;
  complete: boolean;
}

/** Too many kept tiles with no category: the food filter is about to empty the catalogue. */
export function isEmptyCategoryStorm(input: TileHealth): boolean {
  return overLimit(input.withoutCategory, input.tilesKept, EMPTY_CATEGORY_LIMIT, input.complete);
}

/** Too many tiles failing to parse: the tile reader broke, not the odd bad tile. */
export function isTileYieldCollapse(input: TileHealth): boolean {
  const discarded = input.tilesSeen - input.tilesKept;
  return overLimit(discarded, input.tilesSeen, TILE_DISCARD_LIMIT, input.complete);
}

/** Phrased reasons for both tile guards, empty when the tiles are healthy. */
export function tileHealthReasons(input: TileHealth): string[] {
  const reasons: string[] = [];
  const pct = (n: number, of: number) => ((100 * n) / Math.max(1, of)).toFixed(0);

  if (isTileYieldCollapse(input)) {
    const discarded = input.tilesSeen - input.tilesKept;
    reasons.push(
      `${pct(discarded, input.tilesSeen)}% of grid tiles could not be parsed ` +
        `(${discarded.toLocaleString()} of ${input.tilesSeen.toLocaleString()}) - a tile attribute has been ` +
        `renamed or reshaped, and products were dropped in silence. Delisting was frozen.`
    );
  }
  if (isEmptyCategoryStorm(input)) {
    reasons.push(
      `${pct(input.withoutCategory, input.tilesKept)}% of tiles arrived with no category ` +
        `(${input.withoutCategory.toLocaleString()} of ${input.tilesKept.toLocaleString()}) - the food filter reads ` +
        `an empty category as non-food, so the catalogue was about to empty itself. Delisting was frozen.`
    );
  }
  return reasons;
}

// --- the gate in front of the confirmation pass ---------------------------

/**
 * May this run treat a product's absence as worth confirming with a page fetch?
 *
 * This is deliberately NOT any single guard, and it lives here rather than
 * inline in the runner because getting it wrong is expensive at the store's
 * expense rather than ours.
 *
 * Every guard above stands down when `complete` is false, which is right for
 * each of them - on a deliberate slice they would all fire - and leaves nothing
 * whatsoever in front of the confirmation pass. A `--max-pages=2` run walks
 * about 400 products against a catalogue of ~17,800, so without the `complete`
 * term the pass would fetch a product page for the ~17,400 it never looked for:
 * hours of requests to confirm absences that are an artefact of the flag.
 *
 * So a product page is fetched only when the walk both COVERED everything and
 * was believed. Otherwise absence is not evidence, and the right number of
 * requests is zero.
 */
export function shouldConfirmAbsences(input: {
  complete: boolean;
  walkFrozen: boolean;
}): boolean {
  return input.complete && !input.walkFrozen;
}

// --- the unknown-segment monitor -----------------------------------------

export interface SegmentCount {
  segment: string;
  /** distinct products seen under this top segment this run */
  count: number;
  /** whether the food whitelist kept it */
  kept: boolean;
}

export interface SegmentComparison {
  /**
   * Segments the whitelist DROPPED that were not present last run. A new food
   * department published under an unrecognised name hides here - this is how
   * `produtos-locais` was found. WARN: worth a look, not proof of a fault.
   */
  appeared: SegmentCount[];
  /**
   * Segments the whitelist KEPT last run that are gone this run. A real food
   * department vanishing is either a store change or a walk that missed it, and
   * both are worth a FAIL.
   */
  vanished: SegmentCount[];
  /**
   * True when there was no previous tally to compare against, so this run's
   * segments become the baseline and NOTHING is reported as new.
   *
   * Without this the set arithmetic is technically right and practically
   * useless: with an empty `before`, every segment the whitelist drops is
   * "not present last run", so a first walk accuses every non-food department
   * Auchan sells - tecnologia, casa, brinquedos, beleza and the rest - of
   * having just appeared. Fifteen to twenty-five warnings, all false, on the
   * one run a reader is most likely to be reading closely. An alarm that fires
   * on the first run for a reason that is not a fault is an alarm people learn
   * to skip.
   */
  firstRun: boolean;
}

/**
 * Compare this run's segment tally against the previous run's. Pure, so the set
 * arithmetic is tested without a database.
 */
export function compareSegments(now: SegmentCount[], before: SegmentCount[]): SegmentComparison {
  if (before.length === 0) return { appeared: [], vanished: [], firstRun: true };

  const nowByName = new Map(now.map((s) => [s.segment, s]));
  const beforeNames = new Set(before.map((s) => s.segment));

  const appeared = now.filter((s) => !s.kept && !beforeNames.has(s.segment));
  const vanished = before.filter((s) => s.kept && !nowByName.has(s.segment));

  return { appeared, vanished, firstRun: false };
}
