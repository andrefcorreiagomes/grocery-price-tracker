/**
 * The rules of the daily AI review of the site's comparisons (the owner's plan,
 * 6 November 2026; ai-review-plan.md in the private notes). The AI reads every
 * row once, then every row that changed in any way, plus 75 rows read again.
 *
 * Pure, for the checks: the database and the files are handled by
 * src/scripts/comparison-review.ts.
 */

/** One store's product in a row, as the AI reads it. Any difference here is a change. */
export interface StoreEntry {
  store: string;
  id: string;
  name: string;
  brand: string | null;
  size: number | null;
  unit: string | null;
  price: number | null;
  perUnit: number | null;
  promotion: boolean | null;
  regularPrice: number | null;
  promoEndsAt: string | null;
  shelf: string | null;
  barcode: string | null;
  url: string | null;
}

export interface ReviewRow {
  id: string;
  foodType: string;
  foodLabel: string;
  comparison: string;
  /** the comparison's key, which a visitor's report names */
  comparisonKey: string;
  rowType: "cheapest" | "own brand" | "same product";
  stores: StoreEntry[];
  flags: string[];
}

export const QUESTIONS = ["sameProduct", "priceFitsPack", "moveExplained", "likeWithLike"] as const;
export type Question = (typeof QUESTIONS)[number];
export const VERDICTS = ["fine", "problem", "needs_page"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const MISSING = ["store page", "price history", "other"] as const;
export type Missing = (typeof MISSING)[number];

export interface Answer {
  rowId: string;
  verdict: Verdict;
  questions: Record<Question, { answer: string; evidence: string }>;
  cause?: string;
  evidence?: string;
  fix?: string;
  sure?: "sure" | "likely" | "unsure";
  /** its number in that day's list for the owner, when the verdict is a problem */
  proposal?: number;
  /** what to look at, when the verdict is needs_page */
  pageToCheck?: string;
  /** what would have settled it, when the verdict is needs_page: counted, to choose later what the AI gets (the owner, 8 November 2026) */
  missing?: Missing;
  /** the answer to a visitor's report on this row */
  reportAnswer?: string;
}

export interface VisitorReport {
  at: string;
  foodType: string;
  comparison: string;
  store: string;
  reason: string;
  comment: string;
}

export interface OwnerAnswer {
  answer: "yes" | "no";
  on: string;
  /** the products, names and sizes it was given for: a refusal lasts until these change */
  identity: string;
  cause?: string;
  fix?: string;
}

export interface MemoryRow {
  /** the row's contents when the AI judged it */
  contents: StoreEntry[];
  /** the date of that reading */
  readOn: string;
  conclusion: Pick<Answer, "verdict" | "cause" | "evidence" | "fix" | "sure" | "pageToCheck" | "missing">;
  /** the round of re-reading in which this row last had its turn */
  rereadRound: number;
  owner?: OwnerAnswer;
}

export interface DayStats {
  date: string;
  sent: number;
  answered: number;
  rejected: number;
  problems: number;
  needsPage: number;
  /** of those, what would have settled each */
  needsPageMissing: Record<Missing, number>;
  rereadsAnswered: number;
  rereadsDisagreeing: number;
  /** answers refused for going over a size limit (also counted in rejected) */
  overLimit: number;
  /** the whole answer file refused for its size, in bytes; its rows stay unread */
  fileRefusedBytes?: number;
  /** the size of that day's reading list and of the AI's answers (the owner, 9 November 2026) */
  listBytes?: number;
  answersBytes?: number;
}

/**
 * Characters per token, to estimate what the AI read and wrote. An assumption
 * (8.25): about right for Portuguese names inside JSON. The estimate also
 * undercounts the real usage, since the AI re-reads part of its work as it goes.
 */
export const CHARS_PER_TOKEN = 3.5;
export const estimatedTokens = (bytes: number | undefined) => (bytes === undefined ? null : Math.round(bytes / CHARS_PER_TOKEN));

/** The columns the Claude on MSI fills in by hand, kept when the table is written again. */
export type MeasuredByHand = { minutes: string; meter: string };

const USAGE_HEADER = [
  "# The AI review's daily usage",
  "",
  "Written by the server's program each morning from the day's figures (do not",
  "edit the other columns by hand). Tokens are ESTIMATES: characters / 3.5, and",
  "they undercount, since the AI re-reads part of its work. The last two columns",
  "are filled by the Claude on MSI or the home PC, from the run's log (minutes) and",
  "the plan meter before and after the run (weekly %), when a session was open.",
  "",
  "| Day | Rows sent | Answered | Refused | List KB | Answers KB | Tokens read (est.) | Tokens written (est.) | Minutes | Weekly meter change |",
  "|---|---|---|---|---|---|---|---|---|---|",
];

/** What the Claude on MSI wrote in the last two columns, by day. */
export function readMeasuredByHand(table: string): Map<string, MeasuredByHand> {
  const kept = new Map<string, MeasuredByHand>();
  for (const line of table.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    // | day | ... 8 more ... | minutes | meter |  ->  ["", day, ..., minutes, meter, ""]
    if (cells.length === 12 && /^\d{4}-\d{2}-\d{2}$/.test(cells[1])) kept.set(cells[1], { minutes: cells[9], meter: cells[10] });
  }
  return kept;
}

/** The whole table, one line per day taken in, oldest first. */
export function usageTable(days: DayStats[], kept: Map<string, MeasuredByHand>): string {
  const kb = (b: number | undefined) => (b === undefined ? "" : (b / 1000).toFixed(0));
  const n = (v: number | null) => (v === null ? "" : v.toLocaleString("en-GB"));
  const lines = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const k = kept.get(d.date);
      return `| ${d.date} | ${d.sent} | ${d.answered} | ${d.rejected} | ${kb(d.listBytes)} | ${kb(d.answersBytes)} | ${n(estimatedTokens(d.listBytes))} | ${n(estimatedTokens(d.answersBytes))} | ${k?.minutes ?? ""} | ${k?.meter ?? ""} |`;
    });
  return `${[...USAGE_HEADER, ...lines].join("\n")}\n`;
}

