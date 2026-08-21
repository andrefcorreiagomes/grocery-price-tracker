/**
 * Deciding whether to believe a sitemap.
 *
 * Two failures are possible and they pull in opposite directions.
 *
 * Believing a bad sitemap is the obvious one: a truncated file looks exactly
 * like a smaller shop, and phase 1 would report thousands of live products as
 * no longer published.
 *
 * DISBELIEVING A GOOD ONE is the subtler one, and worse. If the store
 * legitimately reorganises - six sitemap files become five - a guard that only
 * ever compares against the last trusted run distrusts every future run, skips
 * discovery every night, and stops the catalogue growing. Nothing recovers on
 * its own; the only symptom is a warning that repeats forever.
 *
 * So suspicion has to be able to expire. A figure that persists across several
 * runs is not a glitch, whatever it looked like on the first night, and is
 * accepted as the new normal.
 */

/** Below this share of the trusted entry count, a sitemap looks truncated. */
export const SHRINK_LIMIT = 0.95;

/**
 * Consecutive runs reporting the same suspicious figures before we accept them.
 *
 * Three is a judgement, not a measurement: enough that a transient glitch on
 * consecutive nights is implausible, few enough that a real reorganisation
 * costs at most three nights of discovery. Prices are unaffected throughout.
 */
export const RUNS_BEFORE_ACCEPTING = 3;

export interface SitemapObservation {
  entries: number;
  files: number;
  trusted: boolean;
}

export interface TrustInput {
  /** what this run read; `error` set when it could not be read at all */
  entries: number;
  files: number;
  error: string | null;
  /** the most recent run we believed, if any */
  baseline: { entries: number; files: number } | null;
  /** runs since that baseline, newest first, believed or not */
  recent: SitemapObservation[];
}

export interface TrustVerdict {
  trusted: boolean;
  /** why not, in words, for the console and the report; null when trusted */
  distrust: string | null;
  /** set when suspicion expired and this run's figures became the new normal */
  accepted: string | null;
}

function sameAs(a: SitemapObservation, entries: number, files: number): boolean {
  // Entry counts drift a little day to day as products come and go; the file
  // count does not, so it is compared exactly.
  return a.files === files && Math.abs(a.entries - entries) <= Math.max(50, entries * 0.005);
}

export function judgeSitemap(input: TrustInput): TrustVerdict {
  const { entries, files, error, baseline, recent } = input;

  // Unreadable is never acceptable, however many times it repeats. There are no
  // figures to accept, and skipping discovery is the only option regardless.
  if (error !== null) {
    return { trusted: false, distrust: `could not be read (${error})`, accepted: null };
  }

  if (files === 0) {
    return {
      trusted: false,
      distrust: "the index listed no product sitemap files at all",
      accepted: null,
    };
  }

  if (baseline === null) {
    // Nothing to compare against. A sitemap with files in it is the best
    // evidence available on a first run.
    return { trusted: true, distrust: null, accepted: null };
  }

  let suspicion: string | null = null;
  if (files < baseline.files) {
    suspicion = `the index listed ${files} product file(s), down from ${baseline.files}`;
  } else if (entries < baseline.entries * SHRINK_LIMIT) {
    suspicion = `it shrank from ${baseline.entries.toLocaleString()} to ${entries.toLocaleString()} entries`;
  }

  if (suspicion === null) return { trusted: true, distrust: null, accepted: null };

  // Suspicion expires. Count how many consecutive recent runs saw the same
  // thing; if this run makes RUNS_BEFORE_ACCEPTING, it is the new normal.
  let matching = 1; // this run
  for (const observation of recent) {
    if (!sameAs(observation, entries, files)) break;
    matching++;
    if (matching >= RUNS_BEFORE_ACCEPTING) break;
  }

  if (matching >= RUNS_BEFORE_ACCEPTING) {
    return {
      trusted: true,
      distrust: null,
      accepted:
        `${suspicion}, but the same figures have now held for ${matching} consecutive runs - ` +
        `treating them as the new normal rather than a fault`,
    };
  }

  return {
    trusted: false,
    distrust:
      `${suspicion} (seen ${matching} run(s) in a row; accepted as normal at ${RUNS_BEFORE_ACCEPTING})`,
    accepted: null,
  };
}
