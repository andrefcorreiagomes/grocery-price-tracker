import { prisma } from "../lib/db";
import { classifyCandidate, matchableEan, parseSize, type Rung } from "../lib/matching";
import { isOwnBrand } from "../lib/candidates";
import { scrapeAuchan } from "../scrapers/auchan";
import { scrapeContinente } from "../scrapers/continente";
import { scrapePingoDoce } from "../scrapers/pingodoce";
import { formatHttpStats } from "../scrapers/http";
import type { ScrapeResult } from "../scrapers/types";

/**
 * Fetch the product page for candidate products, to obtain the two things a
 * listing never carries: the barcode and the package size.
 *
 *   npm run enrich -- --pairs=300            # top 300 pairs by name score
 *   npm run enrich -- --pairs=300 --cutoff=0.7
 *
 * Whole PAIRS are selected rather than loose products, so both sides of a
 * comparison arrive together. Enriching one side of a pair buys nothing: a
 * barcode can only confirm or veto against another barcode.
 *
 * The stores are fetched concurrently. `fetchHtml` rate-limits per host, so
 * each store still sees one request per second and the run costs the slowest
 * store rather than the sum. Writes are serialised because SQLite takes one
 * writer at a time.
 *
 * What a fetch is worth differs sharply by store, measured:
 *   Continente  barcode and size, both only on the page
 *   Auchan      barcode only; its size is already in the product name (86%)
 *   Pingo Doce  size only; it publishes no barcode at all
 */

const SCRAPERS: Record<string, (url: string) => Promise<ScrapeResult>> = {
  CONTINENTE: scrapeContinente,
  AUCHAN: scrapeAuchan,
  PINGO_DOCE: scrapePingoDoce,
};

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

/** SQLite tolerates one writer, not three. */
let writes: Promise<unknown> = Promise.resolve();
function queueWrite<T>(work: () => Promise<T>): Promise<T> {
  const run = writes.then(work, work);
  writes = run.then(() => undefined, () => undefined);
  return run;
}

interface StoreTally {
  attempted: number;
  ok: number;
  failed: number;
  withEan: number;
  withUsableEan: number;
  withSize: number;
}

function emptyTally(): StoreTally {
  return { attempted: 0, ok: 0, failed: 0, withEan: 0, withUsableEan: 0, withSize: 0 };
}

async function enrichStore(
  store: string,
  products: { id: string; url: string; name: string }[],
  tally: StoreTally,
  failures: string[]
) {
  const scrape = SCRAPERS[store];
  for (const product of products) {
    tally.attempted++;
    try {
      const result = await scrape(product.url);
      // Only a valid, non-restricted barcode may ever be matched on: GS1
      // prefix-2 codes are per-retailer scale tickets, so two unrelated counter
      // items can share one.
      const usable = matchableEan(result.ean);

      await queueWrite(() =>
        prisma.catalogueProduct.update({
          where: { id: product.id },
          data: {
            ean: result.ean,
            eanNormalized: usable,
            packageSize: result.packageSize,
            unit: result.packageUnit,
            // Deliberately does NOT write `price`. The crawl owns the price
            // series: it reads every product, uniformly, on a schedule.
            // Enrichment covers an arbitrary subset on no schedule, so letting
            // it write prices too would inject an apparent price change wherever
            // a product page and its listing tile disagree - noise that could
            // not be told apart from a real one.
            enrichedAt: new Date(),
          },
        })
      );

      tally.ok++;
      if (result.ean) tally.withEan++;
      if (usable) tally.withUsableEan++;
      if (result.packageSize !== null) tally.withSize++;
    } catch (error) {
      // enrichedAt is left null so a later run retries; a page that is
      // permanently gone will show up as a stale lastSeenAt in the catalogue.
      tally.failed++;
      if (failures.length < 8) {
        failures.push(`${store}: ${product.name.slice(0, 40)} - ${(error as Error).message.slice(0, 70)}`);
      }
    }
  }
}

