import { prisma } from "../lib/db";

/**
 * `npm run sitemap:test`: does a store move a product's sitemap date whenever
 * the product changes? (Assumptions 2.11 and 3.20; the user's question of
 * 23 October 2026.) Read-only.
 *
 * If it does, the nightly could skip every page whose date did not move. So
 * what matters most is the change that came WITHOUT a new date - the one a
 * skip would miss - for every field we read, not only the price (the user,
 * 25 October 2026: a store may correct something without touching the date).
 *
 * For each store and each night: the pages read, the changes found on them (by
 * field), how many of those came with a new date, and the dates that moved with
 * no change we could see. Size changes from a count being erased and refilled
 * ("16 un" to nothing, before 25 October) are left out as noise. Last, over all
 * nights, how often a real price change came with a new date, with a 95% upper
 * bound on the share that does not (exact binomial, Clopper-Pearson).
 */

// Continente's dates are no longer recorded since 28 October 2026 (crawl-continente-nightly.ts).
const STORES = ["PINGO_DOCE"] as const;

/** One-sided 95% upper bound on a proportion when `misses` of `n` failed (Clopper-Pearson, by bisection). */
function upperBound(misses: number, n: number): number {
  if (n === 0) return 1;
  const cdf = (p: number) => {
    // P(X <= misses) for X ~ Binomial(n, p)
    let sum = 0;
    let term = Math.pow(1 - p, n);
    for (let k = 0; k <= misses; k++) {
      sum += term;
      term *= ((n - k) / (k + 1)) * (p / (1 - p));
    }
    return sum;
  };
  let lo = misses / n, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) > 0.05) lo = mid;
    else hi = mid;
  }
  return hi;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

async function main() {
  console.log("Does a new sitemap date come with every change? (read-only)");
  for (const store of STORES) {
    const nights = (await prisma.sitemapDate.groupBy({ by: ["firstSeenAt"], where: { store }, _count: true }))
      .map((g) => g.firstSeenAt)
      .sort((a, b) => +a - +b);
    console.log(`\n${store}: ${nights.length} night(s) on which dates moved (the first only records them)`);
    if (nights.length === 0) continue;
    // A night on which no date moved leaves no row, so the latest run closes
    // the last stretch: changes read since then came with no new date at all
    // (Continente, 23-25 October: 25 price changes, not one date).
    const latest = (await prisma.crawlRun.findFirst({ where: { store }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }))?.startedAt;
    if (latest && latest > nights[nights.length - 1]) nights.push(latest);
    let pricesTotal = 0, pricesWithDate = 0;
    for (let i = 1; i < nights.length; i++) {
      const from = nights[i - 1];
      const to = nights[i];
      // Every page change read after the previous dates were taken, up to tonight.
      const changes = (await prisma.pageChange.findMany({
        where: { store, seenAt: { gt: from, lte: to } },
        select: { storeProductId: true, field: true, before: true, after: true },
      })).filter((c) => !(c.field === "size" && c.after === null && / un$/.test(c.before ?? "")));
      // A date that moves the night AFTER counts too: we read the list at 00:05,
      // but a store makes its list before then, so a change at midnight - a
      // promotion ending - can only reach the next night's list (27 October
      // 2026: 2,195 Pingo Doce promotions ended at midnight with no new date
      // that night).
      const datesOf = async (at: Date | undefined) =>
        at ? (await prisma.sitemapDate.findMany({ where: { store, firstSeenAt: at }, select: { storeProductId: true } })).map((d) => d.storeProductId) : [];
      const movedSame = new Set(await datesOf(to));
      const next = nights[i + 1];
      const movedNext = new Set(await datesOf(next));
      const moved = new Set([...movedSame, ...movedNext]);
      if (!next) console.log("  (the night after has not been read yet: a date that moves then is not counted here)");
      const read = await prisma.catalogueProduct.count({ where: { store, lastSeenAt: to } });

      // Pages read count only while they still carry this night's stamp, i.e. for the latest night.
      console.log(`  night of ${to.toISOString().slice(0, 10)}: ${read ? `${read.toLocaleString()} pages read, ` : ""}${movedSame.size.toLocaleString()} dates moved`);
      const byField = new Map<string, { all: number; withDate: number; sameNight: number }>();
      for (const c of changes) {
        const kind = c.field === "price" && (c.before === null || c.after === null) ? "price (became / stopped being unavailable)" : c.field;
        const f = byField.get(kind) ?? { all: 0, withDate: 0, sameNight: 0 };
        f.all++;
        if (moved.has(c.storeProductId)) f.withDate++;
        if (movedSame.has(c.storeProductId)) f.sameNight++;
        byField.set(kind, f);
      }
      for (const [field, f] of [...byField].sort()) {
        console.log(
          `    ${field.padEnd(44)} ${String(f.all).padStart(5)} changed, ${String(f.withDate).padStart(5)} with a new date ` +
            `(${f.sameNight} the same night), ${String(f.all - f.withDate).padStart(5)} WITHOUT`
        );
      }
      const changedIds = new Set(changes.map((c) => c.storeProductId));
      const silent = [...movedSame].filter((id) => !changedIds.has(id)).length;
      console.log(`    dates that moved with no change we could see: ${silent.toLocaleString()}`);
      const p = byField.get("price");
      // A night whose next night has not been read yet is left out of the
      // running total: its dates may still move.
      if (p && next) {
        pricesTotal += p.all;
        pricesWithDate += p.withDate;
      }
    }
    const misses = pricesTotal - pricesWithDate;
    console.log(
      `  all nights whose next night was read: ${pricesWithDate} of ${pricesTotal} price changes came with a new date (that night or the next)` +
        (!pricesTotal
          ? ""
          : pricesWithDate === 0
            ? " - the dates do not follow prices here"
            : `; at 95% confidence, at most ${pct(upperBound(misses, pricesTotal))} of price changes come without one`)
    );
  }
}

main().finally(() => prisma.$disconnect());
