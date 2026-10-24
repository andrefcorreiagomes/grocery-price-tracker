import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * One collection at a time (24 October 2026).
 *
 * On the night of 23-24 October two nightly runs started at 00:05 on MSI: one
 * scheduled at 16:30 and forgotten when the computer was not, after all,
 * switched off, and the one scheduled at 21:15. Each store was collected twice,
 * at twice the pace, the two runs wrote into the same log files, and five
 * prices were saved twice. So a run now takes this lock when it starts and
 * gives it back when it ends; a second run that finds the lock held by a
 * program still running refuses to start.
 *
 * The lock is a file holding the holder's process number. A lock left by a
 * program that no longer exists (a crash, a power cut) is taken over.
 */
export const LOCK_FILE = path.join("logs", "collection.lock");

function running(pid: number): boolean {
  try {
    process.kill(pid, 0); // asks the system whether the process exists; sends nothing
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Who holds the lock, if a program still running does; null otherwise. */
export function lockHolder(file = LOCK_FILE): { pid: number; what: string; since: string } | null {
  if (!existsSync(file)) return null;
  try {
    const held = JSON.parse(readFileSync(file, "utf8"));
    return typeof held.pid === "number" && running(held.pid) ? held : null;
  } catch {
    return null;
  }
}

/** Take the lock, or refuse with the reason. */
export function takeLock(what: string, file = LOCK_FILE): void {
  const holder = lockHolder(file);
  if (holder && holder.pid !== process.pid) {
    throw new Error(
      `another collection is running: ${holder.what} (process ${holder.pid}, since ${holder.since}); ` +
        `two at once would ask the stores twice and write the same products twice`
    );
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ pid: process.pid, what, since: new Date().toISOString() }));
  // Given back however the program ends.
  process.once("exit", () => releaseLock(file));
}

/** Give the lock back, if this program holds it. */
export function releaseLock(file = LOCK_FILE): void {
  try {
    const held = JSON.parse(readFileSync(file, "utf8"));
    if (held.pid === process.pid) rmSync(file);
  } catch {
    // no lock, or not ours: nothing to give back
  }
}
