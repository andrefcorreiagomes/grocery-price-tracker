import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/db";
import { barcodeIndex, certaintyOf } from "../lib/kind-certainty";
import { shelfKey } from "../lib/kind-decisions";
import { FOOD_TYPE_BY_ID } from "../lib/food-types";

/**
 * One batch of the kind review, in three steps:
 *
 *   npm run review:batch -- list <groups.txt> [n]
 *       the n largest review groups (default 30) in kinds shown on the site,
 *       every product in each, for a person or Claude to read in full
 *   npm run review:batch -- page <groups.txt> <decisions.json> <page.html>
 *       the page that shows each group's decision for approval
 *   npm run review:batch -- record <groups.txt> <decisions.json>
 *       after approval only: appends the decisions to data/kind-reviews.ts
 *
 * decisions.json:
 *   { "batch": 2,
 *     "newKinds": { "id": "label" },          kinds proposed with this batch
 *     "proposals": ["html", ...],             anything else to approve
 *     "groups": { "1": { "verdict": "confirm" | "exceptions" | "correct",
 *                        "to": "kind" | "-",  for "correct": the whole group
 *                        "why": "...",
 *                        "exceptions": [[["id", ...], "kind" | "-", "why"]] } } }
 *
 * "-" means no kind. Written for batch 2, 20 October 2026; batch 1 was done
 * by hand the same way.
 */

interface GroupDecision {
  verdict: "confirm" | "exceptions" | "correct";
  to?: string;
  why: string;
  exceptions?: [string[], string, string][];
}
interface Decisions {
  batch: number;
  newKinds?: Record<string, string>;
  proposals?: string[];
  groups: Record<string, GroupDecision>;
}
interface Group {
  num: number;
  store: string;
  shelf: string;
  kind: string;
  step: string;
  products: { id: string; name: string }[];
}

function readGroups(file: string): Group[] {
  return readFileSync(file, "utf8")
    .split(/\n\n(?=### )/)
    .map((block) => {
      const [head, ...rows] = block.trim().split("\n");
      const [numStr, , store, shelf, kind, step] = head.split("\t");
      return {
        num: Number(numStr.replace("### ", "")),
        store, shelf, kind, step,
        products: rows.map((r) => {
          const [id, ...name] = r.split("\t");
          return { id, name: name.join("\t") };
        }),
      };
    });
}

/** Every decision must name products that are in its group, and kinds that exist. */
function checkDecisions(groups: Group[], d: Decisions) {
  const known = (k: string) => k === "-" || FOOD_TYPE_BY_ID.has(k) || !!d.newKinds?.[k];
  for (const g of groups) {
    const gd = d.groups[String(g.num)];
    if (!gd) throw new Error(`group ${g.num} has no decision`);
    if (gd.verdict === "correct" && (!gd.to || !known(gd.to))) throw new Error(`group ${g.num}: unknown kind ${gd.to}`);
    const ids = new Set(g.products.map((p) => p.id));
    for (const [list, to] of gd.exceptions ?? []) {
      if (!known(to)) throw new Error(`group ${g.num}: unknown kind ${to}`);
      for (const id of list) if (!ids.has(id)) throw new Error(`group ${g.num}: product ${id} is not in the group`);
    }
  }
}

async function list(out: string, n: number) {
  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { store: true, storeProductId: true, name: true, categoryPath: true, eanNormalized: true },
  });
  const index = barcodeIndex(rows);
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    const c = certaintyOf(r, index);
    if (c.level !== "review") continue;
    const kind = c.d.e.id ?? "-";
    if (kind !== "-" && FOOD_TYPE_BY_ID.get(kind)?.hidden) continue;
    const key = [r.store, shelfKey(r.categoryPath), kind, c.d.e.step ?? "barcode"].join("\t");
    groups.set(key, [...(groups.get(key) ?? []), { id: r.storeProductId, name: r.name }]);
  }
  const top = [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, n);
  writeFileSync(out, top.map(([k, l], i) => `### ${i + 1}\t${l.length}\t${k}\n` + l.map((x) => `${x.id}\t${x.name}`).join("\n")).join("\n\n"));
  console.log(top.map(([k, l], i) => `${i + 1}\t${l.length}\t${k}`).join("\n"));
  console.log(`products: ${top.reduce((s, [, l]) => s + l.length, 0)}`);
}

