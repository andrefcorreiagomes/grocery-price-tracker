import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DailyReport, ProductNote } from "./daily-report";

/**
 * Turning a report into something a person reads and something a machine reads.
 *
 * Both matter and they are not the same artefact. The text version is what you
 * open when a run looks wrong; the JSON is what a scheduler, a diff, or a
 * triaging agent consumes without parsing prose. Writing both costs nothing and
 * means neither has to compromise for the other.
 */

const REPORT_DIR = "reports";
/** A stable path, so "how did last night go" does not require knowing a timestamp. */
const LATEST = "latest.md";
/** One line per run, so the verdicts can be scanned or plotted without opening anything. */
const LOG = "history.jsonl";

function section(title: string, lines: string[]): string[] {
  return lines.length > 0 ? [`## ${title}`, "", ...lines, ""] : [];
}

function notes(items: ProductNote[], indent = "  "): string[] {
  return items.map((n) => `${indent}${n.name.slice(0, 52).padEnd(52)}${n.detail ? `  ${n.detail}` : ""}`);
}

export function renderReport(report: DailyReport): string {
  const when = report.runAt.slice(0, 16).replace("T", " ");
  const lines: string[] = [
    `# ${report.store} crawl report - ${when}`,
    "",
    `**${report.verdict}**`,
    "",
  ];

  if (report.problems.length > 0) {
    lines.push(...report.problems.map((p) => `- ${p}`), "");
  } else {
    lines.push("Everything checked came back as expected.", "");
  }

  // Say what could be compared. An empty drift section and a `returned` of zero
  // look like reassurance, when on a first run they only mean there was nothing
  // to compare against - and a check that silently cannot run is worse than one
  // that reports it cannot.
  lines.push(
    report.baseline.runs === 0
      ? "_No previous run to compare against: everything below describes this run alone. Change detection starts with the next one._"
      : `_Compared against the last ${report.baseline.runs} run(s), back to ${report.baseline.since?.slice(0, 16).replace("T", " ")}._`,
    ""
  );

  if (report.incomplete) {
    lines.push(
      "_The crawl did not finish, so nothing was saved and the sections below describe nothing._",
      ""
    );
    return lines.join("\n");
  }

  // The live site first: it is the only part a visitor can see go wrong.
  lines.push(
    ...section("Impact on the live site", [
      report.live.trackedListingsMissing.length === 0
        ? "  no tracked product lost a listing"
        : `  ${report.live.trackedListingsMissing.length} tracked listing(s) missing:`,
      ...notes(report.live.trackedListingsMissing, "    "),
      `  ${report.live.candidatePairsAffected} match candidate pair(s) point at a product that was not seen`,
    ])
  );

  lines.push(
    ...section("Did the crawl work", [
      // The duplicates matter to a reader: without them "725 collected of 1055
      // listed" looks like a third of the section went missing, when in fact an
      // earlier section already had those products. Sections overlap by design -
      // Bio e Saudável is almost entirely products from the other five.
      ...report.scraper.sections.map(
        (s) =>
          `  ${s.label.padEnd(24)} ${String(s.collected).padStart(6)} collected` +
          (s.expected === null ? "" : ` of ${s.expected} listed`) +
          (s.duplicates > 0 ? ` (+${s.duplicates} already counted in an earlier section)` : "") +
          (s.short > 0 ? `  SHORT by ${s.short}` : "")
      ),
      "",
      `  ${report.scraper.requests} requests, ${report.scraper.megabytes} MB, ` +
        `${report.scraper.minutesFetching} min fetching, ${report.scraper.retries} retries` +
        (report.scraper.slowdown === null
          ? ""
          : `, ${report.scraper.slowdown}x the time per request of last run`),
    ])
  );

  lines.push(
    ...section("Data quality", [
      `  ${report.quality.total} products; missing price ${report.quality.missingPrice}, ` +
        `brand ${report.quality.missingBrand}, category ${report.quality.missingCategory}, ` +
        `url ${report.quality.missingUrl}`,
    ])
  );

  const catalogue = report.catalogue;
  lines.push(
    ...section("What changed in the catalogue", [
      `  seen this run:  ${catalogue.seen}`,
      `  new:            ${catalogue.newProducts}`,
      `  disappeared:    ${catalogue.disappeared}` +
        (catalogue.stillMissing > 0 ? `  (plus ${catalogue.stillMissing} missing from before)` : ""),
      `  returned:       ${catalogue.returned}  (absent last run, back now)`,
      `  moved category: ${catalogue.moved}`,
      `  renamed:        ${catalogue.renamed}`,
      ...(catalogue.samples.newProducts.length ? ["", "  new products:", ...notes(catalogue.samples.newProducts, "    ")] : []),
      ...(catalogue.samples.disappeared.length ? ["", "  disappeared:", ...notes(catalogue.samples.disappeared, "    ")] : []),
      ...(catalogue.samples.returned.length ? ["", "  returned:", ...notes(catalogue.samples.returned, "    ")] : []),
      ...(catalogue.samples.moved.length ? ["", "  moved category:", ...notes(catalogue.samples.moved, "    ")] : []),
      ...(catalogue.samples.renamed.length ? ["", "  renamed:", ...notes(catalogue.samples.renamed, "    ")] : []),
    ])
  );

  lines.push(
    ...section("Prices", [
      `  ${report.prices.changed} changed, ${report.prices.unchanged} held, ` +
        `${report.prices.opened} newly tracked` +
        (report.prices.skipped ? `, ${report.prices.skipped} without a price` : ""),
      ...(report.prices.absurd.length
        ? ["", "  IMPLAUSIBLE - check the parser before trusting these:", ...notes(report.prices.absurd, "    ")]
        : []),
      ...(report.prices.movers.length ? ["", "  biggest moves:", ...notes(report.prices.movers, "    ")] : []),
    ])
  );

  lines.push(
    ...section("Categories", [
      `  ${report.categories.crawled} crawled of ${report.categories.published} published`,
      ...(report.categories.unknown.length
        ? [
            "",
            "  published but neither crawled nor a known skip:",
            ...report.categories.unknown.map(
              (c) => `    ${c.cgid.padEnd(26)} ${String(c.hitCount).padStart(6)} products  ${c.label}`
            ),
          ]
        : []),
      ...(report.categories.missing.length
        ? ["", `  configured here but no longer published: ${report.categories.missing.join(", ")}`]
        : []),
      ...(report.categories.publishedCountChanges.length
        ? [
            "",
            "  the store's own published counts moved:",
            ...report.categories.publishedCountChanges.map(
              (c) => `    ${c.label.padEnd(24)} ${c.was} to ${c.now}`
            ),
          ]
        : []),
    ])
  );

  lines.push(...section("Compared with the previous run", report.drift.map((d) => `  ${d}`)));

  return lines.join("\n");
}

