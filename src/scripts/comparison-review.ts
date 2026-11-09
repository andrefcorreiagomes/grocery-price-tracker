import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { checkRow, type Finding } from "../lib/comparison-flags";
import type { Cell, ComparableProduct } from "../lib/comparison";
import {
  emptyMemory,
  factsFor,
  gapOf,
  identityOf,
  MAX_ANSWERS_BYTES,
  maxAnswerLines,
  parseProposalNumbers,
  selectRows,
  takeInAnswers,
  type Answer,
  type Memory,
  type ReviewRow,
  type SentRow,
  type StoreEntry,
  type VisitorReport,
} from "../lib/comparison-review";
import { REASONS, type Reason } from "../lib/error-report-choices";
import { getComparableFoodTypes, getFoodTypePage } from "../lib/grupos";

/**
 * Program one of the daily AI review of the comparisons (ai-review-plan.md in
 * the private notes). Run by deploy/publish-nightly.sh when the night's
 * collection ends. Reads the database and writes only into two folders: no
 * store requests, no database writes.
 *
 *   npm run comparison:review -- --notes=<private notes> --review=<review repository> --day=2026-11-16
 *
 * Two places, so the AI cannot reach what it must not see (the owner, 8
 * November 2026): the AI has the review repository (poupa-facil-comparison-
 * review) only; the memory, with its earlier conclusions, and the owner's
 * answers stay in the private notes, which it cannot open.
 *
 *   1. takes in the AI's answers from the days not yet taken in
 *      (<review>/<date>-answers.jsonl) and the owner's answers
 *      (<notes>/comparison-review/owner-answers.json), into
 *      <notes>/comparison-review/memory.json. A rejected or missing answer
 *      leaves the row unread;
 *   2. lists every row the site shows today;
 *   3. writes today's reading list for the AI, <review>/<day>.jsonl, one row per
 *      line so it can be read in parts and uses little of the owner's Claude
 *      plan; and <notes>/comparison-review/<day>-sent.json, the program's own
 *      record of those rows' full contents.
 *
 * Does nothing before START_DAY, unless given --force.
 */
const START_DAY = "2026-11-16";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const notes = arg("notes");
const reviewDir = arg("review");
const day = arg("day") ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
const force = process.argv.includes("--force");
const reportsFile = path.resolve(process.env.ERROR_REPORTS_FILE ?? path.join("user-reports", "error-reports.jsonl"));

/**
 * Alarms for the owner: each is printed as a line starting "ALERT:", which the
 * night's publishing step copies into nightly/<day>/comparison-review.txt, where
 * the morning review of the night reads it and tells the owner's phone.
 */
const alerts: string[] = [];
/** Printed at once, so an alarm is not lost if the program stops later. */
function alarm(text: string) {
  alerts.push(text);
  console.log(`ALERT: ${text}`);
}

/**
 * The AI's answers, one per line: a line that cannot be read counts as a
 * rejected answer. A file over the size limit is not read at all (null).
 */
function readAnswers(file: string): Answer[] | null {
  if (!existsSync(file)) return [];
  if (statSync(file).size > MAX_ANSWERS_BYTES) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as Answer;
      } catch {
        return {} as Answer;
      }
    });
}

/** One row, as the site shows it. */
function entryOf(store: string, cell: Cell, extra: Map<string, { shelf: string | null; barcode: string | null }>): StoreEntry | null {
  const p: ComparableProduct | null = cell.kind === "price" ? cell.product : cell.kind === "no-size" ? cell.example : null;
  if (!p) return null;
  const more = extra.get(`${store}|${p.storeProductId}`);
  return {
    store,
    id: p.storeProductId,
    name: p.name,
    brand: p.brand,
    size: p.packageSize,
    unit: p.unit,
    price: p.price,
    perUnit: cell.kind === "price" ? Math.round(cell.unitPrice * 100) / 100 : null,
    promotion: p.onPromotion ?? null,
    regularPrice: p.regularPrice ?? null,
    promoEndsAt: p.promoEndsAt ? new Date(p.promoEndsAt).toISOString().slice(0, 10) : null,
    shelf: more?.shelf ?? null,
    barcode: more?.barcode ?? null,
    url: p.url ?? null,
  };
}

