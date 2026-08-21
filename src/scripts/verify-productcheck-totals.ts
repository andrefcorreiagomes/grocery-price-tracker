import { compareCheckTotals, type CheckTotals } from "../scrapers/crawl/product-checks";

/**
 * Run-over-run comparison of the ProductCheck table. Pure arithmetic; the point
 * is the anomaly direction - this table only ever grows, so a fall is what the
 * check exists to catch - plus the same edge cases the catalogue-size check has.
 */
export function verifyProductCheckTotals(): number {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
  };

  const t = (notFood: number, dead: number): CheckTotals => ({
    notFood,
    dead,
    total: notFood + dead,
  });

  // 2,900 to 3,045 is exactly +5%.
  const grew = compareCheckTotals(t(1_245, 1_800), t(1_150, 1_750));
  check("growth is positive", grew.percent === 5, `${grew.percent}%`);
  check("growth is not flagged as shrinking", grew.shrank === false);
  check("previous total carried through", grew.previousTotal === 2_900);

  const flat = compareCheckTotals(t(1_200, 1_800), t(1_200, 1_800));
  check("a flat table reads as 0%, not shrinking", flat.percent === 0 && flat.shrank === false);

  const shrank = compareCheckTotals(t(1_000, 1_800), t(1_200, 1_800));
  check("a shrink is negative", shrank.percent !== null && shrank.percent < 0, `${shrank.percent?.toFixed(2)}%`);
  check("a shrink is flagged", shrank.shrank === true);

  const first = compareCheckTotals(t(1_200, 1_800), null);
  check("no previous run gives null percent, not 0 or infinity", first.percent === null);
  check("no previous run is not flagged as shrinking", first.shrank === false);

  const fromZero = compareCheckTotals(t(5, 5), t(0, 0));
  check("growth from an empty table does not divide by zero", fromZero.percent === null);
  check("growth from empty is not a shrink", fromZero.shrank === false);

  return failures;
}
