import { judgeSitemap, RUNS_BEFORE_ACCEPTING, type SitemapObservation } from "../scrapers/crawl/sitemap-trust";

/**
 * Whether a sitemap is believed, across a SEQUENCE of runs rather than one.
 *
 * The sequence is the whole point: any single night's judgement is easy, and
 * the bug this guards against only appears over time - a guard that distrusts
 * a legitimately reorganised sitemap forever, silently stopping discovery.
 * Pure logic, no database and no network.
 */
export function verifySitemapTrust(): number {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
  };

  const BASE = { entries: 101_398, files: 6 };

  console.log("single-night judgements");
  check("a healthy sitemap is trusted",
    judgeSitemap({ entries: 101_450, files: 6, error: null, baseline: BASE, recent: [] }).trusted);
  check("an unreadable sitemap is not",
    !judgeSitemap({ entries: 0, files: 0, error: "ECONNREFUSED", baseline: BASE, recent: [] }).trusted);
  check("zero product files is not",
    !judgeSitemap({ entries: 0, files: 0, error: null, baseline: BASE, recent: [] }).trusted);
  check("a lost file is not, even at -0.20%",
    !judgeSitemap({ entries: 101_198, files: 5, error: null, baseline: BASE, recent: [] }).trusted);
  check("a big entry drop is not",
    !judgeSitemap({ entries: 60_000, files: 6, error: null, baseline: BASE, recent: [] }).trusted);
  check("a first run with no baseline is trusted",
    judgeSitemap({ entries: 101_398, files: 6, error: null, baseline: null, recent: [] }).trusted);
  check("growth is never suspicious",
    judgeSitemap({ entries: 140_000, files: 7, error: null, baseline: BASE, recent: [] }).trusted);

  console.log("\nthe store reorganises: 6 files become 5, permanently");
  const seen: SitemapObservation[] = [];
  for (let night = 1; night <= 4; night++) {
    const v = judgeSitemap({ entries: 101_198, files: 5, error: null, baseline: BASE, recent: [...seen] });
    const state = v.trusted ? (v.accepted ? "TRUSTED (accepted as new normal)" : "trusted") : "distrusted";
    console.log(`  night ${night}: ${state}`);
    if (night < RUNS_BEFORE_ACCEPTING) check(`  night ${night} still distrusted`, !v.trusted);
    if (night === RUNS_BEFORE_ACCEPTING) {
      check("  the change is accepted on the third night", v.trusted && v.accepted !== null);
      console.log(`         ${v.accepted}`);
    }
    seen.unshift({ entries: 101_198, files: 5, trusted: v.trusted });
  }

  console.log("\na one-night glitch must NOT be accepted");
  const flapping: SitemapObservation[] = [
    { entries: 101_398, files: 6, trusted: true },
    { entries: 40_000, files: 6, trusted: false },
    { entries: 101_398, files: 6, trusted: true },
  ];
  check("differing figures do not accumulate towards acceptance",
    !judgeSitemap({ entries: 40_000, files: 6, error: null, baseline: BASE, recent: flapping }).trusted);

  console.log("\nan outage never becomes the new normal");
  const outages: SitemapObservation[] = Array.from({ length: 5 }, () => ({ entries: 0, files: 0, trusted: false }));
  check("five consecutive outages are still distrusted",
    !judgeSitemap({ entries: 0, files: 0, error: "ECONNREFUSED", baseline: BASE, recent: outages }).trusted);

  return failures;
}