/** Every row the site shows, without own-brand rows repeating the cheapest row, and with two stores or more. */
async function todaysRows(): Promise<{ rows: ReviewRow[]; history: Map<string, { low: number | null; high: number | null }> }> {
  const products = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: { id: true, store: true, storeProductId: true, categoryPath: true, ean: true },
  });
  const extra = new Map(products.map((p) => [`${p.store}|${p.storeProductId}`, { shelf: p.categoryPath, barcode: p.ean }]));
  const keyOfInternal = new Map(products.map((p) => [p.id, `${p.store}|${p.storeProductId}`]));
  const ranges = await prisma.cataloguePrice.groupBy({ by: ["productId"], where: { price: { not: null } }, _min: { price: true }, _max: { price: true } });
  const history = new Map<string, { low: number | null; high: number | null }>();
  for (const r of ranges) {
    const key = keyOfInternal.get(r.productId);
    if (key) history.set(key, { low: r._min.price, high: r._max.price });
  }

  const rows: ReviewRow[] = [];
  const ids = new Set<string>();
  const add = (
    id: string,
    page: { id: string; label: string },
    comparison: string,
    comparisonKey: string,
    rowType: ReviewRow["rowType"],
    cells: Map<string, Cell>
  ) => {
    const stores = [...cells].map(([s, c]) => entryOf(s, c, extra)).filter((e): e is StoreEntry => e !== null).sort((a, b) => a.store.localeCompare(b.store));
    if (stores.length < 2) return;
    const findings: Finding[] = [];
    checkRow(cells, { kind: page.id, kindLabel: page.label, comparison, row: rowType }, findings);
    // Two same-product rows on a page can share a name (53 did on 2 November
    // 2026): their products tell them apart.
    const unique = ids.has(id) ? `${id}#${stores.map((s) => s.id).join("+")}` : id;
    ids.add(unique);
    rows.push({ id: unique, foodType: page.id, foodLabel: page.label, comparison, comparisonKey, rowType, stores, flags: findings.map((f) => `${f.problem}: ${f.detail}`) });
  };

  for (const { id: foodId } of await getComparableFoodTypes()) {
    const page = await getFoodTypePage(foodId);
    if (!page) continue;
    for (const g of page.groups) {
      add(`${page.id}|${g.key}|cheapest`, page, g.title, g.key, "cheapest", g.cheapest);
      const same = (m: Map<string, Cell>) =>
        [...m].map(([s, c]) => `${s}:${c.kind === "price" ? c.product.storeProductId : c.kind === "no-size" ? c.example.storeProductId : "-"}`).sort().join();
      // The own-brand row often shows the very products of the cheapest row: one question, asked once.
      if (same(g.ownBrand) !== same(g.cheapest)) add(`${page.id}|${g.key}|own`, page, g.title, g.key, "own brand", g.ownBrand);
    }
    for (const n of page.named) {
      for (const g of n.groups.shown) add(`${page.id}|${n.unit}|same|${g.name}`, page, g.name, `same|${g.name}`, "same product", g.cells);
    }
  }
  return { rows, history };
}

const readJson = <T>(file: string): T | null => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null);

