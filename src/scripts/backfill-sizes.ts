import { prisma } from "../lib/db";
import { parseSize } from "../lib/matching";
import { isFoodSection } from "../lib/food-types";

/**
 * Fill in package sizes we can prove from the product NAME. No network.
 *
 *   npm run backfill:sizes
 *   npm run backfill:sizes -- --dry
 *
 * Why this matters: "cheapest potato per store" is meaningless without a unit
 * price. Auchan's BATATA 5 KG at EUR 5.49 sitting beside BATATA VERMELHA KG at
 * EUR 0.89 is not a EUR 0.89 win - it is 1.10/kg against 0.89/kg - and only the
 * size tells you that.
 *
 * Two free sources, measured across 38,688 food products:
 *   - the name states it       13,880 products, almost all Auchan (it writes
 *                              the size into the name; the other two do not)
 *   - sold loose by weight      1,235 products, where the listed price is
 *                              already per kilo
 *
 * Together they take sized coverage from 2,765 to ~17,880 (7% to 46%) at zero
 * request cost. The remaining ~21,000 need a product-page fetch and are NOT
 * touched here.
 *
 * Writes only what it can prove and leaves the rest null. Idempotent: safe to
 * re-run after the parser improves.
 */

/**
 * Sold loose by weight, so the listed price IS the price per kilo. Matches a
 * name ending in KG ("BATATA VERMELHA LAVADA KG"), or saying granel/ao quilo.
 * Deliberately narrow - a name merely CONTAINING "kg" is usually a pack size,
 * which parseSize already handles better.
 */
const SOLD_PER_KG = /(\bkg\b\s*$)|\bgranel\b|\bao\s+quilo\b|\bpor\s+kg\b/i;

async function main() {
  const dry = process.argv.includes("--dry");

  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { id: true, store: true, name: true, categoryPath: true, packageSize: true, unit: true },
  });
  const food = rows.filter((r) => isFoodSection(r.store, r.categoryPath));

  const before = food.filter((r) => r.packageSize !== null).length;
  console.log(
    `${rows.length.toLocaleString()} products, ${food.length.toLocaleString()} in food sections; ` +
      `${before.toLocaleString()} already sized (${((100 * before) / food.length).toFixed(1)}%)`
  );

  // Sizes already stored that cannot be true, re-read with today's parser.
  //
  // Normally this script only FILLS blanks, because a stored size may have come
  // from a product page and is better than anything a name can give. The
  // exception is a size that is impossible on its face: no grocery item is 198
  // litres. Those came from two Auchan notations the parser used to misread -
  // `6X033L` as 198 L rather than 6 x 0.33, and the fish grade `800/1600 KG` as
  // 1,600 kg - and they matter out of all proportion to their number, because a
  // size that is too large makes the price per kilo too small, which puts them
  // at the top of every cheapest-per-kilo ranking.
  //
  // Deliberately narrow: only rows above the threshold are touched, so a
  // correct size can never be overwritten by a worse guess from the name. When
  // the name now parses to nothing, the size is CLEARED - unknown is the honest
  // answer for a fish graded 400/600, and unknown is already handled everywhere.
  const IMPOSSIBLE_SIZE = 30; // kg or litres, for a single consumer product
  const repairs: { id: string; packageSize: number | null; unit: string | null; was: number }[] = [];
  for (const r of food) {
    if (r.packageSize === null || r.packageSize <= IMPOSSIBLE_SIZE) continue;
    const parsed = parseSize(r.name);
    repairs.push({
      id: r.id,
      packageSize: parsed?.total ?? null,
      unit: parsed?.unit ?? null,
      was: r.packageSize,
    });
  }

  const updates: { id: string; packageSize: number; unit: string; via: string }[] = [];
  for (const r of food) {
    if (r.packageSize !== null) continue;

    const parsed = parseSize(r.name);
    if (parsed) {
      updates.push({ id: r.id, packageSize: parsed.total, unit: parsed.unit, via: "name" });
      continue;
    }
    if (SOLD_PER_KG.test(r.name)) {
      // Price is already per kilo, so a size of 1 kg makes unitPrice() a no-op
      // and the comparison correct.
      updates.push({ id: r.id, packageSize: 1, unit: "kg", via: "per-kg" });
    }
  }

  const byVia = new Map<string, number>();
  const byStore = new Map<string, number>();
  for (const u of updates) {
    byVia.set(u.via, (byVia.get(u.via) ?? 0) + 1);
    const store = food.find((f) => f.id === u.id)?.store ?? "?";
    byStore.set(store, (byStore.get(store) ?? 0) + 1);
  }

  console.log(`\nwould write ${updates.length.toLocaleString()} sizes:`);
  for (const [via, n] of byVia) console.log(`  via ${via.padEnd(8)} ${n.toLocaleString()}`);
  console.log("  by store:");
  for (const [store, n] of [...byStore].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${store.padEnd(12)} ${n.toLocaleString()}`);
  }

  console.log("\nsamples:");
  for (const u of updates.slice(0, 8)) {
    const p = food.find((f) => f.id === u.id);
    console.log(`  ${u.via.padEnd(7)} ${String(u.packageSize).padStart(6)} ${u.unit}  ${p?.name.slice(0, 46)}`);
  }

  if (repairs.length > 0) {
    console.log(`\nand ${repairs.length} impossible size(s) to repair (over ${IMPOSSIBLE_SIZE} kg/L):`);
    for (const r of repairs) {
      const p = food.find((f) => f.id === r.id);
      const now = r.packageSize === null ? "unknown" : `${r.packageSize} ${r.unit}`;
      console.log(`  ${String(r.was).padStart(7)} -> ${now.padEnd(10)} ${p?.name.slice(0, 48)}`);
    }
  }

  if (dry) {
    console.log("\n--dry: nothing written.");
  } else {
    // Grouped by (size, unit) so this is a handful of updateMany calls rather
    // than 15,000 individual ones.
    const groups = new Map<string, string[]>();
    for (const u of updates) {
      const key = `${u.packageSize}|${u.unit}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(u.id);
      groups.set(key, bucket);
    }
    let written = 0;
    for (const [key, ids] of groups) {
      const [size, unit] = key.split("|");
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        await prisma.catalogueProduct.updateMany({
          where: { id: { in: batch } },
          data: { packageSize: Number(size), unit },
        });
        written += batch.length;
      }
    }
    // One at a time: there are a few dozen of these, each with its own answer,
    // and several land on null - which updateMany cannot express per row.
    for (const r of repairs) {
      await prisma.catalogueProduct.update({
        where: { id: r.id },
        data: { packageSize: r.packageSize, unit: r.unit },
      });
    }
    if (repairs.length > 0) {
      const cleared = repairs.filter((r) => r.packageSize === null).length;
      console.log(
        `repaired ${repairs.length} impossible size(s)` +
          `, of which ${cleared} were cleared to unknown.`
      );
    }

    const after = await prisma.catalogueProduct.count({
      where: { delistedAt: null, packageSize: { not: null } },
    });
    console.log(`\nwrote ${written.toLocaleString()} sizes.`);
    console.log(
      `food products sized: ${before.toLocaleString()} -> ${(before + written).toLocaleString()}` +
        `  (${((100 * (before + written)) / food.length).toFixed(1)}% of food)`
    );
    console.log(`catalogue-wide rows with a size: ${after.toLocaleString()}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
