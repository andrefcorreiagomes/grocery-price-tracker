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
 *
 * Every section carries a short note saying what it is for and when it cannot
 * say anything. A number with no explanation is a number you learn to skip: the
 * reader is usually someone who has not thought about this crawler in weeks, and
 * "returned: 0" means nothing to them unless it also says what a return is and
 * why it needed a previous run to detect one. The notes cite what actually went
 * wrong on this project rather than describing checks in the abstract.
 */

const REPORT_DIR = "reports";
/** A stable path, so "how did last night go" does not require knowing a timestamp. */
const LATEST = "latest.md";
/** One line per run, so the verdicts can be scanned or plotted without opening anything. */
const LOG = "history.jsonl";

export interface RenderOptions {
  /** Set false for a bare report, once the checks are familiar. */
  explain?: boolean;
}

function section(title: string, note: string, lines: string[], explain: boolean): string[] {
  if (lines.length === 0) return [];
  return [`## ${title}`, "", ...(explain ? [`> ${note}`, ""] : []), ...lines, ""];
}

function notes(items: ProductNote[], indent = "  "): string[] {
  return items.map((n) => `${indent}${n.name.slice(0, 52).padEnd(52)}${n.detail ? `  ${n.detail}` : ""}`);
}

export function renderReport(report: DailyReport, options: RenderOptions = {}): string {
  const explain = options.explain ?? true;
  const when = report.runAt.slice(0, 16).replace("T", " ");
  const lines: string[] = [
    `# ${report.store} crawl report - ${when}`,
    "",
    `**${report.verdict}**`,
    "",
  ];

  if (explain) {
    lines.push(
      "> **FAIL** means the data is wrong, or the site is about to show something wrong.",
      "> **WARN** means something deserves a look but nothing is broken.",
      "> **OK** means every check below ran and passed - not merely that the crawl finished.",
      "> Only FAIL sets a non-zero exit code.",
      ""
    );
  }

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

  lines.push(
    ...section(
      "Impact on the live site",
      "The only part a visitor can see go wrong, so it comes first. A missing tracked listing means " +
        "one of the published comparisons is about to show a stale price or a dead link. Candidate " +
        "pairs are matches still waiting to be confirmed - nobody sees them yet, so that number is " +
        "context rather than a problem, and it only becomes one if it climbs run after run.",
      [
        report.live.trackedListingsMissing.length === 0
          ? "  no tracked product lost a listing"
          : `  ${report.live.trackedListingsMissing.length} tracked listing(s) missing:`,
        ...notes(report.live.trackedListingsMissing, "    "),
        `  ${report.live.candidatePairsAffected} match candidate pair(s) point at a product that was not seen`,
      ],
      explain
    )
  );

  lines.push(
    ...section(
      "Did the crawl work",
      "Each section is checked against the count the store publishes for itself. Sections overlap " +
        "deliberately - Bio e Saudável is almost entirely products already counted in the other five - " +
        "so `collected` plus `already counted` should equal `listed`. A real gap is marked SHORT. This " +
        "is the check that was missing when a crawl once collected less than half the Pingo Doce " +
        "catalogue and still exited successfully. Request time is compared with previous runs because " +
        "a crawl that suddenly slows is usually being throttled, and that is the warning that arrives " +
        "before a block rather than after.",
      [
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
            ? "  (no earlier run to compare the timing against)"
            : `, ${report.scraper.slowdown}x the time per request of last run`),
      ],
      explain
    )
  );

  lines.push(
    ...section(
      "Data quality",
      "Null counts are the earliest warning that a page's markup changed. A field that quietly starts " +
        "coming back empty looks like nothing at all - Continente's barcode extraction returned null " +
        "for months, and only surfaced when someone measured it rather than assumed it. What matters " +
        "here is not the absolute number but whether it moved: five products without a category is " +
        "normal, five hundred means a parser broke.",
      [
        `  ${report.quality.total} products; missing price ${report.quality.missingPrice}, ` +
          `brand ${report.quality.missingBrand}, category ${report.quality.missingCategory}, ` +
          `url ${report.quality.missingUrl}`,
      ],
      explain
    )
  );

  const c = report.catalogue;
  const noBaseline = report.baseline.runs === 0;
  lines.push(
    ...section(
      "What changed in the catalogue",
      "**new** and **disappeared** are the store's range moving. **returned** means seen now but " +
        "absent last run: usually pagination flicker rather than a genuine return, which is why it is " +
        "counted apart from new - without the distinction, every flicker would read as a disappearance " +
        "and the list would be ignored. **moved** is the store refiling a product, which is how baby " +
        "food was found sitting under Mercearia rather than under Bebé. **renamed** matters more than " +
        "it looks: cross-store matching works on names, so when `Guapa` became `Skar`, four energy " +
        "drinks silently stopped matching their counterparts at other stores." +
        (noBaseline ? " With no previous run, `returned` cannot be computed and reads 0." : ""),
      [
        `  seen this run:  ${c.seen}`,
        `  new:            ${c.newProducts}`,
        `  disappeared:    ${c.disappeared}` +
          (c.stillMissing > 0 ? `  (plus ${c.stillMissing} already missing before this run)` : ""),
        `  returned:       ${noBaseline ? "n/a - needs a previous run" : `${c.returned}  (absent last run, back now)`}`,
        `  moved category: ${c.moved}`,
        `  renamed:        ${c.renamed}`,
        ...(c.samples.newProducts.length ? ["", "  new products:", ...notes(c.samples.newProducts, "    ")] : []),
        ...(c.samples.disappeared.length ? ["", "  disappeared:", ...notes(c.samples.disappeared, "    ")] : []),
        ...(c.samples.returned.length ? ["", "  returned:", ...notes(c.samples.returned, "    ")] : []),
        ...(c.samples.moved.length ? ["", "  moved category:", ...notes(c.samples.moved, "    ")] : []),
        ...(c.samples.renamed.length ? ["", "  renamed:", ...notes(c.samples.renamed, "    ")] : []),
        ...(explain && (c.newProducts > 0 || c.disappeared > 0)
          ? ["", "  (examples are spread across sections, so they are representative rather than whatever was crawled first)"]
          : []),
      ],
      explain
    )
  );

  lines.push(
    ...section(
      "Prices",
      "One row is kept per price rather than per day, so a price that holds for a month is one row " +
        "with a widening date range, and `held` means the crawl confirmed today's price is still " +
        "yesterday's. A move beyond 50% is listed because it is either a real promotion or a parse " +
        "bug, and the two are indistinguishable without looking. A move beyond 5x fails the run " +
        "outright: no grocery price moves that far, so it means the parser is reading the wrong " +
        "number, and this is the check standing between a broken parser and a database of wrong " +
        "prices. `newly tracked` counts products priced for the first time, so it is large on a first " +
        "run and small thereafter.",
      [
        `  ${report.prices.changed} changed, ${report.prices.unchanged} held, ` +
          `${report.prices.opened} newly tracked` +
          (report.prices.skipped ? `, ${report.prices.skipped} listed without a price` : ""),
        ...(report.prices.absurd.length
          ? ["", "  IMPLAUSIBLE - check the parser before trusting these:", ...notes(report.prices.absurd, "    ")]
          : []),
        ...(report.prices.movers.length ? ["", "  biggest moves:", ...notes(report.prices.movers, "    ")] : []),
      ],
      explain
    )
  );

  lines.push(
    ...section(
      "Categories",
      "The store publishes its own category tree, and we compare it with what we crawl. **UNKNOWN** " +
        "means the store has a category we neither crawl nor recognise as non-food - the failure that " +
        "is otherwise invisible, because a category we do not know about is one we simply never ask " +
        "for, and the run would look perfectly healthy while missing a whole department. **MISSING** " +
        "means we are configured for a category the store has stopped publishing, which usually makes " +
        "the crawl fail outright as well. The store's own counts moving is the store changing, " +
        "independent of whether our crawl worked - a useful thing to be able to tell apart.",
      [
        `  ${report.categories.crawled} crawled of ${report.categories.published} published`,
        ...(report.categories.unknown.length
          ? [
              "",
              "  published but neither crawled nor a known skip:",
              ...report.categories.unknown.map(
                (x) => `    ${x.cgid.padEnd(26)} ${String(x.hitCount).padStart(6)} products  ${x.label}`
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
                (x) => `    ${x.label.padEnd(24)} ${x.was} to ${x.now}`
              ),
            ]
          : explain
            ? ["", "  the store's published counts are unchanged since the last run"]
            : []),
      ],
      explain
    )
  );

  lines.push(
    ...section(
      "Compared with recent runs",
      "Checked against both the previous run and a rolling median of the last few. One comparison " +
        "cannot see a slow leak: a section losing 3% a day never trips a 20% threshold on any single " +
        "day, yet is a fifth down inside a week. The median also stops one half-failed run becoming " +
        "the standard the next run is judged against. Nothing here means nothing moved enough to " +
        "matter - small drift every run is normal, because stock changes while we page through it.",
      report.drift.length > 0
        ? report.drift.map((d) => `  ${d}`)
        : explain && !noBaseline
          ? ["  nothing moved beyond the thresholds"]
          : [],
      explain
    )
  );

  return lines.join("\n");
}

/**
 * Write both forms, named by store and timestamp so runs accumulate rather than
 * overwrite. The value compounds: the third report is worth more than the first,
 * because it can be diffed against the two before it.
 */
export async function writeReport(
  report: DailyReport,
  options: RenderOptions = {}
): Promise<{ text: string; json: string }> {
  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = report.runAt.slice(0, 16).replace(/[:T]/g, "-");
  const base = `${report.store.toLowerCase()}-${stamp}`;
  const text = join(REPORT_DIR, `${base}.md`);
  const json = join(REPORT_DIR, `${base}.json`);

  const rendered = renderReport(report, options);
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
