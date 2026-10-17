import { prisma } from "../../lib/db";
import type { KeepDecision } from "../../lib/catalogue-filter";
import { sectionKey, topSectionKind } from "../../lib/store-sections";
import type { Store } from "@/lib/stores";
import type { SectionKind } from "../../../data/store-sections";

/**
 * Watching each store's sections from one crawl to the next.
 *
 * A store can open a new aisle at any time - a new department, or a
 * supplements shelf inside a food section - and nothing about a crawl that
 * quietly keeps or drops it says so. Every crawl now records the sections it
 * saw in the StoreSection table and reports:
 *
 *   - top sections data/store-sections.ts does not decide (left out until it does)
 *   - sections never seen before, with an example product
 *   - sections the previous crawl saw and this one did not
 *   - what the rules left out this time, by reason
 *
 * Sub-sections are recorded only under food and mixed sections, three levels
 * down at most: deep enough to catch "Nutrição Desportiva/Energia e Proteína",
 * shallow enough that a store reshuffling its smallest shelves is not news.
 */

export const SECTION_DEPTH = 3;

export interface SectionSeen {
  /** in compared form, "mercearia/suplementos-e-vitaminas" */
  path: string;
  /** as the store wrote it */
  label: string;
  depth: number;
  /** null when the source lists sections rather than products */
  products: number | null;
  example: string | null;
}

/** Collects the sections one crawl sees. */
export class SectionTally {
  private readonly seen = new Map<string, SectionSeen>();

  constructor(
    private readonly store: Store,
    /** false for a source that lists sections, not products (a category sitemap) */
    private readonly countsProducts = true
  ) {}

  /** One product filed at `categoryPath` - or, for a list of sections, one section. */
  add(categoryPath: string | null, example: string | null = null): void {
    const parts = (categoryPath ?? "")
      .split(/[/>]/)
      .map((label) => ({ label: label.trim(), key: sectionKey(label) }))
      .filter((p) => p.key !== "");
    if (parts.length === 0) return;

    const top = topSectionKind(this.store, parts[0].key);
    for (let depth = 1; depth <= Math.min(SECTION_DEPTH, parts.length); depth++) {
      if (depth >= 2 && top !== "food" && top !== "mixed") break;
      const path = parts.slice(0, depth).map((p) => p.key).join("/");
      let row = this.seen.get(path);
      if (!row) {
        row = {
          path,
          label: parts.slice(0, depth).map((p) => p.label).join("/"),
          depth,
          products: this.countsProducts ? 0 : null,
          example: null,
        };
        this.seen.set(path, row);
      }
      if (row.products !== null) row.products++;
      if (row.example === null && example) row.example = example;
    }
  }

  get entries(): SectionSeen[] {
    return [...this.seen.values()];
  }
}

export interface SectionChanges {
  /** nothing was recorded for this store before, so nothing can be called new */
  firstRun: boolean;
  /** how many sections this crawl saw */
  seen: number;
  /** top sections the decisions file does not mention */
  undecided: SectionSeen[];
  /** never seen before this crawl, with the decision for their top section */
  added: (SectionSeen & { kind: SectionKind | "undecided" })[];
  /** seen by the previous crawl and not by this one */
  vanished: { path: string; label: string; depth: number; kind: SectionKind | "undecided" }[];
}

interface PreviousSection {
  path: string;
  label: string;
  depth: number;
  lastSeenAt: Date;
}

/**
 * Compare one crawl's sections with what was recorded before. Pure.
 *
 * "Vanished" compares against the most recent crawl only: a section it saw and
 * this one did not. Only a COMPLETE view of the store can say a section is gone
 * - a partial crawl simply has not reached it - so `complete` false reports
 * nothing as vanished.
 */
export function compareSections(
  store: Store,
  previous: PreviousSection[],
  seen: SectionSeen[],
  complete: boolean
): SectionChanges {
  const kindOf = (path: string): SectionKind | "undecided" =>
    topSectionKind(store, path.split("/")[0]) ?? "undecided";
  const before = new Set(previous.map((p) => p.path));
  const now = new Set(seen.map((s) => s.path));
  const firstRun = previous.length === 0;

  const last = previous.reduce((t, p) => Math.max(t, p.lastSeenAt.getTime()), 0);
  const vanished =
    complete && !firstRun
      ? previous
          .filter((p) => p.lastSeenAt.getTime() === last && !now.has(p.path))
          .map((p) => ({ path: p.path, label: p.label, depth: p.depth, kind: kindOf(p.path) }))
      : [];

  return {
    firstRun,
    seen: seen.length,
    undecided: seen.filter((s) => s.depth === 1 && topSectionKind(store, s.path) === undefined),
    added: firstRun ? [] : seen.filter((s) => !before.has(s.path)).map((s) => ({ ...s, kind: kindOf(s.path) })),
    vanished,
  };
}