/** A day whose estimated tokens are more than twice the median of the days before it (at least 3 of them). */
export function unusualUsage(days: DayStats[], date: string): boolean {
  const total = (d: DayStats) => (estimatedTokens(d.listBytes) ?? 0) + (estimatedTokens(d.answersBytes) ?? 0);
  const today = days.find((d) => d.date === date);
  const before = days.filter((d) => d.date < date && d.listBytes !== undefined).map(total).sort((a, b) => a - b);
  if (!today || before.length < 3) return false;
  const mid = before.length % 2 ? before[(before.length - 1) / 2] : (before[before.length / 2 - 1] + before[before.length / 2]) / 2;
  return total(today) > 2 * mid;
}

export interface Memory {
  version: 1;
  firstReadingDone: boolean;
  rereadRound: number;
  /** the newest visitor's report already taken in */
  reportsUpTo: string;
  /** reports not yet answered: they go out again until they are */
  pendingReports: VisitorReport[];
  /** days whose file went out and whose answers have not been taken in */
  pendingDays: string[];
  days: DayStats[];
  rows: Record<string, MemoryRow>;
}

export function emptyMemory(): Memory {
  return { version: 1, firstReadingDone: false, rereadRound: 1, reportsUpTo: "", pendingReports: [], pendingDays: [], days: [], rows: {} };
}

/** How many rows never read go out per day during the first reading. */
export const FIRST_READING_PACE = 300;
export const REREADS_PER_DAY = 75;
/** A row read in the last 2 days cannot be read again: read Monday, not again until Thursday (the owner's rule). */
export const REREAD_MIN_DAYS = 3;

const FIELDS: (keyof StoreEntry)[] = ["id", "name", "brand", "size", "unit", "price", "perUnit", "promotion", "regularPrice", "promoEndsAt", "shelf", "barcode", "url"];

export interface Change {
  store: string;
  field: string;
  before: unknown;
  after: unknown;
}

