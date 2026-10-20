import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { barcodeIndex, certaintyOf } from "../lib/kind-certainty";
import { FOOD_TYPE_BY_ID } from "../lib/food-types";

/**
 * The review list: every product whose kind of food is not certain enough to
 * accept on its own (src/lib/kind-certainty.ts), grouped by pattern - store,
 * shelf, kind and how it was decided - so a whole shelf of wine can be checked
 * as one decision rather than six thousand. Read-only.
 *
 *   npm run review:kinds                 # into reports/kind-review-<date>/
 *
 * Writes summary.txt (how many products at each certainty, the groups largest
 * first) and groups.tsv (every group with up to 8 example names).
 */

const outDir = process.argv[2] ?? path.join("reports", `kind-review-${new Date().toISOString().slice(0, 10)}`);

async function main() {
  mkdirSync(outDir, { recursive: true });
  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { store: true, storeProductId: true, name: true, categoryPath: true, eanNormalized: true },
  });
  const index = barcodeIndex(rows);
  const judged = rows.map((r) => ({ ...r, c: certaintyOf(r, index) }));

  const lines: string[] = [];
  const say = (s = "") => lines.push(s);
  const stores = ["CONTINENTE", "PINGO_DOCE", "AUCHAN"];
  say("products on sale by certainty of their kind");
  say("".padEnd(10) + stores.map((s) => s.padStart(12)).join("") + "total".padStart(9));
  for (const level of ["high", "review", "none"] as const) {
    const per = stores.map((s) => judged.filter((x) => x.store === s && x.c.level === level).length);
    say(level.padEnd(10) + per.map((n) => String(n).padStart(12)).join("") + String(per.reduce((a, b) => a + b, 0)).padStart(9));
  }

  const review = judged.filter((x) => x.c.level === "review");
  const reasons = new Map<string, number>();
  for (const x of review) {
    const key = x.c.why.replace(/ is .*? (elsewhere|at another chain)$/, " is another kind $1");
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  say();
  say(`to review: ${review.length}, by reason`);
  for (const [r, n] of [...reasons].sort((a, b) => b[1] - a[1])) say(`  ${String(n).padStart(6)}  ${r}`);

  // A group is one decision to check: the same store, shelf, kind and step.
  const groups = new Map<string, typeof review>();
  for (const x of review) {
    const shelf = (x.categoryPath ?? "(none)").split("/").slice(-2).join("/");
    const key = [x.store, shelf, x.c.e.id ?? "-", x.c.e.step ?? "barcode"].join("\t");
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length);
  const hidden = (id: string) => FOOD_TYPE_BY_ID.get(id)?.hidden;
  const visible = sorted.filter(([k]) => {
    const id = k.split("\t")[2];
    return id === "-" || !hidden(id);
  });
  say();
  say(`groups: ${sorted.length}; of them in kinds shown on the site: ${visible.length} (${visible.reduce((n, [, l]) => n + l.length, 0)} products)`);
  for (const share of [0.5, 0.8, 0.9]) {
    const total = review.length;
    let n = 0, g = 0;
    for (const [, l] of sorted) {
      if (n >= total * share) break;
      n += l.length;
      g++;
    }
    say(`  the largest ${g} groups hold ${Math.round(share * 100)}% of the products to review`);
  }
  say();
  say("largest groups:");
  for (const [k, l] of sorted.slice(0, 40)) {
    const [store, shelf, kind, step] = k.split("\t");
    say(`  ${String(l.length).padStart(5)}  ${store.slice(0, 2)}  ${kind.padEnd(16)} ${step.padEnd(7)} ${shelf}${hidden(kind) ? "   (hidden)" : ""}`);
  }

  writeFileSync(
    path.join(outDir, "groups.tsv"),
    ["products\tstore\tshelf\tkind\tstep\texamples"]
      .concat(sorted.map(([k, l]) => `${l.length}\t${k}\t${l.slice(0, 8).map((x) => x.name).join(" ; ")}`))
      .join("\n")
  );
  writeFileSync(path.join(outDir, "summary.txt"), lines.join("\n"));
  console.log(lines.join("\n"));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
