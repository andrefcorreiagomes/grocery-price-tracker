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
  bytes: number;
  fetchMs: number;
  retries: number;
}

/** Save this run so the next one has something to compare against. */
export async function recordRun(
  store: Store,
  total: number,
  sections: RunSection[],
  http?: RunRequestStats
) {
  await prisma.crawlRun.create({
    data: {
      store,
      total,
      requests: http?.requests ?? null,
      bytes: http?.bytes ?? null,
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
