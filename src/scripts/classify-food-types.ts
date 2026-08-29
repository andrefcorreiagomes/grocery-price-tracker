import { prisma } from "../lib/db";
import { classifyFoodType, isFoodSection } from "../lib/food-types";
import { FOOD_TYPES } from "../../data/food-types";

/**
 * Label every catalogue product with the KIND of food it is. No network.
 *
 *   npm run classify:food
 *   npm run classify:food -- --dry
 *   npm run classify:food -- --type=batata    # inspect one type closely
 *
 * The report is the point as much as the write: it says per food type, per
 * store, how many products were labelled and how many of those can actually be
 * compared on price per unit. A type present in one store only, or one where
 * nothing is unit-priced, is not yet usable for "cheapest per store" and the
 * report has to say so rather than let it look finished.
 *
 * Rewrites `foodType` from scratch every run, so editing data/food-types.ts and
 * re-running is the normal way to iterate.
 */

const STORES = ["CONTINENTE", "PINGO_DOCE", "AUCHAN"] as const;

async function main() {
  const dry = process.argv.includes("--dry");
  const only = process.argv.find((a) => a.startsWith("--type="))?.split("=")[1];

  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { id: true, store: true, name: true, categoryPath: true, packageSize: true, unit: true, price: true },
  });
  const food = rows.filter((r) => isFoodSection(r.store, r.categoryPath));
  console.log(
    `${rows.length.toLocaleString()} live products, ${food.length.toLocaleString()} in food sections ` +
      `(${((100 * food.length) / rows.length).toFixed(1)}%)`
  );
  console.log(`curated food types: ${FOOD_TYPES.length}\n`);

  interface Row { labelled: number; sized: number; byStore: Map<string, number>; samples: string[] }
  const perType = new Map<string, Row>();
  const assignments: { id: string; foodType: string }[] = [];
  let unmatched = 0;
  const unmatchedHeads = new Map<string, number>();

  for (const r of food) {
    const type = classifyFoodType(r.name, r.store, r.categoryPath);
    if (!type) {
      unmatched++;
      const head = r.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      unmatchedHeads.set(head, (unmatchedHeads.get(head) ?? 0) + 1);
      continue;
    }
    assignments.push({ id: r.id, foodType: type });

    const row: Row =
      perType.get(type) ?? { labelled: 0, sized: 0, byStore: new Map<string, number>(), samples: [] };
    row.labelled++;
    if (r.packageSize !== null && r.unit) row.sized++;
    row.byStore.set(r.store, (row.byStore.get(r.store) ?? 0) + 1);
    if (row.samples.length < 3) row.samples.push(`${r.store.slice(0, 4)} ${r.name.slice(0, 40)}`);
    perType.set(type, row);
  }

  console.log(
    `labelled ${assignments.length.toLocaleString()} of ${food.length.toLocaleString()} ` +
      `(${((100 * assignments.length) / food.length).toFixed(1)}%); ` +
      `${unmatched.toLocaleString()} unrecognised and left null`
  );

  // --- one type, in detail --------------------------------------------------
  if (only) {
    const row = perType.get(only);
    console.log(`\n=== ${only} ===`);
    if (!row) {
      console.log("  nothing classified under this type");
    } else {
      console.log(`  labelled ${row.labelled}, unit-price comparable ${row.sized}`);
      for (const s of STORES) console.log(`    ${s.padEnd(12)} ${row.byStore.get(s) ?? 0}`);
      const members = food.filter((r) => classifyFoodType(r.name, r.store, r.categoryPath) === only);
      console.log("  cheapest per store (by unit price where known):");
      for (const s of STORES) {
        const mine = members.filter((m) => m.store === s && m.price !== null);
        if (mine.length === 0) { console.log(`    ${s.padEnd(12)} not stocked`); continue; }
        const priced = mine.filter((m) => m.packageSize);
        if (priced.length === 0) {
          const min = mine.reduce((a, b) => ((a.price ?? 0) <= (b.price ?? 0) ? a : b));
          console.log(`    ${s.padEnd(12)} EUR ${min.price}  (pack price - no size, NOT comparable)  ${min.name.slice(0, 34)}`);
          continue;
        }
        const min = priced.reduce((a, b) =>
          (a.price as number) / (a.packageSize as number) <= (b.price as number) / (b.packageSize as number) ? a : b
        );
        const per = ((min.price as number) / (min.packageSize as number)).toFixed(2);
        console.log(`    ${s.padEnd(12)} EUR ${per}/${min.unit}  ${min.name.slice(0, 40)}`);
      }
    }
  }

  // --- the coverage table ---------------------------------------------------
  if (!only) {
    const ranked = [...perType.entries()]
      .map(([id, r]) => ({ id, ...r, stores: r.byStore.size }))
      .sort((a, b) => b.labelled - a.labelled);

    console.log("\n  labelled  sized  st   CONT  PING  AUCH   food type");
    for (const t of ranked) {
      const per = STORES.map((s) => String(t.byStore.get(s) ?? 0).padStart(5)).join(" ");
      console.log(
        `  ${String(t.labelled).padStart(8)}  ${String(t.sized).padStart(5)}  ${t.stores}  ${per}   ${t.id}`
      );
    }

    const missing = FOOD_TYPES.filter((t) => !perType.has(t.id));
    if (missing.length > 0) {
      console.log(`\n${missing.length} curated type(s) matched NOTHING: ${missing.map((t) => t.id).join(", ")}`);
    }
    const oneStore = ranked.filter((t) => t.stores === 1);
    if (oneStore.length > 0) {
      console.log(
        `\n${oneStore.length} type(s) found in only ONE store - not comparable yet: ` +
          oneStore.map((t) => t.id).join(", ")
      );
    }

    console.log("\ncommonest unrecognised first words (candidates for the table):");
    for (const [head, n] of [...unmatchedHeads].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${String(n).padStart(5)}  ${head}`);
    }
  }

  // --- write ----------------------------------------------------------------
  if (dry || only) {
    console.log("\nnothing written (dry run or single-type inspection).");
  } else {
    await prisma.catalogueProduct.updateMany({ data: { foodType: null } });
    const groups = new Map<string, string[]>();
    for (const a of assignments) {
      const bucket = groups.get(a.foodType) ?? [];
      bucket.push(a.id);
      groups.set(a.foodType, bucket);
    }
    let written = 0;
    for (const [foodType, ids] of groups) {
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        await prisma.catalogueProduct.updateMany({ where: { id: { in: batch } }, data: { foodType } });
        written += batch.length;
      }
    }
    console.log(`\nwrote foodType on ${written.toLocaleString()} products across ${groups.size} types.`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
