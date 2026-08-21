import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";

/**
 * Comparing a crawl against the one before it.
 *
 * A single run can only check itself against what the store publishes right
 * now: "you said 5,406 products, I collected 5,406". That catches a truncated
 * crawl, but it is blind to the store itself changing - a section quietly
 * halving, or products drifting into a department we do not crawl, both look
 * perfectly consistent within the run that loses them. Only yesterday's numbers
 * reveal those.
 */

/** A section returned fewer than this share of last run's products before we complain. */
const SECTION_DROP = 0.2;
/** The store total is steadier than any one section, so it gets a tighter bound. */
const TOTAL_DROP = 0.1;

export interface RunSection {
  cgid: string;
  label: string;
  collected: number;
  expected?: number | null;
}

/** The run before this one, for anything that needs to diff against it. */
export async function previousRunFor(store: Store) {
  const run = await prisma.crawlRun.findFirst({
    where: { store },
    orderBy: { startedAt: "desc" },
    include: { sections: true },
  });
  if (!run) return null;
  return {
    startedAt: run.startedAt,
    requests: run.requests,
    fetchMs: run.fetchMs,
    sections: run.sections.map((s) => ({ label: s.label, expected: s.expected })),
  };
}

export interface RunRequestStats {
  requests: number;
  /** HTML processed, after decompression - not what crossed the network */
  bytes: number;
  /** compressed bytes transferred, null when no response reported a size */
  wireBytes?: number | null;
  fetchMs: number;
  retries: number;
}

/**
 * Save this run so the next one has something to compare against.
 *
 * `seenAt` must be the instant the crawl stamped on the products it saw, NOT
 * the moment this is called. They differ by however long saving took, and that
 * gap is enough to break the next run's comparison: a product's `lastSeenAt`
 * would be fractionally EARLIER than the run that wrote it, so the next run
 * reads every product as having been absent and returned. Measured once as
 * "returned: 17090" - the entire catalogue.
 */
export async function recordRun(
  store: Store,
  total: number,
  sections: RunSection[],
  http?: RunRequestStats,
  seenAt?: Date,
  /**
   * Product ids the sitemap published, so the next run can tell a store that
   * lost products from a sitemap that came back truncated. Only pass a count
   * that was trusted: recording a bad one poisons tomorrow's comparison, which
   * would then read the recovery as a sudden enormous increase.
   */
  sitemapEntries?: number | null,
  /** how many product sitemap files the index listed, alongside the entries */
  sitemapFiles?: number | null,
  /**
   * Whether those figures were BELIEVED. Recorded either way: keeping the
   * disbelieved ones is what lets the next run tell a persistent change from a
   * one-night glitch, instead of distrusting a reorganised sitemap forever.
   */
  sitemapTrusted?: boolean | null,
  /** entries per sitemap file, so the next run can compare each against itself */
  sitemapPerFile?: { url: string; entries: number }[] | null,
  /** `<loc>` entries we could not turn into a product id; should be 0 */
  sitemapUnparseable?: number | null
) {
  await prisma.crawlRun.create({
    data: {
      store,
      total,
      startedAt: seenAt,
      requests: http?.requests ?? null,
      bytes: http?.bytes ?? null,
      wireBytes: http?.wireBytes ?? null,
      sitemapEntries: sitemapEntries ?? null,
      sitemapFiles: sitemapFiles ?? null,
      sitemapTrusted: sitemapTrusted ?? null,
      sitemapPerFile: sitemapPerFile ? JSON.stringify(sitemapPerFile) : null,
      sitemapUnparseable: sitemapUnparseable ?? null,
      fetchMs: http?.fetchMs ?? null,
      retries: http?.retries ?? null,
      sections: {
        create: sections.map((s) => ({
          cgid: s.cgid,
          label: s.label,
          collected: s.collected,
          expected: s.expected ?? null,
        })),
      },
    },
  });
}

/**
 * Compare against the previous run for this store. Returns human-readable
 * warnings, empty when nothing moved enough to care about.
 *
 * Only drops are reported. A section growing is normal - stores add products -
 * whereas a section shrinking is either real delisting or something broken, and
 * both are worth a look.
 */
