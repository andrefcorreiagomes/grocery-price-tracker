import { prisma } from "../lib/db";
import { parseSize, reconcileTileSize, SOLD_PER_KG } from "../lib/matching";
import { isFoodSection } from "../lib/food-types";
import { implausiblePodSize } from "../scrapers/page-size";

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

async function main() {
  const dry = process.argv.includes("--dry");

  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { id: true, store: true, name: true, categoryPath: true, packageSize: true, unit: true, sizeSource: true, enrichedAt: true, foodType: true },
  });
  const food = rows.filter((r) => isFoodSection(r.store, r.categoryPath));

  const before = food.filter((r) => r.packageSize !== null).length;
  console.log(
    `${rows.length.toLocaleString()} products, ${food.length.toLocaleString()} in food sections; ` +
      `${before.toLocaleString()} already sized (${((100 * before) / food.length).toFixed(1)}%)`
  );

  // Sizes already stored that cannot be true, re-read with today's parser.
  //
  // Normally this script only FILLS blanks. It repairs here because a size that
  // is too large makes the price per kilo too small, and a page that ranks by
  // cheapest puts exactly those rows first - so a handful of them would be the
  // first thing every visitor saw. They came from Auchan notations the parser
  // used to misread: `6X033L` as 198 L rather than 6 x 0.33, and the fish grade
  // `800/1600 KG` as 1,600 kg.
  //
  // The rule is PROVENANCE, not size. `enrichedAt` is set only when a product
  // PAGE was read, and a page states the size outright - better evidence than
  // any name, never to be overwritten by re-reading one. A row without it got
  // its size from its name, so re-deriving that name with today's parser is
  // exactly right, and the stored value is simply the old parser's answer.
  //
  // A size threshold was tried first and cannot work, in either direction. At
  // the large end, an 18 L pack of milk is a real 18 x 1 L pack while 15 L of
  // tea is Auchan writing 1.5 L as `15L`. At the small end, 0.375 g of
  // ratatouille is a misread thousands separator while 0.3 g of saffron is a
  // genuine three doses. Size cannot separate either pair; provenance plus a
  // re-parse separates both.
  //
  // When the name now parses to nothing the size is CLEARED. Unknown is the
  // honest answer for a fish graded 400/600, and unknown is already handled
  // everywhere downstream.
  const repairs: { id: string; packageSize: number | null; unit: string | null; was: number; sizeSource?: string | null }[] = [];
  for (const r of food) {
    if (r.packageSize === null) continue;
    // Auchan's own per-unit figure, read off its listing tile: the store's word,
    // like a product page, and never second-guessed from the name. The name rule
    // is exactly what it corrected - "LINGUIÇA ... KG" is a 150 g pack.
    if (r.sizeSource === "listing") {
      // Re-decided with today's rule: the stored size IS the one the figure
      // gave, so this applies the rule without fetching anything. The first
      // version of the rule trusted the figure wherever it disagreed with the
      // name, and priced LASANHA IGLO BOLONHESA 300G as 399 kg.
      if (r.unit !== "kg" && r.unit !== "l") continue;
      const decided = reconcileTileSize({ total: r.packageSize, unit: r.unit }, r.name);
      if (decided?.packageSize === r.packageSize && decided?.unit === r.unit) continue;
      if (decided) {
        repairs.push({ id: r.id, packageSize: decided.packageSize, unit: decided.unit, was: r.packageSize, sizeSource: "listing" });
      } else {
        // The figure no longer decides: the name does, as before it was read.
        const named = parseSize(r.name);
        repairs.push({ id: r.id, packageSize: named?.total ?? null, unit: named?.unit ?? null, was: r.packageSize, sizeSource: null });
      }
      continue;
    }

    // NOT repaired here: a stored unit that contradicts the food type's own.
    //
    // Tried, and it is the wrong way round. Clearing every such row would have
    // touched 765 products and destroyed good data - "Chantilly" at 0.25 L and
    // "Iogurte Líquido Cremoso" at 0.75 L are correctly measured in litres,
    // under food types declared kg. When hundreds of products disagree with the
    // table, the TABLE is what is wrong, and the answer is to declare that food
    // "either", not to erase the products.
    //
    // `validate:comparisons` reports the disagreement instead, so it is a
    // prompt to look at the declaration rather than a licence to overwrite.
    // A product page said so, and a page outranks any name - with one
    // exception the page readers now apply themselves: a capsule pack whose
    // page size is a count ("10 Kg" for ten capsules, "Int 10 L'Or" as 10 L).
    // Repaired here too, because rows read before that rule existed keep their
    // impossible size until their page is read again.
    //
    // Not Auchan: its product pages state no size, and the Auchan page reader
    // takes the size from the NAME - so a "page read" Auchan size is a name
    // reading like any other, and is re-read with today's rules below. That
    // kept "SALMÃO FRESCO INTEIRO 2KG A 3KG" at 2 kg, and EUR 4.00/kg.
    if (r.enrichedAt !== null && r.store !== "AUCHAN") {
      if (r.unit && implausiblePodSize(r.name, r.packageSize, r.unit as "kg" | "l")) {
        repairs.push({ id: r.id, packageSize: null, unit: null, was: r.packageSize });
      }
      continue;
    }

    const parsed = parseSize(r.name);
    if (parsed !== null && parsed.total === r.packageSize && parsed.unit === r.unit) continue;

    // Sold loose by weight, so the listed price IS the price per kilo and the
    // size is 1. The same rule the fill pass below applies, repeated here
    // because these names often carry a grade the parser now refuses - `SALMAO
    // INTEIRO AUCHAN 4/5 KG` is a whole salmon graded 4-5 kg, priced per kilo.
    // Without this they would be cleared to unknown and only refilled on the
    // next run, since the fill pass has already gone by the time repairs apply.
    const perKg = parsed === null && SOLD_PER_KG.test(r.name);
    if (perKg && r.packageSize === 1 && r.unit === "kg") continue; // already right

    repairs.push({
      id: r.id,
      packageSize: perKg ? 1 : parsed?.total ?? null,
      unit: perKg ? "kg" : parsed?.unit ?? null,
      was: r.packageSize,
    });
  }

  const updates: { id: string; packageSize: number; unit: string; via: string }[] = [];
  for (const r of food) {
    if (r.packageSize !== null) continue;
    // Unknown ON PURPOSE: Auchan's figure showed the price is per item (a quail
    // at EUR 1.25 the bird), so filling 1 kg from a name ending in KG would put
    // back exactly the error the figure caught.
    if (r.sizeSource === "listing") continue;

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
    console.log(`\nand ${repairs.length} impossible size(s) to repair:`);
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
        data: {
          packageSize: r.packageSize,
          unit: r.unit,
          ...(r.sizeSource === undefined ? {} : { sizeSource: r.sizeSource }),
        },
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