/** Everything that differs between what the AI last read and today. Empty when nothing does. */
export function changesBetween(before: StoreEntry[], after: StoreEntry[]): Change[] {
  const out: Change[] = [];
  const stores = [...new Set([...before, ...after].map((s) => s.store))].sort();
  for (const store of stores) {
    const a = before.find((s) => s.store === store);
    const b = after.find((s) => s.store === store);
    if (!a || !b) {
      out.push({ store, field: "in the row", before: a ? a.name : null, after: b ? b.name : null });
      continue;
    }
    for (const field of FIELDS) if (a[field] !== b[field]) out.push({ store, field, before: a[field], after: b[field] });
  }
  return out;
}

/** The products, names and sizes of a row, without their prices: what a refused proposal is tied to. */
export function identityOf(stores: StoreEntry[]): string {
  return [...stores].sort((a, b) => a.store.localeCompare(b.store)).map((s) => `${s.store}:${s.id}:${s.name}:${s.size}:${s.unit}`).join("~");
}

/** Whole days from one date to a later one, both "YYYY-MM-DD". */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type Why = "first reading" | "new row" | "changed" | "read again" | "visitor report";

export interface Selected {
  row: ReviewRow;
  why: Why;
  changes: Change[];
}

/**
 * The day's reading list. Every changed row, always; rows never read, at most
 * FIRST_READING_PACE a day until the first reading is done, then all of them;
 * every row with an unanswered visitor's report; and REREADS_PER_DAY rows read
 * again, once the first reading is done, from rows unchanged and not read in
 * the last 2 days, a row not drawn again until the others have had their turn.
 *
 * Changes `memory.firstReadingDone` and `memory.rereadRound`. `order` gives
 * rows never read a fixed order, so unanswered ones come first again the next
 * day; `pick` draws at random.
 */
export function selectRows(
  rows: ReviewRow[],
  memory: Memory,
  today: string,
  order: (rowId: string) => string,
  pick: (limit: number) => number
): Selected[] {
  const out: Selected[] = [];
  const taken = new Set<string>();
  const take = (row: ReviewRow, why: Why, changes: Change[] = []) => {
    if (taken.has(row.id)) return;
    taken.add(row.id);
    out.push({ row, why, changes });
  };

  const unread: ReviewRow[] = [];
  for (const row of rows) {
    const known = memory.rows[row.id];
    if (!known) {
      unread.push(row);
      continue;
    }
    const changes = changesBetween(known.contents, row.stores);
    if (changes.length > 0) take(row, "changed", changes);
  }

  const reported = new Set(memory.pendingReports.map((r) => `${r.foodType}|${r.comparison}`));
  for (const row of rows) if (reported.has(`${row.foodType}|${row.comparisonKey}`) && row.rowType !== "own brand") take(row, "visitor report");

  // Re-reading starts the day after the last rows of the first reading went out.
  const mayReread = memory.firstReadingDone;
  // The rows that look odd first (the owner, 13 November 2026), so likely
  // problems come out on the first days rather than spread over the week;
  // then the fixed order.
  const sorted = [...unread].sort((a, b) => Number(looksOdd(b)) - Number(looksOdd(a)) || order(a.id).localeCompare(order(b.id)));
  if (!memory.firstReadingDone && sorted.length <= FIRST_READING_PACE) memory.firstReadingDone = true;
  for (const row of memory.firstReadingDone ? sorted : sorted.slice(0, FIRST_READING_PACE)) take(row, mayReread ? "new row" : "first reading");

  if (mayReread) {
    const eligible = rows.filter((r) => {
      const known = memory.rows[r.id];
      return known && !taken.has(r.id) && daysBetween(known.readOn, today) >= REREAD_MIN_DAYS;
    });
    const draw = (pool: ReviewRow[], count: number) => {
      const left = [...pool];
      for (let i = 0; i < count && left.length > 0; i++) {
        take(left.splice(pick(left.length), 1)[0], "read again");
      }
    };
    const thisRound = eligible.filter((r) => memory.rows[r.id].rereadRound < memory.rereadRound);
    draw(thisRound, REREADS_PER_DAY);
    const short = REREADS_PER_DAY - Math.min(REREADS_PER_DAY, thisRound.length);
    const waiting = rows.filter((r) => {
      const known = memory.rows[r.id];
      return known && !taken.has(r.id) && known.rereadRound < memory.rereadRound;
    });
    if (short > 0 && waiting.length === 0 && eligible.length > thisRound.length) {
      // Every row has had its turn: a new round, for the rows still short.
      memory.rereadRound++;
      draw(eligible.filter((r) => !taken.has(r.id)), short);
    }
  }
  return out;
}