export async function compareWithPrevious(
  store: Store,
  total: number,
  sections: RunSection[]
): Promise<string[]> {
  const previous = await prisma.crawlRun.findFirst({
    where: { store },
    orderBy: { startedAt: "desc" },
    include: { sections: true },
  });

  if (!previous) return [];

  const warnings: string[] = [];
  const when = previous.startedAt.toISOString().slice(0, 16).replace("T", " ");

  if (previous.total > 0 && total < previous.total * (1 - TOTAL_DROP)) {
    const lost = previous.total - total;
    warnings.push(
      `store total fell from ${previous.total} to ${total} (${lost} fewer, ` +
        `${((100 * lost) / previous.total).toFixed(1)}%) since ${when}`
    );
  }

  const before = new Map(previous.sections.map((s) => [s.cgid, s]));
  for (const section of sections) {
    const was = before.get(section.cgid);
    if (!was || was.collected === 0) continue;
    if (section.collected < was.collected * (1 - SECTION_DROP)) {
      warnings.push(
        `${section.label}: ${was.collected} to ${section.collected} ` +
          `(${((100 * (was.collected - section.collected)) / was.collected).toFixed(0)}% fewer)`
      );
    }
  }

  // A section that was crawled last time and is absent now: the category was
  // dropped from the config, or its id changed and it is being skipped.
  const now = new Set(sections.map((s) => s.cgid));
  for (const was of previous.sections) {
    if (!now.has(was.cgid)) {
      warnings.push(`${was.label} (${was.cgid}) was crawled last run and is missing from this one`);
    }
  }

  return warnings;
}

/** How many past runs a rolling baseline looks at. */
const LOOKBACK = 5;

export interface Baseline {
  /** how many past runs went into it; 0 means there is nothing to compare against */
  runs: number;
  since: Date | null;
  /** median distinct products per run */
  total: number | null;
  /** median collected per section, keyed by cgid */
  sections: Map<string, number>;
  /** median milliseconds per request */
  perRequestMs: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * A baseline built from the last several runs rather than only the previous one.
 *
 * Comparing against a single run cannot see a slow leak: a section losing 3% a
 * day for a week never trips a 20% threshold on any single day, yet ends the
 * week down a fifth. A median over several runs is also robust to one odd run -
 * a crawl that half-failed yesterday should not become the standard today's is
 * judged against.
 */
export async function rollingBaseline(store: Store, lookback = LOOKBACK): Promise<Baseline> {
  const runs = await prisma.crawlRun.findMany({
    where: { store },
    orderBy: { startedAt: "desc" },
    take: lookback,
    include: { sections: true },
  });

  const perSection = new Map<string, number[]>();
  for (const run of runs) {
    for (const section of run.sections) {
      const bucket = perSection.get(section.cgid) ?? [];
      bucket.push(section.collected);
      perSection.set(section.cgid, bucket);
    }
  }

  const perRequest = runs
    .filter((r) => r.fetchMs !== null && r.requests !== null && r.requests > 0)
    .map((r) => (r.fetchMs as number) / (r.requests as number));

  return {
    runs: runs.length,
    since: runs.length > 0 ? runs[runs.length - 1].startedAt : null,
    total: median(runs.map((r) => r.total)),
    sections: new Map(
      [...perSection].flatMap(([cgid, values]) => {
        const m = median(values);
        return m === null ? [] : [[cgid, m] as [string, number]];
      })
    ),
    perRequestMs: median(perRequest),
  };
}

/**
 * Compare this run against the rolling baseline. Same thresholds as the
 * single-run comparison, but measured against what is normal rather than
 * against whatever happened last time.
 */
export function compareWithBaseline(
  baseline: Baseline,
  total: number,
  sections: RunSection[]
): string[] {
  if (baseline.runs === 0) return [];

  const warnings: string[] = [];
  const over = `over the last ${baseline.runs} run(s)`;

  if (baseline.total !== null && total < baseline.total * (1 - TOTAL_DROP)) {
    warnings.push(
      `store total is ${total}, against a median of ${baseline.total} ${over} ` +
        `(${((100 * (baseline.total - total)) / baseline.total).toFixed(1)}% below)`
    );
  }

  for (const section of sections) {
    const usual = baseline.sections.get(section.cgid);
    if (usual === undefined || usual === 0) continue;
    if (section.collected < usual * (1 - SECTION_DROP)) {
      warnings.push(
        `${section.label}: ${section.collected}, against a median of ${usual} ${over} ` +
          `(${((100 * (usual - section.collected)) / usual).toFixed(0)}% below)`
      );
    }
  }

  return warnings;
}
