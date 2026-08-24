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

/**
 * Push a problem onto a report and move its verdict, most-serious-first.
 *
 * The verdict ladder was open-coded once per check in each nightly runner, the
 * same six-line `{ ...report, verdict: report.verdict === "FAIL" ? ... }` spread
 * every time - which is exactly how the Continente runner ended up pushing a
 * parser-regression FAIL onto the list twice. The two rules never change: a FAIL
 * can never be softened to a WARN, and every message goes to the FRONT, because
 * the reader wants the worst thing first.
 */
export function escalate(
  report: DailyReport,
  level: "FAIL" | "WARN",
  message: string
): DailyReport {
  return {
    ...report,
    verdict: level === "FAIL" || report.verdict === "FAIL" ? "FAIL" : "WARN",
    problems: [message, ...report.problems],
  };
}

function section(title: string, note: string, lines: string[], explain: boolean): string[] {
  if (lines.length === 0) return [];
  return [`## ${title}`, "", ...(explain ? [`> ${note}`, ""] : []), ...lines, ""];
}

/**
 * Movement against a previous figure, signed. The direction is the point: a
 * sitemap that grew and one that shrank read identically as a bare count, and
 * only one of them is a reason to look.
 */
function signedPercent(now: number, before: number): string {
  if (before === 0) return "no previous total";
  const delta = (100 * (now - before)) / before;
  if (Math.abs(delta) < 0.005) return "unchanged";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(2)}%`;
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

  if (report.rotation) {
    const r = report.rotation;
    const pct = (n: number) => `${((100 * n) / Math.max(1, r.enrichment.total)).toFixed(1)}%`;
    lines.push(
      ...section(
        "Rotation: is the whole catalogue being reached",
        "This run refreshed a slice, not the whole catalogue, so per-section coverage would be " +
          "meaningless - a run that deliberately fetched 25 products has not come up short by 3,295. " +
          "What matters instead is whether every corner is still being reached. Products are fetched " +
          "STALEST FIRST, so the oldest figure below is the worst case anywhere in the catalogue: if " +
          "it keeps growing, the budget is too small for the catalogue's size and some products are " +
          "being left behind.",
        [
          `  refreshed this run:   ${r.refreshedThisRun.toLocaleString()} of ${r.enrichment.total.toLocaleString()}`,
          `  confirmed in the last day:    ${r.staleness.today.toLocaleString()}`,
          `  within a week:                ${r.staleness.week.toLocaleString()}`,
          `  within a month:               ${r.staleness.month.toLocaleString()}`,
          `  older than a month:           ${r.staleness.older.toLocaleString()}`,
          `  oldest confirmation:  ${r.oldestSeenAt?.slice(0, 16).replace("T", " ") ?? "n/a"}`,
          `  full pass at this rate: ${r.daysToFullCoverage === null ? "never - nothing was refreshed" : `${r.daysToFullCoverage} day(s)`}`,
        ],
        explain
      )
    );

    lines.push(
      ...section(
        "What only a product page can tell us",
        "A listing crawl infers a product is gone from its absence, which is a guess - pagination " +
          "flickers, and a product missing from one run is often back in the next. Here a delisted " +
          "product answers with a dead page, which is a fact. Every fetch also carries the barcode and " +
          "package size that no listing tile has, so enrichment coverage should climb run over run; if " +
          "it stalls while products are being refreshed, the page parser has broken.",
        [
          `  confirmed delisted this run: ${r.confirmedDelisted.toLocaleString()}`,
          ...notes(r.deadSamples, "    "),
          "",
          `  catalogue with a barcode: ${r.enrichment.withBarcode.toLocaleString()} (${pct(r.enrichment.withBarcode)})`,
          `  catalogue with a size:    ${r.enrichment.withSize.toLocaleString()} (${pct(r.enrichment.withSize)})`,
        ],
        explain
      )
    );

    lines.push(
      ...section(
        "Our catalogue against the store's own counts",
        "Read from each section's landing page, which robots.txt allows. A different question from " +
          "the rotation above: not whether our prices are fresh, but whether we know about the " +
          "products at all. COMPARE THE TOTALS, NOT THE ROWS - the sections overlap, and we file each " +
          "product under whichever section first listed it, so Bio e Saudável looks tiny (its products " +
          "are filed under Frescos and Mercearia) while Frescos can exceed its own published count. " +
          "Only a wide gap in the TOTAL means products we have genuinely never seen, and refreshing " +
          "will never find those - that is what the discovery section below is for.",
        (() => {
          const rows = r.sections.map(
            (x) =>
              `  ${x.label.padEnd(24)} ${String(x.ours).padStart(6)} known` +
              (x.published === null ? "" : ` of ${x.published} published`)
          );
          const ours = r.sections.reduce((n, x) => n + x.ours, 0);
          // A store that publishes no per-section counts gets no comparison
          // rather than a comparison against zero, which rendered as "17,864
          // known against 0 published, a difference of -17,864" - a shortfall
          // that reads as catastrophic and does not exist. Auchan publishes one
          // count for the whole walk, which the grid-health section shows.
          const counted = r.sections.filter((x) => x.published !== null);
          if (counted.length === 0) {
            return [
              ...rows,
              "",
              `  TOTAL ${ours.toLocaleString()} known. This store publishes no per-section counts, so there is` +
                ` nothing to compare them against here; its published total is in the grid-health section above.`,
            ];
          }
          // The only comparison that means anything, because a product counted
          // once by us may be published in several sections.
          const pub = counted.reduce((n, x) => n + (x.published ?? 0), 0);
          return [
            ...rows,
            "",
            `  TOTAL ${String(ours).toLocaleString()} known against ${pub.toLocaleString()} published across the sections` +
              `, a difference of ${(pub - ours).toLocaleString()} - most of which is products listed in more than one section`,
          ];
        })(),
        explain
      )
    );
  }

  if (report.identitySwaps && report.identitySwaps.length > 0) {
    lines.push(
      ...section(
        "Products whose id was reused by a different product",
        "The opposite of the section below: not one product moving to a new id, but a DIFFERENT " +
          "product arriving at an id we already had. Proven by the barcode changing from one real " +
          "value to another - the barcode identifies the physical product, the id only identifies " +
          "the page. Left alone this is the worst silent corruption available to us, because prices " +
          "key on the id: two unrelated products would be spliced into one continuous series with " +
          "nothing marking the seam. Instead the old product is archived under a retired id, keeping " +
          "its own history, and the incoming product takes the clean id. A handful is normal; many " +
          "at once means the barcode reader is misreading, and then nothing is archived at all.",
        report.identitySwaps.slice(0, 12).flatMap((s) => [
          `  ${s.storeProductId} -> ${s.retiredId}`,
          `      was ${s.previousName.slice(0, 44)}`,
          `      now ${s.newName.slice(0, 44)}`,
          `      barcode ${s.previousEan} became ${s.incomingEan}; archived, histories kept separate`,
        ]),
        explain
      )
    );
  }

  if (
    report.reidentification &&
    (report.reidentification.changes.length > 0 || report.reidentification.ambiguous.length > 0)
  ) {
    const r = report.reidentification;
    lines.push(
      ...section(
        "Products that changed id",
        "A product's identity is the id in its Continente URL, so a product re-issued under a new " +
          "id looks like one product disappearing and an unrelated one appearing - with its price " +
          "history restarting from zero. When the new product shares an EXACT barcode with the one " +
          "that just vanished, they are the same thing: the history is carried across and the old " +
          "row kept as a tombstone pointing at the new id. Only products with a real barcode can be " +
          "matched this way; a re-numbered product without one still shows as an unrelated new/gone " +
          "pair above. A handful here is routine; hundreds is a mass re-numbering.",
        [
          `  reconciled by barcode: ${r.changes.length.toLocaleString()}`,
          ...r.changes
            .slice(0, 12)
            .map(
              (c) =>
                `    ${c.oldId} -> ${c.newId}   ${c.name.slice(0, 34).padEnd(34)} history carried over (${c.periodsCarried} period${c.periodsCarried === 1 ? "" : "s"})`
            ),
          ...(r.ambiguous.length === 0
            ? []
            : [
                "",
                `  !! ${r.ambiguous.length.toLocaleString()} barcode(s) matched more than one disappeared product - not linked, needs a look:`,
                ...r.ambiguous
                  .slice(0, 12)
                  .map((a) => `     ${a.newId}  ${a.name.slice(0, 34).padEnd(34)} ${a.candidates} candidates`),
              ]),
        ],
        explain
      )
    );
  }

  if (report.catalogueByStore && report.catalogueByStore.length > 0) {
    lines.push(
      ...section(
        "How big the catalogue is, by store",
        "Every other figure describes what this run DID; this one describes the size of the thing " +
          "it maintains, which is the only way to see a store drifting. All three appear, not just " +
          "the one that ran, because a store whose crawler has quietly stopped shows here as a flat " +
          "line - and a crawler that never runs writes no report of its own to notice. Rows are " +
          "never deleted, so a delisted product still counts towards the total; the delisted figure " +
          "is shown beside it so the total cannot quietly fill up with products the store no longer " +
          "sells.",
        report.catalogueByStore.map((s) => {
          const label = s.store.replace("_", " ").padEnd(12);
          const movement =
            s.previousTotal === null
              ? `${s.total.toLocaleString().padStart(8)}   (no previous run to compare)`
              : `${s.previousTotal.toLocaleString().padStart(8)} to ${s.total.toLocaleString().padStart(8)}` +
                `   (${signedPercent(s.total, s.previousTotal)})`;
          return (
            `  ${label} ${movement}` +
            (s.delisted > 0 ? `, ${s.delisted.toLocaleString()} delisted` : "")
          );
        }),
        explain
      )
    );
  }

  if (report.gridHealth) {
    const g = report.gridHealth;
    const yieldPct = ((100 * g.tilesKept) / Math.max(1, g.tilesSeen)).toFixed(1);
    const emptyPct = ((100 * g.withoutCategory) / Math.max(1, g.tilesKept)).toFixed(1);
    lines.push(
      ...section(
        "Grid health: was the whole catalogue reached, and did the tiles parse",
        "This store is crawled by walking its listing grids, not by reading a sitemap of every " +
          "published id - so unlike Continente there is no independent list to check completeness " +
          "against, and the walk has to police itself. Two silent failures matter. A TRUNCATED walk: " +
          "if we fetched materially fewer products than the store's own counter published, the grid " +
          "was cut short, and since a product's absence is the only reason we ever delist, a short " +
          "walk must delist NOTHING - so it freezes delisting and fails. A broken TILE PARSER: each " +
          "product's data rides in a JSON attribute, and a renamed attribute makes the reader return " +
          "nothing without throwing, shrinking the catalogue with no error. MALFORMED tiles are the " +
          "alarm for that - bad JSON or a missing id/name/url, which a healthy grid never produces. " +
          "Tiles that are well-formed but simply carry no price are counted apart: those are " +
          "out-of-stock products the store still lists but cannot sell, a price tracker has nothing " +
          "to record for them, and lumping them in gave the alarm a permanent floor to see a real " +
          "break through. The share of tiles arriving with no category is the alarm for the food " +
          "filter emptying the catalogue, because an empty category reads as non-food.",
        [
          `  mode:                 ${g.mode}`,
          `  distinct products walked: ${g.distinctWalked.toLocaleString()}` +
            (g.addedByDepartments > 0
              ? `   (departments added ${g.addedByDepartments.toLocaleString()} beyond root)`
              : ""),
          "  coverage per category (tiles delivered vs the store's own count):",
          ...g.coverage.map((c) => {
            const short = c.published !== null && c.delivered < c.published ? `  (${(c.published - c.delivered).toLocaleString()} short)` : "";
            return `    ${c.label.padEnd(22)} ${c.delivered.toLocaleString().padStart(8)}` +
              (c.published === null ? "   (no count published)" : ` of ${c.published.toLocaleString()}${short}`);
          }),
          `  tiles parsed:         ${g.tilesKept.toLocaleString()} of ${g.tilesSeen.toLocaleString()} seen (${yieldPct}% yield)`,
          `  listed without a price: ${g.tilesUnpriced.toLocaleString()} (out of stock, skipped - not a fault)`,
          `  MALFORMED tiles:      ${g.tilesMalformed.toLocaleString()}` +
            (g.tilesMalformed === 0
              ? "  (the parser read every tile it should)"
              : `  <- ${((100 * g.tilesMalformed) / Math.max(1, g.tilesSeen)).toFixed(1)}% - the tile shape may have changed`),
          `  tiles with no category: ${g.withoutCategory.toLocaleString()} (${emptyPct}% of those kept)`,
          `  delisting this run:   ${
            g.delisting === "frozen"
              ? "FROZEN - a guard fired, so nothing was marked gone"
              : g.delisting === "partial"
                ? "not attempted - a partial walk, so absence was never tested"
                : "active"
          }`,
          "",
          "  segments seen (kept by the food filter, or dropped):",
          ...g.segments.map(
            (s) => `    ${s.kept ? "keep" : "drop"}  ${String(s.count).padStart(6)}  ${s.segment}`
          ),
          ...(g.segmentsAreBaseline
            ? [
                "",
                "  This is the first walk with a segment tally, so the list above is the BASELINE and nothing",
                "  could be reported as new. Comparison starts with the next run: from then on, a segment the",
                "  filter drops that was not here before is worth opening.",
              ]
            : []),
          ...(g.segmentsAppeared.length
            ? [
                "",
                "  !! new segments the filter DROPPED, not seen last run - a food department may be hiding here:",
                ...g.segmentsAppeared.flatMap((s) => [
                  `     ${s.segment}  (${s.count.toLocaleString()} products)`,
                  ...s.samples.slice(0, 3).map((n) => `        ${n.slice(0, 60)}`),
                ]),
              ]
            : []),
          ...(g.segmentsVanished.length
            ? [
                "",
                "  !! segments the filter KEPT last run and are GONE now - a food department vanished:",
                ...g.segmentsVanished.map((s) => `     ${s.segment}  (was ${s.count.toLocaleString()} products)`),
              ]
            : []),
        ],
        explain
      )
    );

    lines.push(
      ...section(
        "Products leaving the catalogue",
        "A grid walk only tells us a product is ABSENT, which is a guess - pagination flickers. So " +
          "every product missing from a complete walk gets one product-page fetch to settle it. A page " +
          "that returns 404/410 is a fact, and three such nights in a row delist the product; one bad " +
          "night cannot. A page that will not load at all means we could not tell, and is counted " +
          "apart, never as gone. And a page that still ANSWERS while the product was missing from the " +
          "grid is the interesting one: the product is alive, so the walk itself has a hole the store's " +
          "own counter did not reveal.",
        [
          `  confirmed gone this run (dead page): ${g.confirmedDead.toLocaleString()}`,
          `  of those, delisted (third dead night): ${g.delistedNow.toLocaleString()}`,
          ...notes(g.delistedSamples, "    "),
          "",
          `  alive but missing from the grid:     ${g.aliveButMissing.toLocaleString()}`,
          ...notes(g.aliveButMissingSamples, "    "),
          "",
          `  could not be reached (not counted as gone): ${g.unreachable.toLocaleString()}`,
        ],
        explain
      )
    );
  }

  if (report.discovery) {
    const d = report.discovery;
    lines.push(
      ...section(
        "Discovery: is the catalogue complete",
        "A different question from freshness. Refreshing only ever revisits products we already " +
          "hold, so on its own it can never find a product the store has just started selling - the " +
          "catalogue could only shrink. Continente's sitemap lists every product id it publishes, so " +
          "each night we subtract what we track and what we have already judged, and open whatever is " +
          "left. The answer is written down permanently, which is what stops this costing 24 hours " +
          "every single night. Until 'never opened' reaches zero, a newly listed product may wait its " +
          "turn in that queue. " +
          "EVERYTHING HERE DEPENDS ON THE SITEMAP BEING SOUND, so it is checked before it is used, " +
          "on the entry count AND on the number of files it came in. Both, because the files are not " +
          "equally sized: the index dropping a small one can move the entry count by a fraction of a " +
          "percent - measured at 0.20% for a 200-entry file - and slip past a threshold entirely, " +
          "while a slice of the store silently stops being published as far as we can tell. A file " +
          "count also means something on a first run, when there is no previous entry count to " +
          "compare against. When the sitemap is not trusted, discovery is skipped rather than acted " +
          "on, and the count is not recorded - believing a bad one would make tomorrow read the " +
          "recovery as an enormous increase. " +
          "Two figures below exist because silence is the dangerous failure. Per-file entries catch " +
          "partial damage the total hides - a file truncated at 90% loses about 1.5% of the " +
          "addresses, comfortably under any sensible threshold on the total - and are reported " +
          "rather than acted on, since we do not yet know whether the store repartitions its files " +
          "between regenerations. 'Addresses with no id' should be zero: it was 170 for months, " +
          "dropped without a word, because the id pattern matched digits only. Anything above zero " +
          "means the URL shape changed and we are quietly discarding products.",
        [
          `  published in the sitemap:  ${d.sitemapEntries.toLocaleString()} address(es) in ${d.sitemapFiles} file(s)`,
          ...(d.sitemapLastRun === null
            ? ["    vs last run:            no previous run to compare against"]
            : [
                `    vs last run (${d.sitemapLastRun.at.slice(0, 10)}):` +
                  `  ${d.sitemapLastRun.entries.toLocaleString()} in ${d.sitemapLastRun.files} file(s)` +
                  `   ${signedPercent(d.sitemapEntries, d.sitemapLastRun.entries)}` +
                  (d.sitemapLastRun.trusted ? "" : "   (that run was not trusted)"),
              ]),
          // Shown only when it is a different run from the one above, so a
          // normal night does not print the same line twice.
          ...(d.sitemapPrevious === null ||
          (d.sitemapLastRun !== null && d.sitemapLastRun.at === d.sitemapBaselineAt)
            ? []
            : [
                `    vs trusted baseline (${d.sitemapBaselineAt?.slice(0, 10) ?? "?"}):` +
                  `  ${d.sitemapPrevious.toLocaleString()} in ${d.sitemapFilesPrevious ?? "?"} file(s)` +
                  `   ${signedPercent(d.sitemapEntries, d.sitemapPrevious)}` +
                  "   <- what the guards measure against",
              ]),
          ...(d.sitemapPerFile.length === 0
            ? []
            : [
                "    per file:",
                ...d.sitemapPerFile.map(
                  (f) =>
                    `      ${(f.url.split("/").pop() ?? f.url).slice(0, 40).padEnd(40)} ${f.entries.toLocaleString().padStart(8)}`
                ),
              ]),
          ...(d.sitemapFileWarnings.length === 0
            ? []
            : ["    !! a file shrank sharply:", ...d.sitemapFileWarnings.map((w) => `       ${w}`)]),
          `  addresses with no id:      ${d.sitemapUnparseable.toLocaleString()}` +
            (d.sitemapUnparseable === 0 ? "  (as it should be)" : "  <- the URL shape may have changed"),
          ...d.sitemapUnparseableSamples.map((u) => `       ${u.replace("https://www.continente.pt", "")}`),
          `  sitemap trusted:           ${d.sitemapTrusted ? "yes" : "NO"}`,
          ...(d.sitemapAccepted === null
            ? []
            : [
                `     NOTE: ${d.sitemapAccepted}`,
                `     The baseline has moved. If this was not a deliberate change at the`,
                `     store, it is worth looking at what happened.`,
              ]),
          ...(d.sitemapTrusted
            ? []
            : [
                `     ${d.sitemapDistrust}`,
                `     Discovery was skipped. Prices were still refreshed: phase 2 works from`,
                `     our own stored addresses and never needs the sitemap.`,
              ]),
          "",
          `  opened for the first time: ${d.examined.toLocaleString()}`,
          `  re-opened, verdict stale:  ${d.rechecked.toLocaleString()}`,
          `  of those, food added:      ${d.newFoodCount.toLocaleString()}`,
          ...notes(d.newFood, "    "),
          "",
          `  still never opened:        ${d.unexaminedRemaining.toLocaleString()}`,
          `  nights to finish at this rate: ${
            d.nightsToComplete === null
              ? "never - no budget was spent"
              : d.nightsToComplete === 0
                ? "done, everything published has been judged"
                : d.nightsToComplete.toLocaleString()
          }`,
          "",
          `  judged and set aside so far: ${(d.verdictNotFood + d.verdictDead).toLocaleString()}` +
            ` (${d.verdictNotFood.toLocaleString()} not food, ${d.verdictDead.toLocaleString()} gone)` +
            (d.verdictPrevTotal === null
              ? "  (no previous run to compare)"
              : `  (was ${d.verdictPrevTotal.toLocaleString()}, ${signedPercent(d.verdictNotFood + d.verdictDead, d.verdictPrevTotal)})`),
          ...(d.verdictShrank
            ? ["    !! this table shrank - it should only ever grow, so rows left a table nothing deletes from"]
            : []),
        ],
        explain
      )
    );

    lines.push(
      ...section(
        "Products leaving the catalogue",
        "Nothing is ever deleted: a product that stops answering keeps its row and its whole price " +
          "history, because 'this cost what it cost until it vanished' is real history. Three " +
          "CONSECUTIVE nights of a dead page are required before we believe it, so one bad night " +
          "cannot delist anything, and only a page that actually said the product is gone counts - a " +
          "server error means we could not tell, and is listed separately. Dropping out of the " +
          "sitemap is an early warning that usually precedes the dead page by a day or two.",
        [
          `  delisted this run (third dead night): ${d.delistedNowCount.toLocaleString()}`,
          ...notes(d.delistedNow, "    "),
          "",
          `  still live but no longer food:        ${d.recategorisedCount.toLocaleString()}`,
          ...notes(d.recategorised, "    "),
          "",
          `  no longer listed in the sitemap:      ${d.droppedFromSitemapCount.toLocaleString()}`,
          ...notes(d.droppedFromSitemap, "    "),
          "",
          `  could not be reached (not counted as gone): ${d.unreachable.toLocaleString()}`,
        ],
        explain
      )
    );
  }

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
        `  ${report.scraper.requests} requests, ` +
          (report.scraper.transferredMegabytes === null
            ? `transfer unreported, ${report.scraper.megabytes} MB of HTML, `
            : `${report.scraper.transferredMegabytes} MB transferred (${report.scraper.megabytes} MB of HTML once unpacked), `) +
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
  // A rotation touches a deliberate slice, so it cannot speak to what MOVED,
  // was RENAMED or RETURNED across the catalogue - it never looked at most of
  // it. Its own sections above cover what it does know. Printing zeros here
  // would claim those checks ran.
  // Change detection needs a run that looked at everything. A complete pass
  // qualifies however it was fetched - page by page or grid by grid.
  const sawEverything = !report.rotation || report.rotation.complete;
  if (sawEverything)
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

  // Likewise the category audit: it belongs to the crawler that walks
  // categories. The rotation's "against the store's own counts" section asks the
  // useful half of the same question.
  if (sawEverything)
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
        ...(report.categories.sitemapSlugs > 0
          ? [
              "",
              `  sitemap cross-check: ${report.categories.sitemapSlugs} top-level categories published` +
                (report.categories.sitemapUnknown.length
                  ? `, ${report.categories.sitemapUnknown.length} unrecognised: ${report.categories.sitemapUnknown.join(", ")}`
                  : ", all recognised"),
            ]
          : ["", "  sitemap cross-check: could not be read"]),
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
