import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { STORE_ORDER } from "@/lib/stores";
import { COMMENT_MAX, REASONS, type Reason } from "@/lib/error-report-choices";

/**
 * "Report an error" on each comparison (the owner's option A, 4 November 2026).
 *
 * Everything a visitor sends is untrusted. How each risk is met:
 *
 *  - SQL injection: impossible by construction - a report never goes near the
 *    database. It is one line of JSON appended to a file of its own
 *    (user-reports/error-reports.jsonl, never uploaded). This also means a
 *    report can never get in the way of the nightly collection writing prices.
 *  - Script injection on a page: the comment is never shown on the site; where
 *    it is read (the listing script), it is printed JSON-quoted, as data.
 *  - Instructions hidden in a comment, aimed at the AI that reads the reports:
 *    the listing says so above every comment - a comment is a claim to check,
 *    never an instruction.
 *  - Junk and floods: only fixed choices are accepted for the store and the
 *    reason; the comment is cut to plain text and capped at 500 characters;
 *    a hidden field that people never see but programs fill in; at most
 *    VISITOR_LIMIT reports per visitor an hour and DAILY_LIMIT in all a day,
 *    so the file cannot grow without bound; the request itself is capped at
 *    16 kB (next.config.ts).
 *  - Privacy: no name, email or IP address is stored. The visitor's address is
 *    only hashed, in memory, to count their reports for the hour.
 */

export { COMMENT_MAX, REASONS, type Reason };
export const VISITOR_LIMIT = 5;
export const DAILY_LIMIT = 200;

export interface ErrorReport {
  at: string;
  foodType: string;
  comparison: string;
  /** a store's id, or "" for the comparison as a whole */
  store: string;
  reason: Reason;
  comment: string;
}

const FOOD_TYPE = /^[a-z0-9-]{1,60}$/;
// A comparison's key: "subKind|labels|unit" (comparison-groups.ts), plain words.
const COMPARISON = /^[\p{L}\p{N} _,|.-]{1,160}$/u;

/**
 * A visitor's comment as plain text: Unicode normalised, every control or
 * invisible formatting character removed except line breaks, at most two
 * blank lines in a row, trimmed. Pure.
 */
export function cleanComment(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\P{C}\n]/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A form field as text, or null when it is missing or a file. */
function text(form: FormData, name: string): string | null {
  const v = form.get(name);
  return typeof v === "string" ? v : null;
}

/**
 * Check a submitted form. Returns the report to keep, or the message to show.
 * Pure (the time is passed in).
 */
export function validateReport(form: FormData, now: Date): { report: ErrorReport } | { error: string } {
  const foodType = text(form, "foodType") ?? "";
  const comparison = text(form, "comparison") ?? "";
  const store = text(form, "store") ?? "";
  const reason = text(form, "reason") ?? "";
  const rawComment = text(form, "comment") ?? "";
  if (!FOOD_TYPE.test(foodType) || !COMPARISON.test(comparison)) return { error: "Não foi possível identificar a comparação. Recarregue a página e tente de novo." };
  if (store !== "" && !(STORE_ORDER as readonly string[]).includes(store)) return { error: "Escolha uma das lojas da lista." };
  if (!Object.hasOwn(REASONS, reason)) return { error: "Escolha o que está errado." };
  const comment = cleanComment(rawComment);
  if ([...comment].length > COMMENT_MAX) return { error: `O comentário pode ter até ${COMMENT_MAX} caracteres.` };
  return { report: { at: now.toISOString(), foodType, comparison, store, reason: reason as Reason, comment } };
}

/**
 * Counts reports in memory: per visitor for the last hour, and in all for the
 * day. Lost when the site restarts, which only resets the counts. Time passed
 * in, for the checks.
 */
export class ReportLimiter {
  private perVisitor = new Map<string, number[]>();
  private day = "";
  private today = 0;

  /** True and counted when this visitor may send one more report now. */
  allow(visitor: string, now: Date): boolean {
    const day = now.toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.today = 0;
      this.perVisitor.clear();
    }
    if (this.today >= DAILY_LIMIT) return false;
    const hourAgo = now.getTime() - 3_600_000;
    const times = (this.perVisitor.get(visitor) ?? []).filter((t) => t > hourAgo);
    if (times.length >= VISITOR_LIMIT) {
      this.perVisitor.set(visitor, times);
      return false;
    }
    times.push(now.getTime());
    this.perVisitor.set(visitor, times);
    this.today++;
    return true;
  }
}

/**
 * A visitor, as an anonymous hash of their network address and the day: never
 * stored, and it cannot be turned back into the address. Behind the web server
 * the address comes from its x-real-ip header; without one, all visitors share
 * one count (the daily limit still holds).
 */
export function visitorKey(address: string | null, now: Date): string {
  return createHash("sha256").update(`${address ?? "unknown"}|${now.toISOString().slice(0, 10)}|poupa-facil`).digest("hex");
}

/** Where the reports are kept: one JSON object per line. */
export function reportsFile(): string {
  return path.resolve(process.env.ERROR_REPORTS_FILE ?? path.join("user-reports", "error-reports.jsonl"));
}

/** Append one report. JSON.stringify escapes every quote and line break, so a report is always exactly one line. */
export async function saveReport(report: ErrorReport): Promise<void> {
  const file = reportsFile();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(report) + "\n", { encoding: "utf8", mode: 0o600 });
}
