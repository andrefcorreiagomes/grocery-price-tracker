import "dotenv/config";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../lib/db";
import { fetchPage, requireCrawlerContact } from "../scrapers/http";
import { LOG_KEEP_DAYS, pruneLogs } from "./log-retention";
import { takeLock } from "./run-lock";

/**
 * The whole night in one command: the three crawls, then everything that
 * follows them, then a summary of the night in plain words.
 *
 *   npm run nightly                 the real thing: requests to all three stores
 *   npm run nightly -- --plan       print what would run, change nothing
 *   npm run nightly -- --no-crawl   everything except the robots check and the
 *                                   crawls: no request to any store
 *   npm run nightly -- --together   the three crawls at the same time
 *
 * Written 20 October 2026, to move the nightly work from MSI to a machine that
 * runs it unattended (first the old laptop, then a rented server).
 *
 * In order:
 *   1. checks: this machine is the one named in NIGHTLY_HOST (the database has
 *      ONE real copy, and only that machine writes it); CRAWLER_CONTACT is set
 *   2. robots.txt of each store, compared with the last saved copy in data/.
 *      A store whose robots.txt changed is NOT crawled tonight: the new file
 *      is saved, and the summary says so - a person reads it first.
 *   3. the crawls, one after another (the user's choice, 20 October 2026).
 *      --together runs them at the same time: on 18-19 October two crawls
 *      ran together on the real database with no problem, after a stress test
 *      of three writers and a reader on a copy (1,682 saves, 0 errors).
 *   4. pack sizes, classification, the review count, the automatic checks
 *      (verify:nightly, which includes the verified-kinds list) and the
 *      comparison check
 *   5. a consistent backup of the database into backups/, keeping the last 7
 *   6. logs/nightly-<date>/summary.md, plus each step's full output beside it
 *
 * Exits non-zero when any step failed, so a scheduler can tell.
 */

const args = new Set(process.argv.slice(2));
const plan = args.has("--plan");
const noCrawl = args.has("--no-crawl");
const together = args.has("--together");

const STORES = [
  { id: "AUCHAN", name: "Auchan", file: "auchan", robots: "https://www.auchan.pt/robots.txt", script: "crawl:auchan:nightly" },
  { id: "PINGO_DOCE", name: "Pingo Doce", file: "pingodoce", robots: "https://www.pingodoce.pt/robots.txt", script: "crawl:pingodoce:nightly" },
  { id: "CONTINENTE", name: "Continente", file: "continente", robots: "https://www.continente.pt/robots.txt", script: "crawl:continente:nightly" },
];

/**
 * The steps after the crawls, in this order. All offline but one:
 * `barcodes:auchan` reads a few Auchan product pages, so it runs only on a
 * night Auchan itself was crawled (its robots.txt checked and unchanged).
 *
 * Matching runs every night since 22 October 2026 (the user's decision, code
 * review finding H6): candidates, then the matcher, then the barcodes of Auchan
 * products in groups not yet confirmed, then the matcher again so those
 * barcodes count tonight rather than tomorrow.
 */
const AFTER: { script: string; what: string; log?: string; needs?: string }[] = [
  { script: "backfill:sizes", what: "pack sizes filled in" },
  { script: "classify:food", what: "kinds of food written" },
  { script: "candidates", what: "match candidates rebuilt" },
  { script: "match", what: "identical products grouped", log: "match-1" },
  { script: "barcodes:auchan", what: "Auchan barcodes read", needs: "AUCHAN" },
  { script: "match", what: "identical products grouped again, with the new barcodes", log: "match-2" },
  { script: "review:kinds", what: "uncertain kinds counted" },
  { script: "verify:nightly", what: "automatic checks, including the verified kinds" },
  { script: "validate:comparisons", what: "comparison check" },
];

const KEEP_BACKUPS = 7;

interface StepResult {
  name: string;
  ok: boolean;
  minutes: number;
  note: string;
  log?: string;
}

