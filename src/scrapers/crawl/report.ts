import type { PersistSummary } from "./persist";
import type { CategoryResult } from "./types";

export interface CoverageReport {
  /** one formatted line per category, ready to print */
  lines: string[];
  /** distinct products kept across every category */
  total: number;
  /** labels of categories that fell meaningfully short of what the store lists */
  short: string[];
}

/**
 * A shortfall has to clear both bars to be worth a warning: more than 5 products
 * AND more than 1% of what the category lists.
 *
 * Small gaps are normal. Stock changes while we page through a category, so a
 * few products slide across page boundaries on every run - the last full crawl
 * was short by 1 and by 3 in sections of several thousand. Warning about those
 * teaches us to ignore the warning, and this one exists to catch the bug that
 * once took 94 products of 1,436 while still exiting 0.
 *
 * Both bars are needed: a percentage alone would shout about one missing item
 * out of Ovos' 13, and a count alone would swallow a 30-product category whole.
 */
export function isMeaningfulShortfall(gap: number, expected: number): boolean {
  return gap > 5 && gap > expected * 0.01;
}

/**
 * Format a crawl's per-category results against the counts the store publishes
 * for itself. Shared by every runner so a crawl is judged the same way wherever
 * it is started from - the first Pingo Doce crawl exited 0 having collected less
 * than half the catalogue, and this is what makes that impossible to miss.
 *
 * A category can legitimately yield fewer products than the store lists when it
 * shares stock with a category crawled earlier in the same run, so those are
 * counted separately and only a genuine gap is marked SHORT.
 *
 * `capped` says the run was deliberately cut short by `--max-pages`. The counts
 * are still shown, but nothing is flagged SHORT - a smoke test is meant to
 * collect part of a category, and crying wolf there would teach us to ignore the
 * one warning that matters.
 */
export function coverageReport(
  results: CategoryResult[],
  summaries: PersistSummary[],
  labelWidth: number,
  capped = false
): CoverageReport {
  const lines: string[] = [];
  const short: string[] = [];
  let total = 0;

  for (const [i, s] of summaries.entries()) {
    total += s.total;
    const { expected, duplicates = 0 } = results[i] ?? {};

    let coverage = "";
    if (expected !== undefined) {
      const gap = expected - (s.total + duplicates);
      coverage = ` of ${expected} listed${duplicates ? ` (+${duplicates} seen earlier)` : ""}`;
      // Case carries the distinction: a lowercase gap is drift worth seeing,
      // an uppercase one is a crawl that needs looking at.
      if (gap > 0 && !capped) {
        if (isMeaningfulShortfall(gap, expected)) {
          coverage += `  SHORT by ${gap}`;
          short.push(s.label);
        } else {
          coverage += `  short by ${gap}`;
        }
      }
    }

    lines.push(
      `  ${s.label.padEnd(labelWidth)} ${String(s.total).padStart(5)} products` +
        `  (${s.created} new, ${s.updated} updated)${coverage}`
    );
  }

  return { lines, total, short };
}
