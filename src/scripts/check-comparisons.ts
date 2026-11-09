import { writeFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { getComparableFoodTypes, getFoodTypePage, getFreshness, currentSince } from "../lib/grupos";
import { checkRow, rowOf, type Finding, type Row } from "../lib/comparison-flags";

/**
 * `npm run check:comparisons`: what the site shows, read the way a careful
 * shopper would, to find comparisons that are not like with like (the user's
 * request, 29 October 2026: correctness before going public). Read-only: no
 * store requests, no database writes.
 *
 * For every food page, every row a visitor sees - each comparison's "cheapest
 * at each store" and "own brand" rows, and the "same product in several
 * chains" rows - is checked for:
 *   form word   a word that changes what the product is ("assar", "evaporado",
 *               "+3 anos") on one store's product and not the others' in the row
 *   price gap   one store's price per unit at least PRICE_RATIO times another's
 *   size unread "sem peso indicado" although the name carries a size
 *   pack sizes  a "same product" row whose stores' packs differ in size
 * Each is a question for a person, not a verdict: the list is reviewed by hand.
 *
 *   npm run check:comparisons                 # writes reports/comparison-check.json and .md
 */

async function main() {
  const findings: Finding[] = [];
  let pages = 0;
  let rowsChecked = 0;
  // The pages the site's food list shows. Until 31 October 2026 every kind
  // with a page was counted, 217 against the site's 215: lobster and cereal
  // drinks have a page with no comparison in it, which the list leaves out.
  for (const { id } of await getComparableFoodTypes()) {
    const page = await getFoodTypePage(id);
    if (!page) continue;
    pages++;
    for (const g of page.groups) {
      const base = { kind: page.id, kindLabel: page.label, comparison: g.title };
      checkRow(g.cheapest, { ...base, row: "cheapest" }, findings);
      checkRow(g.ownBrand, { ...base, row: "own brand" }, findings);
      rowsChecked += 2;
    }
    for (const n of page.named) {
      for (const g of n.groups.shown) {
        const base = { kind: page.id, kindLabel: page.label, comparison: g.name, row: "same product" as const };
        rowsChecked++;
        checkRow(g.cells, base, findings);
        // The same article should come in the same pack; a different size is
        // either a multipack the matching accepted or not the same article.
        const sized = [...g.cells]
          .map(([store, cell]) => rowOf(store, cell))
          .filter((r): r is Row => r !== null && r.size !== null);
        if (sized.length >= 2) {
          const lo = Math.min(...sized.map((r) => r.size as number));
          const hi = Math.max(...sized.map((r) => r.size as number));
          if (hi > lo * 1.05) {
            findings.push({ ...base, problem: "pack sizes", detail: sized.map((r) => `${r.store} ${r.size} ${r.unit}`).join(", "), products: sized });
          }
        }
      }
    }
  }

  // The own-brand row often shows the very products the cheapest row does: one
  // question, asked once.
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const key = [f.kind, f.comparison, f.problem, ...f.products.map((p) => `${p.store}:${p.name}`).sort()].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  findings.length = 0;
  findings.push(...unique);

  const fresh = await getFreshness();
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.problem, (counts.get(f.problem) ?? 0) + 1);
  const summary = {
    data: fresh.map((f) => `${f.store} ${f.lastSeenAt.toISOString().slice(0, 10)} (current since ${currentSince(f.lastSeenAt).toISOString().slice(0, 10)})`),
    pages,
    rowsChecked,
    findings: findings.length,
    byProblem: Object.fromEntries(counts),
    pagesWithFindings: new Set(findings.map((f) => f.kind)).size,
  };
  writeFileSync("reports/comparison-check.json", JSON.stringify({ summary, findings }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
}

main().finally(() => prisma.$disconnect());