// Local time (Portugal), not UTC: the folder name is the hour the run started on the clock.
const day = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}`;
})();
const dir = path.join("logs", `nightly-${day}`);

/** Run an npm script, its output into its own log; resolves with the exit code. */
function run(script: string, logName: string, extra: string[] = []): Promise<{ code: number; log: string; minutes: number }> {
  const log = path.join(dir, `${logName}.log`);
  const out = createWriteStream(log);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(["npm run", script, ...(extra.length ? ["--", ...extra] : [])].join(" "), { shell: true });
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    child.on("close", (code) => {
      out.end();
      resolve({ code: code ?? 1, log, minutes: (Date.now() - started) / 60000 });
    });
  });
}

/**
 * Where the saved copies of the stores' robots.txt live: data/, which git
 * keeps, so another computer starts with them. Until 22 October 2026 they were
 * in logs/, which git does not keep, and on a new computer the first night
 * would have found no copy and crawled no store (code review L7).
 */
const ROBOTS_DIR = "data";

/** The last saved copy of a store's robots.txt, or null. */
function lastRobots(file: string): string | null {
  const saved = readdirSync(ROBOTS_DIR).filter((f) => f.startsWith("robots-") && f.endsWith(`-${file}.txt`)).sort();
  return saved.length ? readFileSync(path.join(ROBOTS_DIR, saved[saved.length - 1]), "utf8") : null;
}

const norm = (s: string) => s.replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).join("\n").trim();

/**
 * What a crawl's output says about itself: its report's verdict (**OK**,
 * **WARN**, **FAIL**) if it writes one, how long it took, its promotion count
 * (promo-watch.ts) and any promotion warning, which each crawl also prints as
 * a plain "WARN:" line in its output.
 */
function verdictOf(log: string): string {
  const text = readFileSync(log, "utf8");
  const v = text.match(/^\*\*(OK|WARN|FAIL)\*\*/m)?.[1];
  const done = text.match(/Done in [\d.]+ min/)?.[0];
  const promotions = text.match(/^promotions: .*$/m)?.[0];
  const warn = text.match(/^WARN: .*$/m)?.[0];
  return [v ? `report ${v}` : null, done, promotions, warn].filter(Boolean).join("; ");
}

async function backup(): Promise<string> {
  mkdirSync("backups", { recursive: true });
  const target = path.join("backups", `nightly-${day}.db`);
  // SQLite writes a consistent, compacted copy itself, even if something else were reading.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const old = readdirSync("backups").filter((f) => f.startsWith("nightly-") && f.endsWith(".db")).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) rmSync(path.join("backups", f));
  return target;
}

async function main() {
  const steps: StepResult[] = [];
  const host = os.hostname();
  const allowed = process.env.NIGHTLY_HOST?.trim();

  if (plan) {
    console.log(
      allowed && allowed.toLowerCase() === host.toLowerCase()
        ? `would run on ${host} (NIGHTLY_HOST=${allowed})`
        : `would REFUSE to run on ${host}: NIGHTLY_HOST is ${allowed ?? "not set"}, the only machine that writes the database`
    );
    if (!noCrawl) console.log(`robots.txt check: ${STORES.map((s) => s.robots).join(", ")}`);
    if (!noCrawl) console.log(`crawls ${together ? "at the same time" : "one after another"}: ${STORES.map((s) => s.script).join(", ")}`);
    console.log(`then: ${AFTER.map((a) => a.script).join(", ")}, a backup, and ${dir}/summary.md`);
    return;
  }

  // 1. checks --------------------------------------------------------------
  if (!allowed) throw new Error("NIGHTLY_HOST is not set in .env: name the one machine that writes the database");
  if (allowed.toLowerCase() !== host.toLowerCase()) {
    throw new Error(`this is ${host}, but NIGHTLY_HOST is ${allowed}: the nightly run only writes the database on that machine`);
  }
  requireCrawlerContact();
  // One collection at a time (run-lock.ts): refuses if another run is going.
  takeLock(`npm run nightly (${day})`);
  mkdirSync(dir, { recursive: true });
  const started = Date.now();

  // 2. robots.txt ----------------------------------------------------------
  const toCrawl: typeof STORES = [];
  if (!noCrawl) {
    for (const s of STORES) {
      try {
        const now = (await fetchPage(s.robots)).html;
        const before = lastRobots(s.file);
        if (before !== null && norm(before) === norm(now)) {
          toCrawl.push(s);
          steps.push({ name: `${s.name} robots.txt`, ok: true, minutes: 0, note: "unchanged" });
        } else {
          writeFileSync(path.join(ROBOTS_DIR, `robots-${day.slice(0, 10)}-${s.file}.txt`), now);
          steps.push({ name: `${s.name} robots.txt`, ok: false, minutes: 0,
            note: before === null ? "no earlier copy to compare - saved this one, not crawled tonight" : "CHANGED - new copy saved; not crawled tonight until a person reads it" });
        }
      } catch (e) {
        steps.push({ name: `${s.name} robots.txt`, ok: false, minutes: 0, note: `could not be read (${(e as Error).message}) - not crawled tonight` });
      }
    }
  }

  // 3. crawls --------------------------------------------------------------
  const crawl = async (s: (typeof STORES)[number]) => {
    const r = await run(s.script, s.file);
    steps.push({ name: `${s.name} crawl`, ok: r.code === 0, minutes: r.minutes, note: verdictOf(r.log) || `exit ${r.code}`, log: r.log });
  };
  if (together) await Promise.all(toCrawl.map(crawl));
  else for (const s of toCrawl) await crawl(s);

  // 4. after the crawls ----------------------------------------------------
  for (const a of AFTER) {
    if (a.needs && !toCrawl.some((s) => s.id === a.needs)) {
      steps.push({ name: a.script, ok: true, minutes: 0, note: `skipped: ${a.needs} was not crawled tonight` });
      continue;
    }
    const r = await run(a.script, a.log ?? a.script.replace(":", "-"));
    let note = a.what;
    if (a.script === "match") {
      const built = readFileSync(r.log, "utf8").match(/3\. group: ([\d,]+) group/)?.[1];
      if (built) note = `${built} groups of identical products (${a.log === "match-2" ? "after the barcodes" : "first pass"})`;
    }
    if (a.script === "barcodes:auchan") {
      note = readFileSync(r.log, "utf8").match(/^barcodes: .*$/m)?.[0] ?? a.what;
    }
    if (a.script === "review:kinds") {
      const text = readFileSync(r.log, "utf8");
      const review = text.match(/^review\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m);
      const visible = text.match(/in kinds shown on the site: \d+ \((\d+) products\)/);
      if (review) note = `${review[4]} products uncertain in all kinds; ${visible?.[1] ?? "?"} in kinds shown on the site`;
    }
    if (a.script === "verify:nightly") {
      const failed = readFileSync(r.log, "utf8").match(/(\d+) CHECK\(S\) FAILED/)?.[1];
      note = failed ? `${failed} checks FAILED` : "all checks passed";
    }
    if (a.script === "validate:comparisons") {
      // Not failures: kinds whose prices look odd, for Claude to check (the AI review stage).
      const text = readFileSync(r.log, "utf8");
      const kinds = text.match(/(\d+) kinds of food with at least one comparable product/)?.[1];
      const odd = text.match(/with at least one problem:\s+(\d+)/)?.[1];
      const stale = (text.match(/STORE DATA CHANGED|NO LONGER IN THE CATALOGUE|RE-CHECK DUE/g) ?? []).length;
      if (kinds) note = `${odd} of ${kinds} kinds have a price that looks odd; ${stale} known store errors to look at again`;
    }
    steps.push({ name: a.script, ok: r.code === 0, minutes: r.minutes, note, log: r.log });
  }

  // 5. backup --------------------------------------------------------------
  try {
    const target = await backup();
    steps.push({ name: "backup", ok: true, minutes: 0, note: `${target} (keeping the last ${KEEP_BACKUPS})` });
  } catch (e) {
    steps.push({ name: "backup", ok: false, minutes: 0, note: (e as Error).message });
  }

  // Logs older than LOG_KEEP_DAYS (code review L8); reports are kept for good.
  try {
    const removed = pruneLogs();
    steps.push({
      name: "old logs",
      ok: true,
      minutes: 0,
      note: removed.length === 0 ? `none older than ${LOG_KEEP_DAYS} days` : `${removed.length} removed, older than ${LOG_KEEP_DAYS} days`,
    });
  } catch (e) {
    steps.push({ name: "old logs", ok: false, minutes: 0, note: (e as Error).message });
  }

  // 6. summary -------------------------------------------------------------
  const failed = steps.filter((s) => !s.ok);
  const total = (Date.now() - started) / 60000;
  const lines = [
    `# Nightly run, ${day.slice(0, 10)} ${day.slice(11).replace("-", ":")}`,
    "",
    failed.length === 0 ? "**Everything worked.**" : `**${failed.length} step(s) need a look:** ${failed.map((f) => f.name).join(", ")}.`,
    "",
    `On ${host}, ${total.toFixed(1)} minutes in all${noCrawl ? ", without crawls (--no-crawl)" : ""}.`,
    "",
    "| Step | Result | Minutes | Notes |",
    "|---|---|---|---|",
    ...steps.map((s) => `| ${s.name} | ${s.ok ? "ok" : "**needs a look**"} | ${s.minutes ? s.minutes.toFixed(1) : ""} | ${s.note} |`),
    "",
    `Each step's full output is in ${dir}/.`,
  ];
  writeFileSync(path.join(dir, "summary.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  if (failed.length) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