const filled = (v: unknown) => typeof v === "string" && v.trim().length >= 2;

/**
 * Limits on what comes back from the AI's repository (the owner, 9 November
 * 2026). An honest day is far below them: about 2 MB of answers on the heaviest
 * day, a few hundred characters per field. Going over them most likely means
 * someone is trying to disrupt the review (a visitor's message written to make
 * the AI write without end, or someone writing in that repository), so the
 * program refuses the excess and raises an alarm for the owner.
 */
export const MAX_ANSWERS_BYTES = 10_000_000;
/** Any single text in an answer; a visitor's comment is at most 500 characters. */
export const MAX_FIELD_CHARS = 2_000;
/** One whole answer. */
export const MAX_ANSWER_CHARS = 20_000;
/** More answer lines than this, for the rows sent, is an alarm too. */
export const maxAnswerLines = (sent: number) => 2 * sent + 20;

/** Whether an answer goes over a limit: too long as a whole, or any text in it. */
export function overLimit(a: unknown): boolean {
  let whole: string;
  try {
    whole = JSON.stringify(a) ?? "";
  } catch {
    return true;
  }
  if (whole.length > MAX_ANSWER_CHARS) return true;
  const walk = (v: unknown): boolean =>
    typeof v === "string" ? v.length > MAX_FIELD_CHARS : v !== null && typeof v === "object" ? Object.values(v).some(walk) : false;
  return walk(a);
}

/**
 * Why an answer cannot be accepted, or null when it can. "Fine" alone is not an
 * answer: every fixed question needs an answer and the data it relied on.
 */
export function answerProblem(a: Answer, hasReport: boolean): string | null {
  if (!(VERDICTS as readonly string[]).includes(a?.verdict)) return "no verdict";
  for (const q of QUESTIONS) {
    if (!filled(a.questions?.[q]?.answer) || !filled(a.questions?.[q]?.evidence)) return `question ${q} not answered with evidence`;
  }
  if (a.verdict === "problem") {
    if (!filled(a.cause) || !filled(a.evidence) || !filled(a.fix)) return "a problem needs its cause, evidence and fix";
    if (!["sure", "likely", "unsure"].includes(a.sure as string)) return "a problem needs how sure it is";
    if (!Number.isInteger(a.proposal)) return "a problem needs its number in the owner's list";
  }
  if (a.verdict === "needs_page" && !filled(a.pageToCheck)) return "needs_page must say what to look at";
  if (a.verdict === "needs_page" && !(MISSING as readonly string[]).includes(a.missing as string)) return "needs_page must say what would settle it";
  if (hasReport && !filled(a.reportAnswer)) return "the visitor's report was not answered";
  return null;
}

/** What the day's file holds for each row, as far as taking in the answers needs. */
export interface SentRow {
  row: ReviewRow;
  why: Why;
  reports?: VisitorReport[];
}

/**
 * Take in one day's answers. An accepted answer becomes the row's entry in the
 * memory; a rejected or missing one leaves the row unread, so it goes out again.
 * Never moves a row back: answers older than its last reading are ignored.
 */
