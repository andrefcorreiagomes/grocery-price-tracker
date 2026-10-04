import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { matchesTerm, stripAccents } from "../lib/matching";

/**
 * Find a product across the three chains by searching OUR OWN catalogue.
 *
 *   npm run discover -- carapau
 *   npm run discover -- "iogurte natural"
 *
 * No request to any store. This replaced searching the stores' own search
 * pages, which Continente's and Pingo Doce's robots.txt forbid and Auchan's
 * evidently means to - the first version of the product-discovery skill did
 * exactly that, written before the crawlers were made compliant. Once the
 * catalogue held every product the crawlers had read, searching it became both
 * the compliant route and the better one: every store is searched to the same
 * depth, results come with sizes and barcodes, and a URL in the results is one
 * a crawler actually reached rather than one reconstructed from a name.
 *
 * Matching is by whole words - see `matchesTerm` in src/lib/matching.ts.
 *
 * Writes every hit to logs/discover-<term>.json - the record a proposed group
 * is checked against - and prints a table per store. The catalogue is only as
 * current as the last crawl, so each store's freshness is printed first.
 */

const STORES = ["CONTINENTE", "PINGO_DOCE", "AUCHAN"] as const;

async function main() {
  const term = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!term) {
    console.error('usage: npm run discover -- <term>      e.g. npm run discover -- "iogurte natural"');
    process.exit(1);
  }

  const rows = await prisma.catalogueProduct.findMany({
    where: { delistedAt: null },
    select: {
      store: true, storeProductId: true, name: true, brand: true, price: true,
      packageSize: true, unit: true, ean: true, eanNormalized: true,
      categoryPath: true, url: true, foodType: true, lastSeenAt: true,
    },
  });

  const hits = rows
    .filter((r) => matchesTerm(r.name, term))
    .map((r) => ({
      ...r,
      unitPrice:
        r.price !== null && r.packageSize ? Math.round((r.price / r.packageSize) * 100) / 100 : null,
    }));

  console.log(`"${term}": ${hits.length} products in the catalogue\n`);
  for (const store of STORES) {
    const all = rows.filter((r) => r.store === store);
    const newest = all.reduce<Date | null>((m, r) => (!m || r.lastSeenAt > m ? r.lastSeenAt : m), null);
    const mine = hits
      .filter((h) => h.store === store)
      .sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity));
    console.log(
      `${store}: ${mine.length} found  (catalogue last crawled ${newest?.toISOString().slice(0, 10) ?? "never"})`
    );
    if (mine.length > 0) {
      console.table(
        mine.map((h) => ({
          id: h.storeProductId,
          name: h.name.slice(0, 55),
          brand: h.brand ?? "",
          price: h.price,
          size: h.packageSize !== null ? `${h.packageSize} ${h.unit}` : "unknown",
          "per kg/l": h.unitPrice,
          ean: h.eanNormalized ?? "",
        }))
      );
    }
  }

  const slug = stripAccents(term).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const out = path.join("logs", `discover-${slug}.json`);
  fs.mkdirSync("logs", { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ term, searchedAt: new Date(), hits }, null, 2));
  console.log(`\nevery hit, with its URL and category: ${out}`);
}

main().finally(() => prisma.$disconnect());