const STORE_NAME: Record<string, string> = { CONTINENTE: "Continente", PINGO_DOCE: "Pingo Doce", AUCHAN: "Auchan" };
const STEP: Record<string, string> = { shelf: "by its shelf", cut: "past a cut word", head: "by its name", barcode: "with no kind, though its barcode has one at another chain," };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(groups: Group[], d: Decisions, out: string) {
  checkDecisions(groups, d);
  const label = (id: string) =>
    id === "-" ? "no kind" : d.newKinds?.[id] ? `${d.newKinds[id]} (new)` : FOOD_TYPE_BY_ID.get(id)?.label ?? id;
  const counts = { confirm: 0, exceptions: 0, correct: 0 };
  let total = 0;
  let moved = 0;
  let cards = "";
  for (const g of groups) {
    const gd = d.groups[String(g.num)];
    counts[gd.verdict]++;
    total += g.products.length;
    const byId = new Map(g.products.map((p) => [p.id, p.name]));
    const exceptionIds = new Set((gd.exceptions ?? []).flatMap(([ids]) => ids));
    moved += gd.verdict === "correct" ? g.products.length : exceptionIds.size;
    const pill = { confirm: "Right as it is", exceptions: "Right, with exceptions", correct: "Wrong as a group" }[gd.verdict];
    const decision =
      gd.verdict === "correct"
        ? `<span class="from">${esc(label(g.kind))}</span> becomes <strong>${esc(label(gd.to!))}</strong>`
        : `stays <strong>${esc(label(g.kind))}</strong>`;
    const exc = (gd.exceptions ?? [])
      .map(([ids, to, why]) =>
        `<tr><td class="names">${ids.map((id) => esc(byId.get(id)!)).join("<br>")}</td><td class="to">${esc(label(to))}</td><td class="why">${esc(why)}</td></tr>`)
      .join("");
    const all = g.products.map((p) => `<li${exceptionIds.has(p.id) ? ' class="ex"' : ""}>${esc(p.name)}</li>`).join("");
    cards += `
<article class="group v-${gd.verdict}" id="g${g.num}">
  <header>
    <span class="num">${g.num}</span>
    <div class="titles">
      <h2>${esc(STORE_NAME[g.store] ?? g.store)} <span class="sep">/</span> <span class="shelf">${esc(g.shelf)}</span></h2>
      <p class="meta">${g.products.length} products · decided ${esc(STEP[g.step] ?? g.step)} as <em>${esc(label(g.kind))}</em></p>
    </div>
    <span class="pill">${pill}</span>
  </header>
  <p class="decision">${decision}</p>
  <p class="reason">${esc(gd.why)}</p>
  ${exc ? `<div class="tablewrap"><table><thead><tr><th>Exception</th><th>Becomes</th><th>Why</th></tr></thead><tbody>${exc}</tbody></table></div>` : ""}
  <details><summary>All ${g.products.length} products</summary><ul class="all">${all}</ul></details>
</article>`;
  }
  const proposals = (d.proposals ?? []).map((p) => `<li>${p}</li>`).join("");
  const html = `<title>Kind Review Batch ${d.batch}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,500;7..72,650&family=Public+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* A grocer's ledger: one column of group cards, each with a verdict stripe. */
:root {
  --paper: #f7f8f5; --card: #ffffff; --ink: #1d2420; --muted: #5d6862; --rule: #dde2dc;
  --ok: #2f7a4f; --ok-bg: #e5f1e9; --warn: #9a6a12; --warn-bg: #f7eedb; --bad: #a8402f; --bad-bg: #f8e6e2;
  --display: "Literata", Georgia, serif; --body: "Public Sans", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #141815; --card: #1c211e; --ink: #e6ebe7; --muted: #9ba69f; --rule: #2e3631;
  --ok: #6cc28f; --ok-bg: #1f3328; --warn: #e0b45a; --warn-bg: #352c18; --bad: #ec8b78; --bad-bg: #3a221d; color-scheme: dark } }
:root[data-theme="dark"] {
  --paper: #141815; --card: #1c211e; --ink: #e6ebe7; --muted: #9ba69f; --rule: #2e3631;
  --ok: #6cc28f; --ok-bg: #1f3328; --warn: #e0b45a; --warn-bg: #352c18; --bad: #ec8b78; --bad-bg: #3a221d; color-scheme: dark }
body { background: var(--paper); color: var(--ink); font: 15px/1.55 var(--body); }
.wrap { max-width: 860px; margin: 0 auto; padding-block: 32px 64px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  display: grid; gap: 20px; }
h1 { font: 650 2rem/1.15 var(--display); margin: 0; text-wrap: balance; }
.lede { margin: 0; max-width: 65ch; color: var(--muted); }
.lede strong { color: var(--ink); }
.summary { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { font: 500 13px var(--mono); padding: 6px 10px; border-radius: 6px; background: var(--card); border: 1px solid var(--rule); font-variant-numeric: tabular-nums; }
.chip.ok { color: var(--ok); } .chip.warn { color: var(--warn); } .chip.bad { color: var(--bad); }
.proposals { background: var(--card); border: 1px solid var(--rule); border-radius: 8px; padding: 14px 18px; display: grid; gap: 6px; }
.proposals h2 { font: 600 12px var(--body); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0; }
.proposals ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; max-width: 70ch; }
.group { background: var(--card); border: 1px solid var(--rule); border-left: 5px solid var(--ok); border-radius: 8px; padding: 16px 18px; display: grid; gap: 10px; min-width: 0; }
.group.v-exceptions { border-left-color: var(--warn); }
.group.v-correct { border-left-color: var(--bad); }
.group header { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; }
.num { font: 500 13px var(--mono); color: var(--muted); padding-top: 3px; min-width: 1.8em; }
.titles { min-width: 0; }
h2 { font: 600 1.05rem/1.3 var(--display); margin: 0; overflow-wrap: anywhere; }
.sep { color: var(--muted); font-weight: 400; }
.shelf { font-family: var(--mono); font-size: .85em; font-weight: 400; }
.meta { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.pill { font: 600 12px var(--body); padding: 4px 9px; border-radius: 999px; white-space: nowrap; color: var(--ok); background: var(--ok-bg); }
.v-exceptions .pill { color: var(--warn); background: var(--warn-bg); }
.v-correct .pill { color: var(--bad); background: var(--bad-bg); }
.decision { margin: 0; }
.decision .from { text-decoration: line-through; color: var(--muted); }
.reason { margin: 0; max-width: 70ch; }
.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th { text-align: left; font: 600 11px var(--body); text-transform: uppercase; letter-spacing: .07em; color: var(--muted); border-bottom: 1px solid var(--rule); padding: 6px 8px; }
td { vertical-align: top; padding: 7px 8px; border-bottom: 1px solid var(--rule); }
td.names { font-family: var(--mono); font-size: 12px; min-width: 16em; }
td.to { font-weight: 600; white-space: nowrap; }
td.why { color: var(--muted); min-width: 12em; }
details summary { cursor: pointer; color: var(--muted); font-size: 13px; }
details summary:focus-visible { outline: 2px solid var(--ok); outline-offset: 2px; }
ul.all { columns: 2 18em; column-gap: 24px; margin: 10px 0 0; padding-left: 18px; font: 12px/1.6 var(--mono); }
ul.all li.ex { color: var(--warn); font-weight: 500; }
.v-correct ul.all li.ex { color: var(--bad); }
footer { color: var(--muted); font-size: 13px; max-width: 70ch; }
@media (max-width: 520px) { .group header { grid-template-columns: auto 1fr; } .pill { grid-column: 2; justify-self: start; } }
</style>
<div class="wrap">
  <h1>Kind review, batch ${d.batch}</h1>
  <p class="lede">The next ${groups.length} largest groups of products whose kind of food the classifier was not sure of, in kinds shown on the website. A group is one store, one shelf and one kind. I read <strong>every product</strong> in each group. For each I give a decision: right as it is, right with a few exceptions, or wrong as a whole. <strong>Nothing is recorded yet.</strong> This is for you to look at first.</p>
  <div class="summary">
    <span class="chip">${groups.length} groups</span>
    <span class="chip">${total.toLocaleString("en-GB")} products</span>
    <span class="chip ok">${counts.confirm} right as they are</span>
    <span class="chip warn">${counts.exceptions} right, with exceptions</span>
    <span class="chip bad">${counts.correct} wrong as a group</span>
    <span class="chip">${moved} products change kind</span>
  </div>
  ${proposals ? `<section class="proposals"><h2>Also proposed</h2><ul>${proposals}</ul></section>` : ""}
  ${cards}
  <footer>Once you agree, these decisions are added to data/kind-reviews.ts, the same file as the earlier batches. Every product in a confirmed group, including new ones that appear there later, then counts as certain.</footer>
</div>
`;
  writeFileSync(out, html);
  console.log({ groups: groups.length, total, counts, moved });
}

