import type { ProductNote } from "./daily-report";

/**
 * What a nightly run learned beyond today's prices: which published ids it had
 * never opened, what they turned out to be, and how much of the store is still
 * unexamined.
 *
 * This is the half of the report that answers "is the catalogue COMPLETE?",
 * which is a different question from "are its prices FRESH?" and was previously
 * unanswerable - the compliant crawler could only ever refresh products it
 * already held.
 */
export interface DiscoveryExtras {
  /** product ids the sitemap published this run */
  sitemapEntries: number;
  /**
   * What the last BELIEVED run saw, which is what both guards measure against -
   * and when, because after a distrusted night that baseline can be several
   * days old and "was 101,398" alone hides which day it means.
   */
  sitemapPrevious: number | null;
  sitemapBaselineAt: string | null;

  /**
   * The immediately previous run, believed or not. A separate figure from the
   * baseline: night-over-night movement is what a reader actually wants to see,
   * while the baseline is what the guard is entitled to compare against.
   */
  sitemapLastRun: {
    entries: number;
    files: number;
    at: string;
    trusted: boolean;
  } | null;
  /**
   * False when the sitemap came back suspiciously smaller than last time. A
   * truncated file is far likelier than a store losing thousands of products
   * overnight, so discovery is skipped rather than acted on.
   */
  sitemapTrusted: boolean;
  /**
   * Why it was not trusted, in words - null when it was. Kept as a reason
   * rather than a flag because the causes call for different responses: an
   * outage fixes itself, a file that stopped being listed does not.
   */
  sitemapDistrust: string | null;
  /**
   * Set when figures that looked wrong have now persisted long enough to be
   * treated as the new normal. Reported loudly rather than absorbed quietly:
   * the baseline moved, and that is exactly the kind of change that should
   * never happen without somebody being told.
   */
  sitemapAccepted: string | null;
  /** product sitemap files the index listed, and what it listed last run */
  sitemapFiles: number;
  sitemapFilesPrevious: number | null;

  /** entries in each file this run, in the order the index listed them */
  sitemapPerFile: { url: string; entries: number }[];
  /**
   * Files that shrank sharply against their own previous size. Reported, not
   * acted on - see FILE_SHRINK_LIMIT for why.
   */
  sitemapFileWarnings: string[];

  /**
   * `<loc>` entries whose product id could not be extracted, so they were
   * dropped. Should be zero; it was 170 for months without anyone knowing.
   */
  sitemapUnparseable: number;
  sitemapUnparseableSamples: string[];

  /** ids opened for the FIRST time this run, drawn from the backlog */
  examined: number;
  /** ids re-opened because their verdict had gone stale */
  rechecked: number;
  verdictNotFood: number;
  verdictDead: number;
  /** the ProductCheck total at the previous run, for run-over-run comparison */
  verdictPrevTotal: number | null;
  /** true when ProductCheck shrank since the previous run - a real anomaly */
  verdictShrank: boolean;
  /** ids that turned out to be food and entered the catalogue */
  newFood: ProductNote[];
  newFoodCount: number;

  /** published ids still never opened */
  unexaminedRemaining: number;
  /** at this run's rate, nights until nothing is unexamined */
  nightsToComplete: number | null;

  /** products we hold that the sitemap no longer lists - an early warning */
  droppedFromSitemap: ProductNote[];
  droppedFromSitemapCount: number;

  /** products that reached three consecutive dead nights this run */
  delistedNow: ProductNote[];
  delistedNowCount: number;
  /** products still live but no longer in a food section */
  recategorised: ProductNote[];
  recategorisedCount: number;

  /**
   * Pages that failed in a way that does NOT mean "gone" - a 5xx, a socket
   * error. Deliberately not counted towards delisting.
   */
  unreachable: number;
}

/** Examples carried per list, matching the other reports. */
export const SAMPLE = 12;

export function nightsToComplete(remaining: number, perNight: number): number | null {
  if (remaining <= 0) return 0;
  if (perNight <= 0) return null;
  return Math.ceil(remaining / perNight);
}