export function takeInAnswers(memory: Memory, date: string, sent: SentRow[], answers: Answer[]): DayStats {
  const byId = new Map(sent.map((s) => [s.row.id, s]));
  const stats: DayStats = {
    date, sent: sent.length, answered: 0, rejected: 0, problems: 0, needsPage: 0,
    needsPageMissing: { "store page": 0, "price history": 0, other: 0 }, rereadsAnswered: 0, rereadsDisagreeing: 0, overLimit: 0,
  };
  const answeredReports = new Set<string>();
  for (const a of answers) {
    if (overLimit(a)) {
      stats.overLimit++;
      stats.rejected++;
      continue;
    }
    const s = byId.get(a?.rowId);
    if (!s) {
      stats.rejected++;
      continue;
    }
    if (answerProblem(a, (s.reports?.length ?? 0) > 0) !== null) {
      stats.rejected++;
      continue;
    }
    stats.answered++;
    if (a.verdict === "problem") stats.problems++;
    if (a.verdict === "needs_page") {
      stats.needsPage++;
      stats.needsPageMissing[a.missing as Missing]++;
    }
    for (const r of s.reports ?? []) answeredReports.add(r.at);
    const known = memory.rows[a.rowId];
    if (s.why === "read again" && known) {
      stats.rereadsAnswered++;
      if (known.conclusion.verdict !== a.verdict) stats.rereadsDisagreeing++;
    }
    if (known && known.readOn > date) continue;
    const identity = identityOf(s.row.stores);
    memory.rows[a.rowId] = {
      contents: s.row.stores,
      readOn: date,
      conclusion: { verdict: a.verdict, cause: a.cause, evidence: a.evidence, fix: a.fix, sure: a.sure, pageToCheck: a.pageToCheck, missing: a.missing },
      // A row's first reading is not a turn of re-reading; any later reading is.
      rereadRound: s.why === "first reading" || s.why === "new row" ? 0 : memory.rereadRound,
      ...(known?.owner?.identity === identity ? { owner: known.owner } : {}),
    };
  }
  memory.pendingReports = memory.pendingReports.filter((r) => !answeredReports.has(r.at));
  return stats;
}

/** Numbers like "1-12,15" from the owner's answer. */
export function parseProposalNumbers(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`not a list of numbers: ${part}`);
    const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (to < from || to - from > 5000) throw new Error(`not a range of numbers: ${part}`);
    for (let n = from; n <= to; n++) out.push(n);
  }
  return out;
}

/** The biggest price per unit in a row against the smallest, for the facts. */
/** The dearest store at more than this many times the cheapest per unit makes a row look odd. */
export const ODD_GAP = 3;

/**
 * A row that looks odd to the program's own tests: an automatic check flagged
 * it, or the dearest store costs more than ODD_GAP times the cheapest per
 * unit. 452 of the 1,786 rows on 12 November 2026. Read first in the first
 * reading (the owner, 13 November 2026).
 */
export function looksOdd(row: ReviewRow): boolean {
  const gap = gapOf(row.stores);
  return row.flags.length > 0 || (gap !== null && gap > ODD_GAP);
}

export function gapOf(stores: StoreEntry[]): number | null {
  const prices = stores.map((s) => s.perUnit).filter((p): p is number => p !== null && p > 0);
  if (prices.length < 2) return null;
  return Math.round((Math.max(...prices) / Math.min(...prices)) * 100) / 100;
}

export interface StoreFacts {
  store: string;
  /** price divided by size, worked out here, to compare with the price per unit shown */
  perUnitRecalculated: number | null;
  /** percent change of the pack price since the AI last read this row, same product only */
  priceChangePercent: number | null;
  promotion: "started" | "ended" | "on" | "off" | "unknown";
  historyLowest: number | null;
  historyHighest: number | null;
}

/** The facts the AI answers with, worked out by the program. Pure. */
export function factsFor(
  entry: StoreEntry,
  before: StoreEntry | undefined,
  history: { low: number | null; high: number | null } | undefined
): StoreFacts {
  const same = before && before.id === entry.id ? before : undefined;
  const recalculated = entry.price !== null && entry.size !== null && entry.size > 0 ? Math.round((entry.price / entry.size) * 100) / 100 : null;
  const change =
    same && same.price !== null && same.price > 0 && entry.price !== null
      ? Math.round(((entry.price - same.price) / same.price) * 1000) / 10
      : null;
  const promotion =
    entry.promotion === null
      ? "unknown"
      : same && same.promotion !== entry.promotion
        ? entry.promotion
          ? "started"
          : "ended"
        : entry.promotion
          ? "on"
          : "off";
  return { store: entry.store, perUnitRecalculated: recalculated, priceChangePercent: change, promotion, historyLowest: history?.low ?? null, historyHighest: history?.high ?? null };
}