/**
 * Write both forms, named by store and timestamp so runs accumulate rather than
 * overwrite. The value compounds: the third report is worth more than the first,
 * because it can be diffed against the two before it.
 */
export async function writeReport(report: DailyReport): Promise<{ text: string; json: string }> {
  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = report.runAt.slice(0, 16).replace(/[:T]/g, "-");
  const base = `${report.store.toLowerCase()}-${stamp}`;
  const text = join(REPORT_DIR, `${base}.md`);
  const json = join(REPORT_DIR, `${base}.json`);

  const rendered = renderReport(report);
  await writeFile(text, rendered, "utf8");
  await writeFile(json, JSON.stringify(report, null, 2), "utf8");

  // Timestamped files accumulate, which is the point - but they are useless for
  // "just tell me about last night" unless something has a fixed name.
  await writeFile(join(REPORT_DIR, LATEST), rendered, "utf8");
  await appendFile(
    join(REPORT_DIR, LOG),
    JSON.stringify({
      runAt: report.runAt,
      store: report.store,
      verdict: report.verdict,
      problems: report.problems.length,
      total: report.quality.total,
      newProducts: report.catalogue.newProducts,
      disappeared: report.catalogue.disappeared,
      pricesChanged: report.prices.changed,
      incomplete: report.incomplete ?? false,
    }) + "\n",
    "utf8"
  );

  return { text, json };
}
