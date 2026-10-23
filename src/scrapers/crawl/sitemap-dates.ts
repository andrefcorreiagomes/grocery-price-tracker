import { prisma } from "../../lib/db";
import type { Store } from "@/lib/stores";

/**
 * Rows written per command. Each row carries up to six values, and the
 * database refuses a command with more than about 999 (see BATCH in
 * product-checks.ts), so 100 rows at a time.
 */
const ROWS_PER_WRITE = 100;

async function inSlices<T>(rows: T[], write: (slice: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += ROWS_PER_WRITE) await write(rows.slice(i, i + ROWS_PER_WRITE));
}

/**
 * The sitemap-date test (agreed with the user on 22 October 2026).
 *
 * Continente's sitemap gives each product a "last modified" date. If that
 * date moves whenever the page changes - the price above all - the nightly
 * could skip the pages whose date has not moved, and read a fraction of the
 * 17,000 it reads now. Nobody knows yet what moves it. So every night two
 * things are kept, and compared after about a week:
 *
 *   SitemapDate  each product's date, whenever it changes
 *   PageChange   what changed on each page the run read: price, name,
 *                brand, size, shelf, promotion, regular price, barcode
 */

/** The fields of a product page that are compared night to night. */
export interface PageFields {
  price: number | null;
  name: string;
  brand: string | null;
  size: string | null;
  shelf: string | null;
  promotion: boolean | null;
  regularPrice: number | null;
  barcode: string | null;
}

const SELECT = {
  storeProductId: true,
  price: true,
  name: true,
  brand: true,
  packageSize: true,
  unit: true,
  categoryPath: true,
  onPromotion: true,
  regularPrice: true,
  ean: true,
} as const;

type Row = {
  storeProductId: string;
  price: number | null;
  name: string;
  brand: string | null;
  packageSize: number | null;
  unit: string | null;
  categoryPath: string | null;
  onPromotion: boolean | null;
  regularPrice: number | null;
  ean: string | null;
};

function fieldsOf(r: Row): PageFields {
  return {
    price: r.price,
    name: r.name,
    brand: r.brand,
    size: r.packageSize === null ? null : `${r.packageSize} ${r.unit ?? ""}`.trim(),
    shelf: r.categoryPath,
    promotion: r.onPromotion,
    regularPrice: r.regularPrice,
    barcode: r.ean,
  };
}

/** Every product's fields before the run writes over them. */
export async function pageFieldsBefore(store: Store): Promise<Map<string, PageFields>> {
  const rows = await prisma.catalogueProduct.findMany({ where: { store }, select: SELECT });
  return new Map(rows.map((r) => [r.storeProductId, fieldsOf(r)]));
}

const asText = (v: number | string | boolean | null): string | null => (v === null ? null : String(v));

/** The fields that differ, as text. Prices compared in cents. Pure, for the checks. */
export function changedFields(before: PageFields, after: PageFields): { field: string; before: string | null; after: string | null }[] {
  const out: { field: string; before: string | null; after: string | null }[] = [];
  const cents = (v: number | null) => (v === null ? null : Math.round(v * 100));
  for (const field of Object.keys(before) as (keyof PageFields)[]) {
    const a = before[field];
    const b = after[field];
    const same = field === "price" || field === "regularPrice" ? cents(a as number | null) === cents(b as number | null) : a === b;
    if (!same) out.push({ field, before: asText(a), after: asText(b) });
  }
  return out;
}

/**
 * Record what changed on every page this run read (lastSeenAt = seenAt),
 * against the fields before the run. A product new tonight has nothing to
 * compare with and is skipped. Returns the count per field.
 */
export async function recordPageChanges(
  store: Store,
  before: Map<string, PageFields>,
  seenAt: Date
): Promise<Record<string, number>> {
  const read = await prisma.catalogueProduct.findMany({ where: { store, lastSeenAt: seenAt }, select: SELECT });
  const rows: { store: string; storeProductId: string; field: string; before: string | null; after: string | null; seenAt: Date }[] = [];
  for (const r of read) {
    const was = before.get(r.storeProductId);
    if (!was) continue;
    for (const c of changedFields(was, fieldsOf(r))) rows.push({ store, storeProductId: r.storeProductId, ...c, seenAt });
  }
  await inSlices(rows, (slice) => prisma.pageChange.createMany({ data: slice }));
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.field] = (counts[r.field] ?? 0) + 1;
  return counts;
}

/**
 * Record each product's sitemap date when it is new or differs from the last
 * one recorded. Returns how many products got a new date tonight and how many
 * were seen for the first time.
 */
export async function recordSitemapDates(
  store: Store,
  lastmod: Map<string, number>,
  seenAt: Date
): Promise<{ changed: number; first: number }> {
  if (lastmod.size === 0) return { changed: 0, first: 0 };
  const latest = new Map<string, number>();
  for (const r of await prisma.sitemapDate.findMany({ where: { store }, select: { storeProductId: true, lastmod: true } })) {
    const t = r.lastmod.getTime();
    if ((latest.get(r.storeProductId) ?? -Infinity) < t) latest.set(r.storeProductId, t);
  }
  const rows: { store: string; storeProductId: string; lastmod: Date; firstSeenAt: Date }[] = [];
  let changed = 0;
  let first = 0;
  for (const [storeProductId, when] of lastmod) {
    const was = latest.get(storeProductId);
    if (was === when) continue;
    if (was === undefined) first++;
    else changed++;
    rows.push({ store, storeProductId, lastmod: new Date(when), firstSeenAt: seenAt });
  }
  await inSlices(rows, (slice) => prisma.sitemapDate.createMany({ data: slice }));
  return { changed, first };
}