/** Written whole or not at all, one row per line so each day's change in the notes stays small. */
function writeMemory(file: string, memory: Memory) {
  const { rows, ...rest } = memory;
  const entries = Object.keys(rows).sort().map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(rows[id])}`);
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, "");
  writeAtomically(file, `${head},\n  "rows": {\n${entries.join(",\n")}\n  }\n}\n`);
}

function writeAtomically(file: string, text: string) {
  writeFileSync(`${file}.new`, text, "utf8");
  renameSync(`${file}.new`, file);
}

/** The visitors' reports newer than the last taken in. */
function newReports(since: string): VisitorReport[] {
  if (!existsSync(reportsFile)) return [];
  const out: VisitorReport[] = [];
  for (const line of readFileSync(reportsFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as VisitorReport;
      if (typeof r.at === "string" && r.at > since) out.push(r);
    } catch {
      console.log("a visitor's report could not be read and was skipped");
    }
  }
  return out;
}

/** The owner's answers, kept in a file of their own so the notes on two computers never collide. */
function applyOwnerAnswers(dir: string, review: string, memory: Memory) {
  const list = readJson<{ date: string; yes?: string; no?: string; on: string }[]>(path.join(dir, "owner-answers.json")) ?? [];
  for (const entry of list) {
    // A file refused for its size was already reported on the day it came in.
    const answers = readAnswers(path.join(review, `${entry.date}-answers.jsonl`)) ?? [];
    const sent = readJson<SentRow[]>(path.join(dir, `${entry.date}-sent.json`)) ?? [];
    for (const [answer, text] of [["yes", entry.yes], ["no", entry.no]] as const) {
      for (const n of text ? parseProposalNumbers(text) : []) {
        const a = answers.find((x) => x.proposal === n);
        const row = sent.find((s) => s.row.id === a?.rowId)?.row;
        const known = a && memory.rows[a.rowId];
        if (a && row && known) known.owner = { answer, on: entry.on, identity: identityOf(row.stores), cause: a.cause, fix: a.fix };
      }
    }
  }
}

async function main() {
  if (!notes || !reviewDir) throw new Error("give --notes=<the private notes folder> and --review=<the comparison review repository>");
  if (day < START_DAY && !force) {
    console.log(`The AI review of the comparisons starts on ${START_DAY}; nothing done on ${day}.`);
    return;
  }
  const dir = path.join(notes, "comparison-review");
  mkdirSync(dir, { recursive: true });
  mkdirSync(reviewDir, { recursive: true });
  const memoryFile = path.join(dir, "memory.json");
  const memory = readJson<Memory>(memoryFile) ?? emptyMemory();

  // 1. what came back
  let yesterday: unknown = null;
  for (const date of [...memory.pendingDays].sort()) {
    const answersFile = path.join(reviewDir, `${date}-answers.jsonl`);
    if (!existsSync(answersFile)) {
      console.log(`no answers yet for ${date}: its rows stay unread`);
      continue;
    }
    const sent = readJson<SentRow[]>(path.join(dir, `${date}-sent.json`)) ?? [];
    const answers = readAnswers(answersFile);
    const stats = takeInAnswers(memory, date, sent, answers ?? []);
    if (answers === null) {
      const bytes = statSync(answersFile).size;
      stats.fileRefusedBytes = bytes;
      alarm(
        `the AI's answers of ${date} are ${(bytes / 1e6).toFixed(1)} MB, over the limit of ${MAX_ANSWERS_BYTES / 1e6} MB (an honest day is about 2 MB). ` +
          `The file was not read; its ${sent.length} rows stay unread and go out again. Someone may be trying to disrupt the review.`
      );
    } else {
      if (stats.overLimit > 0)
        alarm(`${stats.overLimit} of the AI's answers of ${date} were too long (a text over 2,000 characters, or an answer over 20,000) and were refused. Someone may be trying to disrupt the review.`);
      if (answers.length > maxAnswerLines(sent.length))
        alarm(`the AI's answers of ${date} have ${answers.length} lines for ${sent.length} rows sent. Someone may be writing in the AI's repository.`);
    }
    memory.days.push(stats);
    yesterday = stats;
    console.log(`answers of ${date}: ${JSON.stringify(stats)}`);
    memory.pendingDays = memory.pendingDays.filter((d) => d !== date);
  }
  applyOwnerAnswers(dir, reviewDir, memory);

  // 2. today
  const { rows, history } = await todaysRows();
  const fresh = newReports(memory.reportsUpTo);
  if (fresh.length > 0) {
    memory.pendingReports.push(...fresh);
    memory.reportsUpTo = fresh.map((r) => r.at).sort().at(-1) as string;
  }
  const hasRow = (r: VisitorReport) => rows.some((x) => x.foodType === r.foodType && x.comparisonKey === r.comparison && x.rowType !== "own brand");
  const reportsWithoutRow = memory.pendingReports.filter((r) => !hasRow(r));
  memory.pendingReports = memory.pendingReports.filter(hasRow);

  const seed = "poupa-facil-comparison-review";
  const selected = selectRows(rows, memory, day, (id) => createHash("sha256").update(seed + id).digest("hex"), (limit) => randomInt(limit));

  // 3. the day's file
  const reportsOf = (row: ReviewRow) => memory.pendingReports.filter((r) => r.foodType === row.foodType && r.comparison === row.comparisonKey && row.rowType !== "own brand");
  const sent: SentRow[] = selected.map((s) => ({ row: s.row, why: s.why, ...(reportsOf(s.row).length > 0 ? { reports: reportsOf(s.row) } : {}) }));
  // A field with nothing to say is left out, and each store's address too (the
  // AI cannot open it): this is what the owner's Claude plan pays to read. The
  // instructions list what a missing field means.
  const compact = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)));
  const lastLevels = (shelf: string | null) => shelf?.split("/").slice(-2).join("/") ?? null;
  const lines = selected.map((s) => {
    const known = memory.rows[s.row.id];
    const before = s.why === "changed" ? known?.contents : undefined;
    const refused = known?.owner?.answer === "no" && known.owner.identity === identityOf(s.row.stores) ? known.owner : undefined;
    return JSON.stringify(
      compact({
        rowId: s.row.id,
        why: s.why,
        food: s.row.foodLabel,
        comparison: s.row.comparison,
        rowType: s.row.rowType,
        scriptFlags: s.row.flags,
        changes: s.changes.filter((c) => c.field !== "url"),
        gapHighestToLowest: gapOf(s.row.stores),
        gapBefore: before ? gapOf(before) : null,
        stores: s.row.stores.map((e) => {
          const f = factsFor(e, before?.find((b) => b.store === e.store), history.get(`${e.store}|${e.id}`));
          return compact({
            store: e.store,
            name: e.name,
            brand: e.brand,
            size: e.size,
            unit: e.unit,
            price: e.price,
            perUnit: e.perUnit,
            // only when it disagrees with the price per unit shown
            calc: f.perUnitRecalculated !== e.perUnit ? f.perUnitRecalculated : null,
            changePct: f.priceChangePercent || null,
            promo: f.promotion === "off" ? null : f.promotion,
            was: e.regularPrice,
            until: e.promoEndsAt,
            shelf: lastLevels(e.shelf),
            barcode: e.barcode,
            low: f.historyLowest,
            high: f.historyHighest,
          });
        }),
        // The visitor's message goes word for word; the instructions say it is a claim to check.
        visitorReports: reportsOf(s.row).map((r) => ({ at: r.at, store: r.store || "the whole comparison", reason: REASONS[r.reason as Reason] ?? r.reason, visitorMessage: r.comment })),
        // Told only that the owner refused: a re-read still gets no earlier conclusion of the AI's.
        alreadyRefusedByOwner: refused ? { on: refused.on, cause: refused.cause, fix: refused.fix } : null,
      })
    );
  });
  const header = JSON.stringify({ date: day, rowsToRead: lines.length, yesterday, reportsWithoutRow });
  writeAtomically(path.join(reviewDir, `${day}.jsonl`), `${header}\n${lines.join("\n")}\n`);
  writeAtomically(path.join(dir, `${day}-sent.json`), `${JSON.stringify(sent)}\n`);
  if (!memory.pendingDays.includes(day)) memory.pendingDays.push(day);
  writeMemory(memoryFile, memory);

  const count = (why: string) => selected.filter((r) => r.why === why).length;
  console.log(
    `${day}: ${rows.length} rows on the site; to read today ${selected.length}: changed ${count("changed")}, first reading ${count("first reading")}, new ${count("new row")}, ` +
      `read again ${count("read again")}, visitor reports ${count("visitor report")}; never read and still waiting ${rows.filter((r) => !memory.rows[r.id]).length - count("first reading") - count("new row")}`
  );
  console.log(alerts.length > 0 ? `${alerts.length} alert(s), each on its own line above` : "no alerts");
}

main().finally(() => prisma.$disconnect());
