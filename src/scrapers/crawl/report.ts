import type { PersistSummary } from "./persist";
import type { CategoryResult } from "./types";

export interface CoverageReport {
  /** one formatted line per category, ready to print */
  lines: string[];
  /** distinct products kept across every category */
  total: number;
  /** labels of categories that returned fewer products than the store lists */
  short: string[];
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
      const accounted = s.total + duplicates;
      coverage = ` of ${expected} listed${duplicates ? ` (+${duplicates} seen earlier)` : ""}`;
      if (accounted < expected && !capped) {
        coverage += `  SHORT by ${expected - accounted}`;
        short.push(s.label);
      }
    }

    lines.push(
      `  ${s.label.padEnd(labelWidth)} ${String(s.total).padStart(5)} products` +
        `  (${s.created} new, ${s.updated} updated)${coverage}`
    );
  }

  return { lines, total, short };
}
