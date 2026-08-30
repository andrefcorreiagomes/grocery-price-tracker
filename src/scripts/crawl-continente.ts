import { prisma } from "../lib/db";
import {
  CONTINENTE_FOOD_SECTIONS,
  auditCategories,
  auditCategorySlugs,
  discoverCategories,
  discoverCategorySlugs,
  fetchPublishedCounts,
  type CategoryAudit,
} from "../scrapers/crawl/continente-categories";
import { formatHttpStats } from "../scrapers/http";

/**
 * Continente coverage check: does the shop think it sells more than we know
 * about, and has a new food section appeared that nobody told us to crawl?
 *
 *   npm run crawl:continente
 *
 * About a dozen requests. Every one of them is a route robots.txt invites - the
 * section landing pages, the published category tree, the category sitemap.
 *
 * THIS IS NOT A CATALOGUE CRAWL, and this command used to be one. The old
 * version walked listing grids whose URL Continente disallows on `?cgid` and
 * `&sz`. That route was kept on purpose as a fast option, but being the thing
 * `crawl:all` and this script both called by default is what made "choose
 * deliberately" stop meaning anything.
 *
 * The catalogue now comes from one product page at a time:
 *
 *   npm run crawl:continente:nightly     orchestrated, with reports and history
 *   npm run crawl:continente:products    the bare crawl
 *
 * What is left here is the part of the old script that was always compliant and
 * is the most useful per request: the store's own numbers, and the audit that
 * catches a section appearing that we would otherwise never ask for.
 */

/** Top segment of a stored category path ("Frescos/Frutas" gives "Frescos"). */
function topSection(path: string | null): string {
  return (path ?? "").split("/")[0].trim();
}

async function main() {
  console.log("Reading Continente's published counts and category tree...\n");

  // The store's own product count per section, off each landing page.
  let published = new Map<string, number>();
  try {
    published = await fetchPublishedCounts();
  } catch (error) {
    console.error(`could not read the section landing pages: ${(error as Error).message}`);
  }

  // A category that vanished or was renamed fails loudly elsewhere; this catches
  // the opposite and quieter case - a food department appearing that nobody told
  // us about, which we would simply never ask for.
  let audit: CategoryAudit | null = null;
  try {
    audit = auditCategories(await discoverCategories());
  } catch (error) {
    console.error(`could not read the published category tree: ${(error as Error).message}`);
  }

  // Second, independent source. Cheap, invited by robots.txt, and it sees
  // sub-categories the homepage nav does not.
  let sitemapUnknown: string[] = [];
  try {
    sitemapUnknown = auditCategorySlugs(await discoverCategorySlugs());
  } catch (error) {
    console.error(`could not read the category sitemap: ${(error as Error).message}`);
  }

  const stored = await prisma.catalogueProduct.findMany({
    where: { store: "CONTINENTE", delistedAt: null },
    select: { categoryPath: true },
  });
  const held = new Map<string, number>();
  let outsideFood = 0;
  for (const row of stored) {
    const section = topSection(row.categoryPath);
    if (!CONTINENTE_FOOD_SECTIONS.has(section)) {
      outsideFood++;
      continue;
    }
    held.set(section, (held.get(section) ?? 0) + 1);
  }

  console.log("section".padEnd(24) + "store says".padStart(11) + "we hold".padStart(9) + "  gap");
  let publishedTotal = 0;
  let heldTotal = 0;
  for (const section of CONTINENTE_FOOD_SECTIONS) {
    const store = published.get(section) ?? null;
    const ours = held.get(section) ?? 0;
    publishedTotal += store ?? 0;
    heldTotal += ours;

    let note = "";
    if (store === null) note = "  no count published";
    else if (store - ours > 0) note = `  ${store - ours} not collected`;
    else if (store - ours < 0) note = `  ${ours - store} held beyond the listing`;

    console.log(
      section.padEnd(24) + String(store ?? "-").padStart(11) + String(ours).padStart(9) + note
    );
  }
  console.log(
    "\n" + "TOTAL".padEnd(24) + String(publishedTotal).padStart(11) + String(heldTotal).padStart(9)
  );

  // Sections overlap - an organic rice sits in both Mercearia and Bio e Saudável
  // - and each product is filed under whichever section listed it first. So the
  // rows are not comparable one to one; only the total means anything.
  console.log(
    "\nSections overlap, and each product is filed under the FIRST that listed it," +
      "\nso read the total rather than the rows."
  );
  if (outsideFood > 0) {
    console.log(`\n${outsideFood} stored row(s) sit outside the food sections.`);
  }

  if (audit) {
    if (audit.unknown.length > 0) {
      console.log(`\nWARNING: ${audit.unknown.length} published categor(ies) we do not crawl:`);
      for (const c of audit.unknown.slice(0, 15)) console.log(`  ${c.cgid}  ${c.label}`);
    }
    if (audit.missing.length > 0) {
      console.log(`\nWARNING: ${audit.missing.length} configured categor(ies) Continente no longer publishes:`);
      for (const cgid of audit.missing) console.log(`  ${cgid}`);
    }
    if (audit.unknown.length === 0 && audit.missing.length === 0) {
      console.log("\nCategory tree matches what we are configured to crawl.");
    }
  }
  if (sitemapUnknown.length > 0) {
    console.log(`\n${sitemapUnknown.length} category slug(s) in the sitemap that the nav does not show:`);
    for (const slug of sitemapUnknown.slice(0, 15)) console.log(`  ${slug}`);
  }

  console.log("\nrequests:");
  for (const line of formatHttpStats()) console.log(line);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
