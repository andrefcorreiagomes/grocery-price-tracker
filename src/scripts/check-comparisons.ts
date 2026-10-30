import { writeFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { FOOD_TYPE_BY_ID } from "../lib/food-types";
import { getFoodTypePage, getFreshness, currentSince } from "../lib/grupos";
import { parseSize } from "../lib/sizes";
import type { Cell } from "../lib/comparison";

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

const PRICE_RATIO = 2;

/**
 * Words that change what a product is, or who it is for. Compared without
 * accents and in lower case. Chosen from the three pages read on 29 October
 * 2026 (a cooking banana, evaporated milk, a growing-up milk) and the usual
 * ways a supermarket varies a food; a word missing here is simply not looked
 * for, which is why the price gap is checked too.
 */
const FORM_WORDS = [
  "assar", "cozinhar", "evaporado", "condensado", "crescimento", "infantil", "bebe", "junior", "kids", "anos",
  "po", "desidratado", "desidratada", "liofilizado", "seco", "seca", "secos", "secas",
  "congelado", "congelada", "congelados", "ultracongelado", "fresco", "fresca", "refrigerado",
  "cozido", "cozida", "cozidos", "assado", "assada", "frito", "frita", "fumado", "fumada", "curado", "curada",
  "panado", "panada", "temperado", "temperada", "marinado", "recheado", "recheada",
  "calda", "xarope", "sumo", "nectar", "polpa", "pure", "compota", "doce", "geleia", "molho", "creme",
  "mousse", "bebida", "sopa", "salada", "snack", "chips", "aperitivo", "barra", "barras",
  "light", "zero", "magro", "magra", "gordo", "gorda", "integral", "bio", "biologico", "biologica",
  "lactose", "gluten", "vegan", "vegetal", "vegetais",
  "lata", "frasco", "conserva", "oleo", "azeite", "escabeche", "natural",
  "ralado", "ralada", "fatiado", "fatiada", "laminado", "picado", "picada", "moido", "moida", "triturado",
  "inteiro", "inteira", "file", "filetes", "posta", "postas", "lombo", "peito", "coxa", "coxas", "asa", "asas",
  "perna", "pa", "costeleta", "costeletas", "bife", "bifes", "hamburguer", "salsicha", "salsichas",
  "descascado", "descascada", "limpo", "limpa", "miolo", "lombos", "cubos", "tiras", "rodelas", "metades",
];
const plain = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * One form for the variants of a word, so "Biológica" on one product and "Bio"
 * on another, or "congelados" and "ultracongelado", count as the same word:
 * without this, 840 rows were flagged on 29 October 2026, most for the same
 * label spelt two ways.
 */
const SAME_AS: Record<string, string> = { bi: "biologic", ultracongelad: "congelad", conserv: "lat", file: "filete", vegetai: "vegetal" };
function canon(word: string): string {
  let w = word.replace(/s$/, "").replace(/[oa]$/, "");
  if (w.length < 2) w = word;
  return SAME_AS[w] ?? w;
}
const FORM = new Set(FORM_WORDS.map(canon));
const words = (s: string) => new Set(plain(s).split(/[^a-z0-9+]+/).filter(Boolean).map(canon));

type Row = { store: string; name: string; price: number | null; unitPrice: number | null; size: number | null; unit: string | null };

interface Finding {
  kind: string;
  kindLabel: string;
  comparison: string;
  row: "cheapest" | "own brand" | "same product";
  problem: "form word" | "price gap" | "size unread" | "pack sizes";
  detail: string;
  products: Row[];
}

function rowOf(store: string, cell: Cell): Row | null {
  if (cell.kind === "price") {
    const p = cell.product;
    return { store, name: p.name, price: p.price, unitPrice: cell.unitPrice, size: p.packageSize, unit: p.unit };
  }
  if (cell.kind === "no-size") {
    const p = cell.example;
    return { store, name: p.name, price: p.price, unitPrice: null, size: p.packageSize, unit: p.unit };
  }
  return null;
}

/** The checks shared by every kind of row. */
function checkRow(cells: Map<string, Cell>, base: Omit<Finding, "problem" | "detail" | "products">, out: Finding[]) {
  const rows = [...cells].map(([store, cell]) => rowOf(store, cell)).filter((r): r is Row => r !== null);
  if (rows.length < 2) return;

  // A form word on one product and on none of the others - unless the
  // comparison itself is named by it ("Batata doce · Biológico"): then the word
  // says only what every product in it is.
  const named = words(`${base.kindLabel} ${base.comparison}`);
  const sets = rows.map((r) => words(r.name));
  const odd: string[] = [];
  rows.forEach((r, i) => {
    for (const w of sets[i]) {
      if (FORM.has(w) && !named.has(w) && sets.every((s, j) => j === i || !s.has(w))) odd.push(`${r.store}: "${w}"`);
    }
  });
  if (odd.length > 0) out.push({ ...base, problem: "form word", detail: odd.join("; "), products: rows });

  const priced = rows.filter((r) => r.unitPrice !== null);
  if (priced.length >= 2) {
    const lo = Math.min(...priced.map((r) => r.unitPrice as number));
    const hi = Math.max(...priced.map((r) => r.unitPrice as number));
    if (hi >= PRICE_RATIO * lo) out.push({ ...base, problem: "price gap", detail: `${(hi / lo).toFixed(1)} times`, products: rows });
  }

  for (const r of rows) {
    if (r.unitPrice === null && parseSize(r.name) !== null) {
      out.push({ ...base, problem: "size unread", detail: `${r.store}: the name gives a size, the site says none`, products: rows });
    }
  }
}

async function main() {
  const findings: Finding[] = [];
  let pages = 0;
  let rowsChecked = 0;
  for (const type of FOOD_TYPE_BY_ID.values()) {
    if (type.hidden) continue;
    const page = await getFoodTypePage(type.id);
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

