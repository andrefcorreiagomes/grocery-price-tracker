import { compareSizes, type StoreSize } from "../scrapers/crawl/catalogue-size";

/**
 * Per-store catalogue growth. Pure arithmetic, but the edge cases are the point:
 * a store missing from the previous run must not read as growth from nothing,
 * and "no change" must be distinguishable from "nothing to compare".
 */
export function verifyCatalogueSize(): number {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
  };

  const size = (store: StoreSize["store"], total: number, delisted = 0): StoreSize => ({
    store,
    total,
    delisted,
  });

  const now = [size("CONTINENTE", 210), size("PINGO_DOCE", 7_191), size("AUCHAN", 17_800)];
  const before = [size("CONTINENTE", 200), size("PINGO_DOCE", 7_191), size("AUCHAN", 18_000)];
  const changed = compareSizes(now, before);

  check("growth is positive", changed[0].percent === 5, `${changed[0].percent}%`);
  check("the example from the request: 200 to 210 is +5%", changed[0].percent === 5);
  check("a flat store reads as zero, not as missing", changed[1].percent === 0);
  check(
    "shrinking is negative",
    changed[2].percent !== null && changed[2].percent < 0,
    `${changed[2].percent?.toFixed(2)}%`
  );
  check("previous totals are carried through", changed[0].previousTotal === 200);

  const firstRun = compareSizes(now, []);
  check(
    "no previous run gives null, not 0% and not infinity",
    firstRun.every((s) => s.percent === null && s.previousTotal === null)
  );

  const newStore = compareSizes(now, [size("CONTINENTE", 200)]);
  check(
    "a store absent last run is null, not growth from nothing",
    newStore[1].percent === null && newStore[2].percent === null
  );

  const fromZero = compareSizes([size("CONTINENTE", 50)], [size("CONTINENTE", 0)]);
  check(
    "growth from an empty store does not divide by zero",
    fromZero[0].percent === null,
    `${fromZero[0].percent}`
  );

  const delisted = compareSizes([size("CONTINENTE", 210, 12)], [size("CONTINENTE", 200)]);
  check(
    "delisted rows still count towards the total",
    delisted[0].total === 210 && delisted[0].delisted === 12
  );

  return failures;
}
