import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { explainFoodType, nameTokensForType, FOOD_TYPE_BY_ID } from "../lib/food-types";

/**
 * How well does the kind-of-food classifier do? Read-only: it changes nothing.
 *
 *   npm run measure:classifier                 # report into reports/classifier-<date>/
 *   npm run measure:classifier -- <folder>     # or into a folder of your choice
 *   npm run measure:classifier -- <folder> <n> # and draw the sample with seed n
 *
 * Written on 20 October 2026, when the classifier was first measured: a hand
 * check of a 408-product sample found about 5% of name-decided, 10% of
 * cut-word-decided and 20% of shelf-decided kinds wrong. It is kept so every
 * change to the rules can be measured the same way, before and after.
 *
 *   A. every product on sale, by which step decided its kind - the head noun,
 *      a word read past a cut, or the shelf - or why none did
 *   B. food products with no kind: the commonest first words and shelves,
 *      which is where missing kinds show up
 *   C. barcodes sold at two or more stores, and whether they got the same
 *      kind - a disagreement means at least one of them is wrong
 *   D. a random sample to check by hand, 34 products per store and step plus
 *      34 per store with no kind. Seeded, so the same draw comes back while
 *      the catalogue is unchanged.
 */

const outDir = process.argv[2] ?? path.join("reports", `classifier-${new Date().toISOString().slice(0, 10)}`);
const STORES = ["CONTINENTE", "PINGO_DOCE", "AUCHAN"];
const SAMPLE_PER_CELL = 34;

