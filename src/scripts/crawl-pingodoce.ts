import { prisma } from "../lib/db";
import { coverageRows, readPingoDoceDepartments } from "../scrapers/crawl/pingodoce";
import { PINGO_DOCE_FOOD_CATEGORIES } from "../scrapers/crawl/pingodoce-categories";
import { discoverPingoDoceProducts } from "../scrapers/crawl/pingodoce-sitemap";
import { formatHttpStats } from "../scrapers/http";

/**
 * Pingo Doce coverage check: does the shop think it sells more than we know
 * about?
 *
 *   npm run crawl:pingodoce
 *
 * Twenty-one requests, about twenty seconds. It fetches each food department's
 * listing page for the store's own product count, reads the sitemap for what is
 * published, and compares both against the catalogue.
 *
 * THIS IS NOT A CATALOGUE CRAWL, and this command used to be one. The old
 * version walked listing grids that Pingo Doce's robots.txt disallows on four
 * separate rules. The compliant route reads one product page at a time and
 * takes about two and a half hours:
 *
 *   npm run crawl:pingodoce:products
 *
 * What is left here is the part of the old crawler that was always the most
 * valuable and is still allowed: the published counts. A department page caps
 * its tiles at 14 and its "load more" is disallowed, so the grids can never
 * again be a census - but the number they print is exactly the yardstick a
 * census needs to be checked against.
 */

/** Top segment of a stored category path ("Talho/Porco" gives "Talho"). */
function topSection(path: string | null): string {
  return (path ?? "").split("/")[0].trim();
}

async function main() {
  console.log(`Reading ${PINGO_DOCE_FOOD_CATEGORIES.length} Pingo Doce department pages...\n`);

  const counts = await readPingoDoceDepartments();
  const sitemap = await discoverPingoDoceProducts();

  // What we hold, bucketed by department.
  //
  // Attributed by the SITEMAP's section for the product's id, not by its stored
  // `categoryPath`. That matters: 1,865 rows predate the product-page crawl and
  // still carry a bare shelf name ("Vinho Tinto") with no department above it,
  // so bucketing on the stored path alone reported 8 wines against 876 listed
  // and made every one of those departments look catastrophically short.
  // The stored path is the fallback, for a row the sitemap no longer lists.
  const slugByLabel = new Map(PINGO_DOCE_FOOD_CATEGORIES.map((d) => [d.label.toLowerCase(), d.slug]));
  const sectionById = new Map(sitemap.food.map((p) => [p.storeProductId, p.section]));
  const stored = await prisma.catalogueProduct.findMany({
    where: { store: "PINGO_DOCE", delistedAt: null },
    select: { storeProductId: true, categoryPath: true },
  });
  const heldBySlug = new Map<string, number>();
  let unattributed = 0;
  for (const row of stored) {
    const slug =
      sectionById.get(row.storeProductId) ??
      slugByLabel.get(topSection(row.categoryPath).toLowerCase());
    if (!slug) {
      unattributed++;
      continue;
    }
    heldBySlug.set(slug, (heldBySlug.get(slug) ?? 0) + 1);
  }

  // Same buckets for what the sitemap publishes, so the two independent sources
  // can be read side by side.
  const publishedBySlug = new Map<string, number>();
  for (const p of sitemap.food) {
    publishedBySlug.set(p.section, (publishedBySlug.get(p.section) ?? 0) + 1);
  }

  const rows = coverageRows(counts, heldBySlug);
  console.log(
    "department".padEnd(30) +
      "store says".padStart(11) +
      "sitemap".padStart(9) +
      "we hold".padStart(9) +
      "  gap"
  );

  let publishedTotal = 0;
  let heldTotal = 0;
  const problems: string[] = [];

  for (const row of rows) {
    const slug = PINGO_DOCE_FOOD_CATEGORIES.find((d) => d.label === row.label)?.slug ?? "";
    const inSitemap = publishedBySlug.get(slug) ?? 0;
    publishedTotal += row.published ?? 0;
    heldTotal += row.held;

    let note = "";
    if (row.error) {
      note = `  UNREADABLE (${row.error})`;
      problems.push(`${row.label}: ${row.error}`);
    } else if (row.published === null) {
      note = "  no count published";
      problems.push(`${row.label}: the page stopped publishing a count`);
    } else if (row.gap !== null && row.gap > 0) {
      // Products the shop lists that we have never collected.
      note = `  ${row.gap} not collected`;
    } else if (row.gap !== null && row.gap < 0) {
      // Not a fault: rows kept for products the department no longer lists.
      note = `  ${-row.gap} held beyond the listing`;
    }

    console.log(
      row.label.padEnd(30) +
        String(row.published ?? "-").padStart(11) +
        String(inSitemap).padStart(9) +
        String(row.held).padStart(9) +
        note
    );
  }

  console.log(
    "\n" +
      "TOTAL".padEnd(30) +
      String(publishedTotal).padStart(11) +
      String(sitemap.food.length).padStart(9) +
      String(heldTotal).padStart(9)
  );
  if (unattributed > 0) {
    console.log(
      `\n${unattributed} stored row(s) could not be attributed to a food department:` +
        `\n  the sitemap no longer lists them and their stored path is a bare shelf name.` +
        `\n  Candidates for delisting - the product-page crawl settles each one.`
    );
  }

  // The two published columns answer different questions and must not be
  // subtracted from each other. "store says" counts what the department PAGE
  // shows, cross-listed products included; "sitemap" counts products whose
  // canonical URL sits in that department. Measured, they disagree in both
  // directions - Alternativas Alimentares shows 804 against 198 published,
  // Águas 469 against 854 - so a row's gap is a prompt to look, not a fault.
  // Only a wide gap in the TOTAL means products we have genuinely never seen.
  console.log(
    "\nThe two published columns count different things: \"store says\" is what the" +
      "\ndepartment page shows including cross-listed products, \"sitemap\" is what has" +
      "\nits canonical URL there. They disagree in both directions, so read the TOTAL" +
      "\nrather than the rows - only that means products we have never seen."
  );

  const sampled = counts.reduce((n, c) => n + c.sample.length, 0);
  console.log(
    `\nDepartment pages also rendered ${sampled} product tiles - a fixed sample capped at 14 each,` +
      `\nnot a crawl. See the note in scrapers/crawl/pingodoce.ts.`
  );

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);

  if (problems.length > 0) {
    console.log(`\nWARNING: ${problems.length} department(s) could not be read:`);
    for (const p of problems) console.log(`  ${p}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
