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