async function main() {
  mkdirSync(outDir, { recursive: true });
  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { store: true, storeProductId: true, name: true, categoryPath: true, foodType: true, eanNormalized: true },
  });
  const all = rows.map((r) => ({ ...r, e: explainFoodType(r.name, r.store, r.categoryPath) }));
  const why = (x: (typeof all)[number]) => ("why" in x.e ? x.e.why : null);
  const lines: string[] = [];
  const say = (s = "") => lines.push(s);

  // --- A ---------------------------------------------------------------------
  const outcome = (x: (typeof all)[number]) => (x.e.id ? `kind by ${x.e.step}` : `no kind: ${why(x)}`);
  say("A. products on sale, by how their kind was decided");
  say(["".padEnd(36), ...STORES.map((s) => s.padStart(11)), "total".padStart(8)].join(""));
  for (const o of [...new Set(all.map(outcome))].sort()) {
    const per = STORES.map((s) => all.filter((x) => x.store === s && outcome(x) === o).length);
    say([o.padEnd(36), ...per.map((n) => String(n).padStart(11)), String(per.reduce((a, b) => a + b, 0)).padStart(8)].join(""));
  }
  const per = STORES.map((s) => all.filter((x) => x.store === s).length);
  say(["all".padEnd(36), ...per.map((n) => String(n).padStart(11)), String(all.length).padStart(8)].join(""));
  const withKind = all.filter((x) => x.e.id);
  say(`  of the ${withKind.length} with a kind, ${withKind.filter((x) => FOOD_TYPE_BY_ID.get(x.e.id!)?.hidden).length} are in kinds hidden from the site`);
  const stale = all.filter((x) => (x.e.id ?? null) !== (x.foodType ?? null));
  say(`  stored kind differs from today's rules: ${stale.length} (npm run classify:food writes today's)`);
  // What a rule change would do, before classify:food writes it: every product
  // that would change kind, grouped by old -> new, largest group first.
  const moves = new Map<string, string[]>();
  for (const x of stale) {
    const key = `${x.foodType ?? "-"} -> ${x.e.id ?? "-"}`;
    moves.set(key, [...(moves.get(key) ?? []), `${x.store.slice(0, 2)} ${x.name} | ${x.categoryPath ?? ""}`]);
  }
  writeFileSync(
    path.join(outDir, "changes.txt"),
    [...moves]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, l]) => `${String(l.length).padStart(5)}  ${k}\n${l.map((s) => `         ${s}`).join("\n")}`)
      .join("\n\n")
  );

  // --- B ---------------------------------------------------------------------
  const noKind = all.filter((x) => !x.e.id && why(x) !== "not a food section");
  const count = (key: (x: (typeof all)[number]) => string) => {
    const m = new Map<string, number>();
    for (const x of noKind) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  say();
  say(`B. food products with no kind: ${noKind.length}`);
  say("  commonest first words:");
  for (const [w, n] of count((x) => nameTokensForType(x.name, x.store)[0] ?? "(none)").slice(0, 60)) say(`    ${String(n).padStart(5)}  ${w}`);
  say("  commonest shelves:");
  for (const [w, n] of count((x) => `${x.store.slice(0, 2)} ${(x.categoryPath ?? "(none)").split("/").slice(-2).join("/")}`).slice(0, 50)) {
    say(`    ${String(n).padStart(5)}  ${w}`);
  }

  // --- C ---------------------------------------------------------------------
  const byEan = new Map<string, typeof all>();
  for (const x of all) {
    if (!x.eanNormalized) continue;
    byEan.set(x.eanNormalized, [...(byEan.get(x.eanNormalized) ?? []), x]);
  }
  let groups = 0, same = 0, differ = 0, partial = 0, none = 0;
  const differing: string[] = [];
  for (const [ean, g] of byEan) {
    if (new Set(g.map((x) => x.store)).size < 2) continue;
    groups++;
    const named = new Set(g.map((x) => x.e.id).filter(Boolean));
    if (named.size === 0) none++;
    else if (named.size > 1) {
      differ++;
      differing.push(`${ean}: ` + g.map((x) => `${x.store.slice(0, 2)} "${x.name}" -> ${x.e.id ?? "-"} (${x.e.step ?? why(x)})`).join(" | "));
    } else if (g.some((x) => !x.e.id)) partial++;
    else same++;
  }
  say();
  say(`C. barcodes at two or more stores: ${groups}`);
  say(`  same kind everywhere:              ${same}`);
  say(`  different kinds (one is wrong):    ${differ}`);
  say(`  a kind at one store, none at another: ${partial}`);
  say(`  no kind anywhere:                  ${none}`);
  for (const s of STORES) {
    say(`  ${s.padEnd(11)} products with a barcode: ${all.filter((x) => x.store === s && x.eanNormalized).length} of ${all.filter((x) => x.store === s).length}`);
  }
  writeFileSync(path.join(outDir, "barcode-disagreements.txt"), differing.join("\n"));

  // --- D ---------------------------------------------------------------------
  // A different seed draws a different sample: needed once a sample has been
  // studied to make rules from, since it then flatters the classifier.
  let seed = Number(process.argv[3] ?? 20261020);
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const shuffled = <T,>(a: T[]) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const sample: string[] = ["step\tstore\tkind or reason\tname\tshelf"];
  for (const step of ["head", "cut", "shelf"] as const) {
    for (const s of STORES) {
      for (const x of shuffled(all.filter((y) => y.store === s && y.e.step === step)).slice(0, SAMPLE_PER_CELL)) {
        sample.push([step, x.store, x.e.id, x.name, x.categoryPath ?? ""].join("\t"));
      }
    }
  }
  for (const s of STORES) {
    for (const x of shuffled(noKind.filter((y) => y.store === s)).slice(0, SAMPLE_PER_CELL)) {
      sample.push(["none", x.store, why(x), x.name, x.categoryPath ?? ""].join("\t"));
    }
  }
  writeFileSync(path.join(outDir, "sample.tsv"), sample.join("\n"));
  say();
  say(`D. sample to check by hand: ${sample.length - 1} products, in ${path.join(outDir, "sample.tsv")}`);

  writeFileSync(path.join(outDir, "measure.txt"), lines.join("\n"));
  console.log(lines.join("\n"));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
