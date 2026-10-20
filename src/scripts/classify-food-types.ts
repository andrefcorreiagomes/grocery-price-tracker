import { prisma } from "../lib/db";
import { STORE_ORDER } from "../lib/stores";
import { isFoodSection } from "../lib/food-types";
import { decideKind } from "../lib/kind-decisions";
import { FOOD_TYPES } from "../../data/food-types";
import { SUB_KINDS } from "../../data/food-tree";
import { labelsOf, subKindOf } from "../lib/food-tree";

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

const STORES = STORE_ORDER;

async function main() {
  const dry = process.argv.includes("--dry");
  const only = process.argv.find((a) => a.startsWith("--type="))?.split("=")[1];

  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { id: true, store: true, storeProductId: true, name: true, categoryPath: true, packageSize: true, unit: true, price: true },
  });
  const food = rows.filter((r) => isFoodSection(r.store, r.categoryPath));
  console.log(
    `${rows.length.toLocaleString()} live products, ${food.length.toLocaleString()} in food sections ` +
      `(${((100 * food.length) / rows.length).toFixed(1)}%)`
  );
  console.log(`curated food types: ${FOOD_TYPES.length}\n`);

  interface Row { labelled: number; sized: number; byStore: Map<string, number>; samples: string[] }
  const perType = new Map<string, Row>();
  const assignments: { id: string; foodType: string; subKind: string | null; labels: string | null }[] = [];
  /** kind -> sub-kind -> stores that sell it, for the sub-kind coverage report */
  const subStores = new Map<string, Map<string, Map<string, number>>>();
  const labelCount = new Map<string, number>();
  let unmatched = 0;
  const unmatchedHeads = new Map<string, number>();

  for (const r of food) {
    // The classifier's answer as review corrected or confirmed it
    // (data/kind-reviews.ts).
    const type = decideKind(r).id;
    if (!type) {
      unmatched++;
      const head = r.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      unmatchedHeads.set(head, (unmatchedHeads.get(head) ?? 0) + 1);
      continue;
    }
    const subKind = subKindOf(type, r.name);
    const labels = labelsOf(type, r.name, r.categoryPath);
    assignments.push({ id: r.id, foodType: type, subKind, labels: labels.length ? labels.join(",") : null });
    for (const l of labels) labelCount.set(l, (labelCount.get(l) ?? 0) + 1);
    if (SUB_KINDS[type]) {
      const byKind = subStores.get(type) ?? new Map<string, Map<string, number>>();
      const key = subKind ?? "(none)";
      const byStore = byKind.get(key) ?? new Map<string, number>();
      byStore.set(r.store, (byStore.get(r.store) ?? 0) + 1);
      byKind.set(key, byStore);
      subStores.set(type, byKind);
    }

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
      const members = food.filter((r) => decideKind(r).id === only);
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

  // --- sub-kinds and labels (data/food-tree.ts) ------------------------------
  if (!only) {
    console.log("\nsub-kinds: products per chain (C/P/A); a sub-kind needs at least two chains");
    const thin: string[] = [];
    for (const [kind, rules] of Object.entries(SUB_KINDS)) {
      const byKind = subStores.get(kind);
      if (!byKind) continue;
      const parts = [...rules.map((r) => r.id), "(none)"].map((id) => {
        const st = byKind.get(id) ?? new Map<string, number>();
        if (id !== "(none)" && st.size < 2) thin.push(`${kind}/${id}`);
        return `${id} ${STORES.map((x) => st.get(x) ?? 0).join("/")}`;
      });
      console.log(`  ${kind.padEnd(10)} ${parts.join(" | ")}`);
    }
    if (thin.length > 0) console.log(`  below two chains today: ${thin.join(", ")}`);
    console.log(`labels: ${[...labelCount].map(([l, n]) => `${l} ${n}`).join(", ")}`);
  }

  // --- write ----------------------------------------------------------------
  if (dry || only) {
    console.log("\nnothing written (dry run or single-type inspection).");
  } else {
    await prisma.catalogueProduct.updateMany({ data: { foodType: null, subKind: null, labels: null } });
    // Grouped by (kind, sub-kind, labels), so this is a few hundred updateMany
    // calls rather than 37,000 single ones.
    const groups = new Map<string, { foodType: string; subKind: string | null; labels: string | null; ids: string[] }>();
    for (const a of assignments) {
      const key = `${a.foodType}|${a.subKind ?? ""}|${a.labels ?? ""}`;
      const bucket = groups.get(key) ?? { foodType: a.foodType, subKind: a.subKind, labels: a.labels, ids: [] };
      bucket.ids.push(a.id);
      groups.set(key, bucket);
    }
    let written = 0;
    for (const g of groups.values()) {
      for (let i = 0; i < g.ids.length; i += 500) {
        const batch = g.ids.slice(i, i + 500);
        await prisma.catalogueProduct.updateMany({
          where: { id: { in: batch } },
          data: { foodType: g.foodType, subKind: g.subKind, labels: g.labels },
        });
        written += batch.length;
      }
    }
    const types = new Set(assignments.map((a) => a.foodType)).size;
    console.log(`\nwrote foodType, sub-kind and labels on ${written.toLocaleString()} products across ${types} types.`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