async function main() {
  const cutoff = Number(arg("cutoff") ?? 0.7);
  const pairLimit = Number(arg("pairs") ?? 300);

  // Which two stores to work on. This matters more than it looks: only
  // Continente and Auchan publish barcodes, so a Pingo Doce pair can never be
  // confirmed by one however good its name looks. Sorting purely by score
  // selects mostly Pingo Doce pairs, because short generic names ("Cenoura")
  // score highest - so measuring what barcodes are worth needs this filter.
  const storeFilter = arg("stores")?.split(",").map((s) => s.trim().toUpperCase());
  const pairWhere =
    storeFilter && storeFilter.length === 2
      ? {
          nameSimilarity: { gte: cutoff },
          OR: [
            { storeA: storeFilter[0] as never, storeB: storeFilter[1] as never },
            { storeA: storeFilter[1] as never, storeB: storeFilter[0] as never },
          ],
        }
      : { nameSimilarity: { gte: cutoff } };

  const pairs = await prisma.matchCandidate.findMany({
    where: pairWhere,
    orderBy: { nameSimilarity: "desc" },
    take: pairLimit,
    select: { aId: true, bId: true, nameSimilarity: true, block: true },
  });

  const ids = [...new Set(pairs.flatMap((p) => [p.aId, p.bId]))];
  // `--refresh` re-fetches products already enriched, for when a parser is
  // fixed and the stored values are known to be wrong rather than merely old.
  const refresh = process.argv.includes("--refresh");
  const products = await prisma.catalogueProduct.findMany({
    where: refresh ? { id: { in: ids } } : { id: { in: ids }, enrichedAt: null },
    select: { id: true, store: true, url: true, name: true },
  });

  console.log(
    `${pairs.length} pairs at or above ${cutoff}, covering ${ids.length} products; ` +
      `${products.length} not yet enriched.`
  );

  const byStore = new Map<string, typeof products>();
  for (const p of products) {
    const bucket = byStore.get(p.store) ?? [];
    bucket.push(p);
    byStore.set(p.store, bucket);
  }
  for (const [store, list] of byStore) console.log(`  ${store.padEnd(12)} ${list.length}`);

  const tallies = new Map<string, StoreTally>();
  const failures: string[] = [];
  const startedAt = Date.now();

  await Promise.allSettled(
    [...byStore].map(([store, list]) => {
      const tally = emptyTally();
      tallies.set(store, tally);
      return enrichStore(store, list, tally, failures);
    })
  );

  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\nenriched in ${minutes} min:`);
  console.log("  store          tried     ok   failed   barcode   usable    size");
  for (const [store, t] of tallies) {
    console.log(
      `  ${store.padEnd(12)} ${String(t.attempted).padStart(6)} ${String(t.ok).padStart(6)} ` +
        `${String(t.failed).padStart(8)} ${String(t.withEan).padStart(9)} ` +
        `${String(t.withUsableEan).padStart(8)} ${String(t.withSize).padStart(7)}`
    );
  }
  for (const f of failures) console.log(`    ${f}`);

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);

  // The payoff: with both sides enriched, what does the evidence actually say?
  // Nothing is stored - this is a measurement, and confirmation is its own step.
  const enriched = await prisma.catalogueProduct.findMany({
    where: { id: { in: ids } },
    select: { id: true, store: true, name: true, brand: true, ean: true, packageSize: true, unit: true, price: true },
  });
  const byId = new Map(enriched.map((e) => [e.id, e]));

  // Reported split by population, because barcodes do completely different work
  // in each: they confirm national brands, and are guaranteed to disagree
  // between two chains' own labels.
  const groups = new Map<string, { rungs: Map<Rung, number>; vetoed: number; total: number }>();
  const track = (group: string, rung: Rung, wasVetoed: boolean) => {
    const g = groups.get(group) ?? { rungs: new Map<Rung, number>(), vetoed: 0, total: 0 };
    g.rungs.set(rung, (g.rungs.get(rung) ?? 0) + 1);
    g.total++;
    if (wasVetoed) g.vetoed++;
    groups.set(group, g);
  };

  let bothSizes = 0;
  let bothEans = 0;
  const examples: string[] = [];

  for (const pair of pairs) {
    const a = byId.get(pair.aId);
    const b = byId.get(pair.bId);
    if (!a || !b) continue;

    const toCandidate = (p: typeof a) => ({
      name: p.name,
      brand: p.brand ?? "",
      ean: p.ean,
      size: p.packageSize !== null && p.unit ? parseSize(`${p.packageSize} ${p.unit}`) : null,
      unitPrice: p.packageSize && p.price ? p.price / p.packageSize : null,
      ownBrand: isOwnBrand(p.brand, p.store),
    });

    const ca = toCandidate(a);
    const cb = toCandidate(b);
    const verdict = classifyCandidate(ca, cb);
    const group =
      ca.ownBrand && cb.ownBrand ? "own-brand vs own-brand" : "at least one national brand";

    track(group, verdict.rung, verdict.vetoed);
    if (a.packageSize !== null && b.packageSize !== null) bothSizes++;
    if (matchableEan(a.ean) && matchableEan(b.ean)) bothEans++;

    if (examples.length < 8 && (verdict.rung === "ean" || verdict.vetoed)) {
      examples.push(
        `    ${verdict.rung.padEnd(10)}${verdict.vetoed ? "VETOED " : "       "}` +
          `${a.name.slice(0, 34).padEnd(34)} | ${b.name.slice(0, 34)}`
      );
    }
  }

  console.log(`\nwhat the evidence says about those ${pairs.length} pairs:`);
  console.log(`  both sides have a usable barcode: ${bothEans}`);
  console.log(`  both sides have a package size:   ${bothSizes}`);
  for (const [group, g] of groups) {
    console.log(`\n  ${group}  (${g.total} pairs)`);
    for (const [rung, n] of [...g.rungs].sort((x, y) => y[1] - x[1])) {
      console.log(`    ${rung.padEnd(12)} ${String(n).padStart(5)}`);
    }
    console.log(`    vetoed       ${String(g.vetoed).padStart(5)}`);
  }
  for (const e of examples) console.log(e);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
