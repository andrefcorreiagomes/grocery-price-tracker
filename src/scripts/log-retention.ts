import { readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

/**
 * How long the nightly keeps what it writes in logs/ (code review L8, the
 * user's choice of 22 October 2026): 90 days. Logs are detail, read when a
 * night went wrong; the reports in reports/ are the project's history, small,
 * and kept for good. Backups keep their own 7.
 */
export const LOG_KEEP_DAYS = 90;

/**
 * The saved robots.txt copies are never removed, however old: the nightly
 * compares each store's rules against its newest copy, and a store whose rules
 * have not changed in 90 days would otherwise lose its copy and be skipped.
 */
const KEPT_FOR_GOOD = /^robots-/;

/** Which entries of logs/ are older than the limit. Pure, for the checks. */
export function logsToPrune(entries: { name: string; modified: Date }[], now: Date): string[] {
  const limit = now.getTime() - LOG_KEEP_DAYS * 86_400_000;
  return entries.filter((e) => !KEPT_FOR_GOOD.test(e.name) && e.modified.getTime() < limit).map((e) => e.name);
}

/** Remove them; returns their names. A folder (a night's logs) goes whole. */
export function pruneLogs(dir = "logs", now = new Date()): string[] {
  const entries = readdirSync(dir).map((name) => ({ name, modified: statSync(path.join(dir, name)).mtime }));
  const old = logsToPrune(entries, now);
  for (const name of old) rmSync(path.join(dir, name), { recursive: true, force: true });
  return old;
}