/** Record what a crawl saw, and say what changed. */
export async function recordSections(
  store: Store,
  tally: SectionTally,
  seenAt: Date,
  complete: boolean
): Promise<SectionChanges> {
  const previous = await prisma.storeSection.findMany({
    where: { store },
    select: { path: true, label: true, depth: true, lastSeenAt: true },
  });
  const seen = tally.entries;
  const changes = compareSections(store, previous, seen, complete);

  for (let i = 0; i < seen.length; i += 500) {
    await prisma.$transaction(
      seen.slice(i, i + 500).map((s) =>
        prisma.storeSection.upsert({
          where: { store_path: { store, path: s.path } },
          create: { store, ...s, firstSeenAt: seenAt, lastSeenAt: seenAt },
          update: { label: s.label, products: s.products, example: s.example, lastSeenAt: seenAt },
        })
      )
    );
  }
  return changes;
}

/**
 * What the keep rule left out during one crawl from food and mixed sections, by
 * reason: skipped sub-sections, and mixed-aisle products not recognised as food.
 */
export class LeftOutTally {
  private readonly byReason = new Map<string, { count: number; examples: string[] }>();

  add(decision: KeepDecision, name: string, categoryPath: string | null): void {
    // Non-food and undecided sections are counted elsewhere: a non-food section
    // is the bulk of a store and not news, an undecided one is reported as such.
    if (decision.keep || decision.reason === "non-food section" || decision.reason === "unknown section") return;
    const reason = decision.reason === "skipped sub-section" ? `skipped: ${decision.detail}` : decision.reason;
    const row = this.byReason.get(reason) ?? { count: 0, examples: [] };
    row.count++;
    if (row.examples.length < 3) row.examples.push(`${name.slice(0, 40)} (${categoryPath ?? "no section"})`);
    this.byReason.set(reason, row);
  }

  get total(): number {
    return [...this.byReason.values()].reduce((n, r) => n + r.count, 0);
  }

  lines(): string[] {
    return [...this.byReason]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([reason, r]) => `- ${reason}: ${r.count}, e.g. ${r.examples.join("; ")}`);
  }
}

const KIND_WORDS: Record<SectionKind | "undecided", string> = {
  food: "food section",
  mixed: "mixed aisle",
  "non-food": "non-food",
  undecided: "NOT DECIDED",
};

function describe(s: { label: string; products?: number | null; example?: string | null }): string {
  const count = s.products == null ? "" : `, ${s.products} product(s)`;
  const example = s.example ? `, e.g. "${s.example.slice(0, 50)}"` : "";
  return `${s.label}${count}${example}`;
}

/** The report's "Store sections" lines. */
export function sectionLines(changes: SectionChanges, leftOut?: LeftOutTally): string[] {
  const lines: string[] = [];
  if (changes.firstRun) {
    lines.push(
      `First record of this store's sections: ${changes.seen} remembered. From the next crawl on, new and vanished sections are listed here.`
    );
  }
  if (changes.undecided.length > 0) {
    lines.push("Top sections data/store-sections.ts does not decide - left out until it does:");
    for (const s of changes.undecided) lines.push(`- ${describe(s)}`);
  }
  if (changes.added.length > 0) {
    lines.push("New since the last crawl:");
    for (const s of changes.added) lines.push(`- ${describe(s)} [${KIND_WORDS[s.kind]}]`);
  }
  if (changes.vanished.length > 0) {
    lines.push("Shown by the last crawl, not by this one:");
    for (const s of changes.vanished) lines.push(`- ${s.label} [${KIND_WORDS[s.kind]}]`);
  }
  if (!changes.firstRun && changes.undecided.length + changes.added.length + changes.vanished.length === 0) {
    lines.push(`No section changes (${changes.seen} sections seen).`);
  }
  if (leftOut && leftOut.total > 0) {
    lines.push(`Left out by data/store-sections.ts this crawl: ${leftOut.total}`);
    lines.push(...leftOut.lines());
  }
  return lines;
}

/**
 * What should turn the report to WARN. A new or undecided section is a
 * decision someone has to make, so it is not left as a footnote; a new
 * non-food section, or a vanished sub-section, is only listed.
 */
export function sectionProblems(changes: SectionChanges): string[] {
  const problems: string[] = [];
  if (changes.undecided.length > 0) {
    problems.push(
      `${changes.undecided.length} top section(s) not decided in data/store-sections.ts: ` +
        changes.undecided.map((s) => s.label).join(", ")
    );
  }
  const worthDeciding = changes.added.filter((s) => s.kind === "food" || s.kind === "mixed");
  if (worthDeciding.length > 0) {
    problems.push(
      `${worthDeciding.length} new section(s) inside food or mixed sections - check they hold food: ` +
        worthDeciding.slice(0, 5).map((s) => s.label).join(", ") +
        (worthDeciding.length > 5 ? ", ..." : "")
    );
  }
  const goneFood = changes.vanished.filter((s) => s.depth === 1 && s.kind === "food");
  if (goneFood.length > 0) {
    problems.push(`food section(s) no longer shown: ${goneFood.map((s) => s.label).join(", ")}`);
  }
  return problems;
}
