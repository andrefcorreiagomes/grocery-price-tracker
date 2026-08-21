import { prisma } from "../lib/db";
import { generateCandidates, type CatalogueEntry, type CandidatePair } from "../lib/candidates";
import type { Store } from "@/generated/prisma/client";

/**
 * Generate cross-store match candidates from the catalogue.
 *
 *   npm run candidates
 *   npm run candidates -- --sample=6      # show example pairs per score band
 *   npm run candidates -- --min-score=0.6 # store a narrower set
 *
 * Guesses only, from name and brand: no product page is fetched and no verdict
 * is recorded. Candidates are derived data, so the table is wiped and rebuilt
 * on every run and a different threshold is a re-run, not a migration.
 */

const CHUNK = 500;
const BANDS = [0.45, 0.6, 0.7, 0.85];

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

/**
 * How many of the pairs a human already accepted does generation find?
 *
 * A floor, not a score: these 95 groups are presumed correct rather than known
 * correct - six have disagreeing barcodes and may themselves be wrong - so a
 * miss is something to look at, and pairs beyond them are not errors. What it
 * does prove is that blocking can surface pairs known to be findable.
 */
async function recallFloor(pairs: CandidatePair[], names: Map<string, string>) {
  const listings = await prisma.storeListing.findMany({
    select: { productId: true, store: true, storeProductId: true },
  });
  const catalogue = await prisma.catalogueProduct.findMany({
    select: { id: true, store: true, storeProductId: true },
  });

  const catalogueId = new Map(catalogue.map((c) => [`${c.store}:${c.storeProductId}`, c.id]));
  const groups = new Map<string, string[]>();
  for (const l of listings) {
    const id = catalogueId.get(`${l.store}:${l.storeProductId}`);
    if (!id) continue;
    const bucket = groups.get(l.productId) ?? [];
    bucket.push(id);
    groups.set(l.productId, bucket);
  }

  // Same-store pairs are excluded: a group can hold two SKUs from one chain,
  // but generation only ever pairs across stores, so counting those as misses
  // would measure a decision rather than a failure.
  const storeOf = new Map(catalogue.map((c) => [c.id, c.store]));
  const known = new Set<string>();
  let sameStore = 0;
  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (storeOf.get(ids[i]) === storeOf.get(ids[j])) {
          sameStore++;
          continue;
        }
        known.add([ids[i], ids[j]].sort().join("|"));
      }
    }
  }

  const generated = new Set(pairs.map((p) => [p.aId, p.bId].sort().join("|")));
  const misses = [...known].filter((k) => !generated.has(k));

  console.log(`\nrecall floor against the ${groups.size} hand-made groups:`);
  console.log(
    `  ${known.size - misses.length} of ${known.size} cross-store pairs found` +
      `  (${(100 * (1 - misses.length / Math.max(1, known.size))).toFixed(1)}%)` +
      `  [${sameStore} same-store pairs excluded as out of scope]`
  );
  for (const miss of misses.slice(0, 15)) {
    const [x, y] = miss.split("|");
    console.log(`    missed: ${(names.get(x) ?? x).slice(0, 44).padEnd(44)} | ${(names.get(y) ?? y).slice(0, 44)}`);
  }
  if (misses.length > 15) console.log(`    ... and ${misses.length - 15} more`);
}

async function main() {
  const minScore = arg("min-score") ? Number(arg("min-score")) : undefined;
  const sample = arg("sample") ? Number(arg("sample")) : 0;

  const rows = await prisma.catalogueProduct.findMany({
    select: { id: true, store: true, name: true, brand: true, price: true, url: true },
  });
  console.log(`Loaded ${rows.length.toLocaleString()} catalogue products.`);

  const entries: CatalogueEntry[] = rows.map((r) => ({
    id: r.id,
    store: r.store,
    name: r.name,
    brand: r.brand,
    price: r.price,
  }));

  const startedAt = Date.now();
  const { pairs, stats } = generateCandidates(entries, { minScore });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\ngenerated ${pairs.length.toLocaleString()} pairs in ${elapsed}s`);
  console.log(`  comparisons scored:      ${stats.comparisons.toLocaleString()}`);
  console.log(`  lookups via brand block: ${stats.lookupsByBrand.toLocaleString()}`);
  console.log(`  lookups via token block: ${stats.lookupsByToken.toLocaleString()}`);
  console.log(`  products with no candidate: ${stats.withoutCandidate.toLocaleString()}`);
  console.log(
    `  block sizes: median ${stats.blockSize.median}, p90 ${stats.blockSize.p90}, ` +
      `p99 ${stats.blockSize.p99}, max ${stats.blockSize.max}`
  );

  // What each cutoff would cost: enrichment fetches one product page per
  // DISTINCT product in a surviving pair, not per pair.
  console.log("\ncutoff        pairs   products to enrich");
  for (const band of BANDS) {
    const kept = pairs.filter((p) => p.nameSimilarity >= band);
    const products = new Set<string>();
    for (const p of kept) {
      products.add(p.aId);
      products.add(p.bId);
    }
    console.log(
      `  ${band.toFixed(2).padEnd(8)} ${kept.length.toLocaleString().padStart(9)} ` +
        `${products.size.toLocaleString().padStart(20)}`
    );
  }

  // `candidates.ts` keeps stores as plain strings so it stays free of Prisma and
  // testable without a database; the enum is reapplied here, at the boundary.
  const toRow = (p: CandidatePair) => ({
    ...p,
    storeA: p.storeA as Store,
    storeB: p.storeB as Store,
  });

  await prisma.matchCandidate.deleteMany({});
  for (let i = 0; i < pairs.length; i += CHUNK) {
    await prisma.matchCandidate.createMany({ data: pairs.slice(i, i + CHUNK).map(toRow) });
  }
  console.log(`\nstored ${(await prisma.matchCandidate.count()).toLocaleString()} candidates.`);

  const names = new Map(rows.map((r) => [r.id, `[${r.store.slice(0, 4)}] ${r.name}`]));
  await recallFloor(pairs, names);

  if (sample > 0) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    console.log("\nsample pairs by score band:");
    for (let i = 0; i < BANDS.length; i++) {
      const lo = BANDS[i];
      const hi = BANDS[i + 1] ?? 1.01;
      const band = pairs.filter((p) => p.nameSimilarity >= lo && p.nameSimilarity < hi);
      console.log(`\n  ${lo.toFixed(2)} to ${hi === 1.01 ? "1.00" : hi.toFixed(2)}  (${band.length.toLocaleString()} pairs)`);
      for (const p of band.slice(0, sample)) {
        const a = byId.get(p.aId);
        const b = byId.get(p.bId);
        if (!a || !b) continue;
        console.log(
          `    ${p.nameSimilarity.toFixed(2)} ${p.block.padEnd(5)}` +
            ` ${a.store.slice(0, 4)} ${String(a.price).padStart(6)} ${a.name.slice(0, 42).padEnd(42)}` +
            ` | ${b.store.slice(0, 4)} ${String(b.price).padStart(6)} ${b.name.slice(0, 42)}`
        );
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