function record(groups: Group[], d: Decisions) {
  checkDecisions(groups, d);
  const missing = Object.keys(d.newKinds ?? {}).filter((k) => !FOOD_TYPE_BY_ID.has(k));
  if (missing.length) throw new Error(`add these kinds to data/food-types.ts first: ${missing.join(", ")}`);
  const q = (s: string) => JSON.stringify(s);
  const kindOrNull = (k: string) => (k === "-" ? "null" : q(k));
  const groupLines: string[] = [];
  const productLines: string[] = [];
  for (const g of groups) {
    const gd = d.groups[String(g.num)];
    const why = gd.why.replace(/\s+/g, " ");
    const names = new Map(g.products.map((p) => [p.id, p.name]));
    const product = (id: string, kind: string, reason: string) =>
      `  { batch: ${d.batch}, store: ${q(g.store)}, id: ${q(id)}, name: ${q(names.get(id)!)}, kind: ${kindOrNull(kind)}, why: ${q(reason)} },`;
    if (g.kind === "-") {
      // A group the classifier gave no kind (in review through a barcode)
      // cannot be matched as a group, so each product is recorded on its own.
      const exception = new Map<string, [string, string]>();
      for (const [ids, to, why2] of gd.exceptions ?? []) for (const id of ids) exception.set(id, [to, why2]);
      for (const p of g.products) {
        const [to, reason] = exception.get(p.id) ?? [gd.verdict === "correct" ? gd.to! : "-", why];
        productLines.push(product(p.id, to, reason));
      }
      continue;
    }
    const becomes = gd.verdict === "correct" ? `, becomes: ${kindOrNull(gd.to!)}` : "";
    groupLines.push(`  // ${d.batch}.${g.num}. ${why.length > 150 ? why.slice(0, 150) + "..." : why}
  { batch: ${d.batch}, store: ${q(g.store)}, shelf: ${q(g.shelf)}, kind: ${q(g.kind)}, step: ${q(g.step)}${becomes} },`);
    for (const [ids, to, why2] of gd.exceptions ?? []) {
      for (const id of ids) productLines.push(product(id, to, why2));
    }
  }
  const file = "data/kind-reviews.ts";
  let text = readFileSync(file, "utf8");
  if (text.includes(`{ batch: ${d.batch}, `)) throw new Error(`batch ${d.batch} is already recorded`);
  const insert = (marker: string, lines: string[]) => {
    const start = text.indexOf(marker);
    const end = text.indexOf("\n];", start);
    if (start < 0 || end < 0) throw new Error(`cannot find ${marker}`);
    text = text.slice(0, end) + "\n" + lines.join("\n") + text.slice(end);
  };
  insert("export const REVIEWED_GROUPS", groupLines);
  insert("export const REVIEWED_PRODUCTS", productLines);
  writeFileSync(file, text);
  console.log(`recorded batch ${d.batch}: ${groupLines.length} groups, ${productLines.length} products`);
}

async function main() {
  const [mode, a, b, c] = process.argv.slice(2);
  if (mode === "list") return list(a, Number(b ?? 30));
  const d = b ? (JSON.parse(readFileSync(b, "utf8")) as Decisions) : null;
  if (!d) throw new Error("usage: see the comment at the top of src/scripts/review-batch.ts");
  if (mode === "page") return page(readGroups(a), d, c);
  if (mode === "record") return record(readGroups(a), d);
  throw new Error(`unknown mode ${mode}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
